import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SnapshotLedger = {
  company: string;
  name: string;
  parent_group: string | null;
  parent_chain?: string[] | null;
  root_group?: string | null;
  closing_balance: number;
  mailing_name?: string | null;
  address?: string | null;
  gstin?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type SnapshotBank = {
  company: string;
  name: string;
  closing_balance: number;
};

export type SnapshotVoucher = {
  id: string;
  company: string;
  kind: 'sales' | 'purchase' | 'receipt' | 'payment' | 'contra' | 'journal';
  voucher_type: string | null;
  voucher_number: string | null;
  voucher_date: string | null;
  party_name: string | null;
  amount: number;
  items?: { stock_item: string | null; qty: number; rate: number; amount: number }[];
};

export type SnapshotBankTxn = {
  id: string;
  company: string;
  kind: string;
  voucher_type: string | null;
  voucher_number: string | null;
  voucher_date: string | null;
  party_name: string | null;
  amount: number;
  bank_ledger: string;
  bank_amount: number;
  bank_is_debit: boolean;
};

export type SnapshotBillRef = {
  voucher_id: string;
  ledger_name: string;
  bill_name: string | null;
  bill_type: string | null;
  amount: number;
};

/**
 * A credit-side ledger entry against a debtor (any voucher kind: receipt, journal, contra, payment).
 * Represents money / adjustment that reduces the receivable, used for FIFO payment matching.
 */
export type SnapshotDebtorCredit = {
  voucher_id: string;
  company: string;
  kind: string;
  voucher_date: string | null;
  voucher_number: string | null;
  ledger_name: string;       // the debtor ledger that was credited
  amount: number;            // positive = credit reducing receivable
};

export type DebtorOverride = {
  id?: string;
  company: string;
  ledger_name: string;
  credit_period_days: number | null;
  sales_rep: string | null;
  notes: string | null;
};

export type SyncRunSummary = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  triggered_by_email: string | null;
  counts: Record<string, Record<string, number>>;
  errors: { company: string; dataset: string; error: string }[];
};

export type TallySnapshot = {
  debtors: SnapshotLedger[];
  creditors: SnapshotLedger[];
  banks: SnapshotLedger[];
  sales: SnapshotVoucher[];
  purchases: SnapshotVoucher[];
  receipts: SnapshotVoucher[];
  bankTxns: SnapshotBankTxn[];
  billRefs: SnapshotBillRef[];
  debtorCredits: SnapshotDebtorCredit[];
  overrides: DebtorOverride[];
  lastRun: SyncRunSummary | null;
  companies: string[];
};

