// Auto-upsert debtors from tally_vouchers Sales after sync.
// Called from TallySyncPage onSuccess.
import { supabase } from '@/integrations/supabase/client';

export async function upsertDebtorsFromSales() {
  try {
    // Pull distinct (company_name, party_name) from Sales vouchers
    const { data, error } = await supabase
      .from('tally_vouchers')
      .select('company_name, party_name')
      .eq('voucher_type', 'Sales')
      .not('party_name', 'is', null);
    if (error || !data) return;

    const seen = new Set<string>();
    const rows: { company_name: string; ledger_name: string }[] = [];
    data.forEach((v: any) => {
      const key = `${v.company_name}::${v.party_name}`;
      if (!seen.has(key) && v.party_name) {
        seen.add(key);
        rows.push({ company_name: v.company_name, ledger_name: v.party_name });
      }
    });
    if (rows.length === 0) return;

    // Upsert in batches; ON CONFLICT DO NOTHING via ignoreDuplicates so we never overwrite credit_period_days
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await supabase
        .from('debtor_master')
        .upsert(chunk, { onConflict: 'company_name,ledger_name', ignoreDuplicates: true });
    }
  } catch (e) {
    console.error('upsertDebtorsFromSales failed:', e);
  }
}
