// Auto-upsert debtors and auto-populate Sales Reps after every Tally sync.
// Called from TallySyncPage onSuccess.
import { supabase } from '@/integrations/supabase/client';

// Generic Tally group names that are NOT real sales reps — never auto-create these.
const NON_REP_GROUPS = new Set([
  'Sundry Debtors',
  'Sundry Creditors',
  'Retail Debtors - Gzb',
  'Resin Debtors',
  'Sundry Debtors TMT Bars',
  'Brokerage on Sales',
]);

export async function upsertDebtorsFromSales() {
  try {
    // 1) Seed debtor_master from Sales vouchers (preserves existing rows; sets nothing else).
    const { data: vouchers } = await supabase
      .from('tally_vouchers')
      .select('company_name, party_name')
      .eq('voucher_type', 'Sales')
      .not('party_name', 'is', null);

    const seen = new Set<string>();
    const voucherRows: { company_name: string; ledger_name: string }[] = [];
    (vouchers ?? []).forEach((v: any) => {
      const key = `${v.company_name}::${v.party_name}`;
      if (!seen.has(key) && v.party_name) {
        seen.add(key);
        voucherRows.push({ company_name: v.company_name, ledger_name: v.party_name });
      }
    });
    for (let i = 0; i < voucherRows.length; i += 500) {
      await supabase
        .from('debtor_master')
        .upsert(voucherRows.slice(i, i + 500), { onConflict: 'company_name,ledger_name', ignoreDuplicates: true });
    }

    // 2) Pull latest ledger snapshot per (company, ledger) for Sundry Debtors.
    const { data: ledgers } = await supabase
      .from('tally_ledger_balances')
      .select('company_name, ledger_name, ledger_group, ultimate_group, as_of_date')
      .eq('ultimate_group', 'Sundry Debtors')
      .order('as_of_date', { ascending: false });

    const latestByKey = new Map<string, { company_name: string; ledger_name: string; ledger_group: string | null }>();
    (ledgers ?? []).forEach((r: any) => {
      const k = `${r.company_name}::${r.ledger_name}`;
      if (!latestByKey.has(k)) {
        latestByKey.set(k, {
          company_name: r.company_name,
          ledger_name: r.ledger_name,
          ledger_group: r.ledger_group,
        });
      }
    });
    const latest = Array.from(latestByKey.values());

    // 3) Ensure all latest debtors exist in debtor_master.
    const ledgerRows = latest.map(l => ({
      company_name: l.company_name,
      ledger_name: l.ledger_name,
      is_active: true,
    }));
    for (let i = 0; i < ledgerRows.length; i += 500) {
      await supabase
        .from('debtor_master')
        .upsert(ledgerRows.slice(i, i + 500), { onConflict: 'company_name,ledger_name', ignoreDuplicates: true });
    }

    // 4) Auto-create sales_reps from non-generic ledger_group values.
    const { data: existingReps } = await supabase.from('sales_reps').select('name');
    const repsLower = new Set((existingReps ?? []).map((r: any) => String(r.name).toLowerCase()));

    const newRepNames = new Set<string>();
    latest.forEach(l => {
      const g = (l.ledger_group ?? '').trim();
      if (!g) return;
      if (NON_REP_GROUPS.has(g)) return;
      if (repsLower.has(g.toLowerCase())) return;
      newRepNames.add(g);
    });
    if (newRepNames.size > 0) {
      const repInserts = Array.from(newRepNames).map(name => ({ name, is_active: true }));
      await supabase.from('sales_reps').insert(repInserts);
      // refresh known reps
      repInserts.forEach(r => repsLower.add(r.name.toLowerCase()));
    }

    // 5) Auto-set sales_rep on debtor_master rows where it is NULL.
    //    Only set if ledger_group resolves to a known sales rep. Never overwrite existing values.
    const { data: dmRows } = await supabase
      .from('debtor_master')
      .select('id, company_name, ledger_name, sales_rep')
      .is('sales_rep', null);
    const dmByKey = new Map<string, string>();
    (dmRows ?? []).forEach((d: any) => dmByKey.set(`${d.company_name}::${d.ledger_name}`, d.id));

    const updates: { id: string; sales_rep: string }[] = [];
    latest.forEach(l => {
      const g = (l.ledger_group ?? '').trim();
      if (!g || NON_REP_GROUPS.has(g)) return;
      if (!repsLower.has(g.toLowerCase())) return;
      const id = dmByKey.get(`${l.company_name}::${l.ledger_name}`);
      if (!id) return;
      updates.push({ id, sales_rep: g });
    });

    // Apply updates one-by-one (Supabase JS doesn't bulk-update with different values).
    // Chunk concurrently for speed.
    const chunkSize = 25;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(u =>
          supabase
            .from('debtor_master')
            .update({ sales_rep: u.sales_rep })
            .eq('id', u.id)
            .is('sales_rep', null), // extra safety: never overwrite
        ),
      );
    }
  } catch (e) {
    console.error('upsertDebtorsFromSales failed:', e);
  }
}