async function fetchSnapshot(): Promise<TallySnapshot> {
  const ledgerCols = 'company,name,parent_group,parent_chain,root_group,closing_balance,mailing_name,address,gstin,contact_person,phone,email';
  const voucherCols = 'id,company,kind,voucher_type,voucher_number,voucher_date,party_name,amount';

  const [
    debtorsRes, creditorsRes, banksRes,
    salesRes, purchasesRes, receiptsRes,
    bankTxnsRes, lastRunRes, overridesRes,
  ] = await Promise.all([
    supabase.from('v_tally_debtors').select(ledgerCols).order('closing_balance', { ascending: false }),
    supabase.from('v_tally_creditors').select(ledgerCols).order('closing_balance', { ascending: false }),
    supabase.from('v_tally_banks').select(ledgerCols).order('closing_balance', { ascending: false }),
    // For overdue calc we need ALL historical invoices/receipts — order ascending
    // and use a high cap so the oldest data is never silently truncated.
    supabase.from('v_tally_sales').select(voucherCols).order('voucher_date', { ascending: true }).limit(50000),
    supabase.from('v_tally_purchases').select(voucherCols).order('voucher_date', { ascending: true }).limit(50000),
    supabase.from('v_tally_receipts').select(voucherCols).order('voucher_date', { ascending: true }).limit(50000),
    supabase.from('v_tally_bank_txns').select('id,company,kind,voucher_type,voucher_number,voucher_date,party_name,amount,bank_ledger,bank_amount,bank_is_debit').order('voucher_date', { ascending: false }).limit(50000),
    supabase.from('tally_sync_runs').select('id,started_at,finished_at,status,triggered_by_email,counts,errors').order('started_at', { ascending: false }).limit(1),
    supabase.from('tally_debtor_overrides').select('id,company,ledger_name,credit_period_days,sales_rep,notes'),
  ]);

  const errs = [debtorsRes, creditorsRes, banksRes, salesRes, purchasesRes, receiptsRes, bankTxnsRes, lastRunRes, overridesRes].find(r => r.error);
  if (errs?.error) throw new Error(errs.error.message);

  const debtors = (debtorsRes.data || []) as SnapshotLedger[];
  const creditors = (creditorsRes.data || []) as SnapshotLedger[];
  const banks = (banksRes.data || []) as SnapshotLedger[];
  const sales = (salesRes.data || []) as SnapshotVoucher[];
  const purchases = (purchasesRes.data || []) as SnapshotVoucher[];
  const receipts = (receiptsRes.data || []) as SnapshotVoucher[];
  const bankTxns = (bankTxnsRes.data || []) as SnapshotBankTxn[];
  const overrides = (overridesRes.data || []) as DebtorOverride[];
  const lastRun = (lastRunRes.data?.[0] as SyncRunSummary) || null;

  // Pull bill refs for receipts in a second query (only those receipt voucher ids)
  const receiptIds = receipts.map(r => r.id);
  let billRefs: SnapshotBillRef[] = [];
  if (receiptIds.length) {
    // Chunk to avoid URL-too-long
    const chunks: string[][] = [];
    for (let i = 0; i < receiptIds.length; i += 500) chunks.push(receiptIds.slice(i, i + 500));
    const results = await Promise.all(chunks.map(c =>
      supabase.from('tally_voucher_bill_refs').select('voucher_id,ledger_name,bill_name,bill_type,amount').in('voucher_id', c)
    ));
    billRefs = results.flatMap(r => (r.data || []) as SnapshotBillRef[]);
  }

  // Pull all CREDIT-side ledger entries against any debtor ledger across ALL voucher kinds
  // (receipt / journal / contra / payment / etc.). These represent money or adjustments
  // that reduce the receivable and feed the FIFO payment matcher.
  let debtorCredits: SnapshotDebtorCredit[] = [];
  if (debtors.length) {
    const debtorKeySet = new Set(debtors.map(d => `${d.company}__${d.name.toLowerCase()}`));
    const debtorNames = Array.from(new Set(debtors.map(d => d.name)));
    // Chunk by ledger_name (some lists may be large)
    const nameChunks: string[][] = [];
    for (let i = 0; i < debtorNames.length; i += 200) nameChunks.push(debtorNames.slice(i, i + 200));
    const entryResults = await Promise.all(nameChunks.map(c =>
      supabase.from('tally_voucher_ledger_entries')
        .select('voucher_id,ledger_name,amount,is_debit')
        .in('ledger_name', c)
        .eq('is_debit', false)
        .limit(20000)
    ));
    const rawEntries = entryResults.flatMap(r => (r.data || []) as { voucher_id: string; ledger_name: string; amount: number; is_debit: boolean }[]);
    const voucherIds = Array.from(new Set(rawEntries.map(e => e.voucher_id)));
    // Fetch voucher metadata for these entries
    const vChunks: string[][] = [];
    for (let i = 0; i < voucherIds.length; i += 500) vChunks.push(voucherIds.slice(i, i + 500));
    const vRes = await Promise.all(vChunks.map(c =>
      supabase.from('tally_vouchers')
        .select('id,company,kind,voucher_date,voucher_number,is_cancelled')
        .in('id', c)
    ));
    const vMap = new Map<string, { company: string; kind: string; voucher_date: string | null; voucher_number: string | null; is_cancelled: boolean | null }>();
    vRes.flatMap(r => (r.data || [])).forEach((v: any) => vMap.set(v.id, v));
    debtorCredits = rawEntries
      .map(e => {
        const v = vMap.get(e.voucher_id);
        if (!v || v.is_cancelled) return null;
        // Ensure (company, ledger_name) is actually a debtor pair (avoid same-named ledgers in other companies)
        if (!debtorKeySet.has(`${v.company}__${e.ledger_name.toLowerCase()}`)) return null;
        return {
          voucher_id: e.voucher_id,
          company: v.company,
          kind: v.kind,
          voucher_date: v.voucher_date,
          voucher_number: v.voucher_number,
          ledger_name: e.ledger_name,
          amount: Math.abs(e.amount),
        } as SnapshotDebtorCredit;
      })
      .filter((x): x is SnapshotDebtorCredit => !!x);
  }

  const companies = Array.from(new Set([
    ...debtors.map(d => d.company),
    ...creditors.map(d => d.company),
    ...banks.map(d => d.company),
    ...sales.map(d => d.company),
    ...purchases.map(d => d.company),
  ]));

  return { debtors, creditors, banks, sales, purchases, receipts, bankTxns, billRefs, debtorCredits, overrides, lastRun, companies };
}

export function useTallySnapshot() {
  return useQuery({
    queryKey: ['tally-snapshot'],
    queryFn: fetchSnapshot,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}
