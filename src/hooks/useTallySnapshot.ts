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
    supabase.from('v_tally_sales').select(voucherCols).order('voucher_date', { ascending: false }).limit(5000),
    supabase.from('v_tally_purchases').select(voucherCols).order('voucher_date', { ascending: false }).limit(5000),
    supabase.from('v_tally_receipts').select(voucherCols).order('voucher_date', { ascending: true }).limit(5000),
    supabase.from('v_tally_bank_txns').select('id,company,kind,voucher_type,voucher_number,voucher_date,party_name,amount,bank_ledger,bank_amount,bank_is_debit').order('voucher_date', { ascending: false }).limit(5000),
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

  const companies = Array.from(new Set([
    ...debtors.map(d => d.company),
    ...creditors.map(d => d.company),
    ...banks.map(d => d.company),
    ...sales.map(d => d.company),
    ...purchases.map(d => d.company),
  ]));

  return { debtors, creditors, banks, sales, purchases, receipts, bankTxns, billRefs, overrides, lastRun, companies };
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
