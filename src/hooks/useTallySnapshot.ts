import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SnapshotDebtor = {
  company: string;
  name: string;
  parent_group: string | null;
  closing_balance: number;
};

export type SnapshotBank = {
  company: string;
  name: string;
  closing_balance: number;
};

export type SnapshotVoucher = {
  id: string;
  company: string;
  kind: 'sales' | 'purchase';
  voucher_type: string | null;
  voucher_number: string | null;
  voucher_date: string | null;
  party_name: string | null;
  amount: number;
  items?: { stock_item: string | null; qty: number; rate: number; amount: number }[];
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
  debtors: SnapshotDebtor[];
  creditors: SnapshotDebtor[];
  banks: SnapshotBank[];
  sales: SnapshotVoucher[];
  purchases: SnapshotVoucher[];
  lastRun: SyncRunSummary | null;
  companies: string[];
};

async function fetchSnapshot(): Promise<TallySnapshot> {
  const [debtorsRes, creditorsRes, banksRes, salesRes, purchasesRes, lastRunRes] = await Promise.all([
    supabase.from('v_tally_debtors').select('company,name,parent_group,closing_balance').order('closing_balance', { ascending: false }),
    supabase.from('v_tally_creditors').select('company,name,parent_group,closing_balance').order('closing_balance', { ascending: false }),
    supabase.from('v_tally_banks').select('company,name,closing_balance').order('closing_balance', { ascending: false }),
    supabase.from('v_tally_sales').select('id,company,kind,voucher_type,voucher_number,voucher_date,party_name,amount').order('voucher_date', { ascending: false }).limit(2000),
    supabase.from('v_tally_purchases').select('id,company,kind,voucher_type,voucher_number,voucher_date,party_name,amount').order('voucher_date', { ascending: false }).limit(2000),
    supabase.from('tally_sync_runs').select('id,started_at,finished_at,status,triggered_by_email,counts,errors').order('started_at', { ascending: false }).limit(1),
  ]);

  const errors = [debtorsRes, creditorsRes, banksRes, salesRes, purchasesRes, lastRunRes].find(r => r.error);
  if (errors?.error) throw new Error(errors.error.message);

  const debtors = (debtorsRes.data || []) as SnapshotDebtor[];
  const creditors = (creditorsRes.data || []) as SnapshotDebtor[];
  const banks = (banksRes.data || []) as SnapshotBank[];
  const sales = (salesRes.data || []) as SnapshotVoucher[];
  const purchases = (purchasesRes.data || []) as SnapshotVoucher[];
  const lastRun = (lastRunRes.data?.[0] as SyncRunSummary) || null;

  const companies = Array.from(new Set([
    ...debtors.map(d => d.company),
    ...creditors.map(d => d.company),
    ...banks.map(d => d.company),
    ...sales.map(d => d.company),
    ...purchases.map(d => d.company),
  ]));

  return { debtors, creditors, banks, sales, purchases, lastRun, companies };
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
