import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChevronDown, ChevronRight, Search, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanyFilter } from '@/components/business-overview/CompanyFilter';
import { LastSyncedFooter } from '@/components/business-overview/LastSyncedFooter';
import DebtorMasterTab from '@/components/business-overview/DebtorMasterTab';
import {
  formatINR, formatINRCompact, formatDate, ageingBucketFor, AGEING_LABELS, AgeingBucket,
  calculatePartyBalance, ALL_PARTY_VOUCHER_TYPES, resolveCreditPeriod,
  type InvoiceRow,
} from '@/lib/business-overview-utils';
import { useIntracompanyParties } from '@/hooks/useIntracompanyParties';
import { toast } from 'sonner';

interface Mode {
  side: 'debtors' | 'creditors';
}

const SIDE_CONFIG = {
  debtors: {
    title: 'Debtor Analysis',
    subtitle: 'Outstanding & ageing — debtor wise (FIFO)',
    invoiceType: 'Sales',
    receiptType: 'Receipt',
    ledgerGroup: 'Sundry Debtors',
    partyLabel: 'Debtor',
    creditLabel: 'Credit Period',
  },
  creditors: {
    title: 'Creditor Analysis',
    subtitle: 'Payable & ageing — supplier wise (FIFO)',
    invoiceType: 'Purchase',
    receiptType: 'Payment',
    ledgerGroup: 'Sundry Creditors',
    partyLabel: 'Supplier',
    creditLabel: 'Payment Terms',
  },
} as const;

const FETCH_PAGE_SIZE = 1000;

async function fetchAllRows(buildQuery: (from: number, to: number) => any) {
  const rows: any[] = [];
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const to = from + FETCH_PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < FETCH_PAGE_SIZE) break;
  }
  return rows;
}

export default function PartyAnalysisPage({ side }: Mode) {
  const cfg = SIDE_CONFIG[side];

  if (side === 'debtors') {
    return (
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold">{cfg.title}</h1>
          <p className="text-sm text-muted-foreground">{cfg.subtitle}</p>
        </div>
        <Tabs defaultValue="analysis">
          <TabsList>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="master">Debtor Master</TabsTrigger>
          </TabsList>
          <TabsContent value="analysis" className="space-y-6">
            <AnalysisView side="debtors" />
          </TabsContent>
          <TabsContent value="master">
            <DebtorMasterTab />
          </TabsContent>
        </Tabs>
        <LastSyncedFooter />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{cfg.title}</h1>
        <p className="text-sm text-muted-foreground">{cfg.subtitle}</p>
      </div>
      <AnalysisView side="creditors" />
      <LastSyncedFooter />
    </div>
  );
}

function AnalysisView({ side }: Mode) {
  const cfg = SIDE_CONFIG[side];
  const qc = useQueryClient();
  const [company, setCompany] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bucketFilter, setBucketFilter] = useState<AgeingBucket | 'all'>('all');
  const intra = useIntracompanyParties();

  // Vouchers — pull both this side AND the opposite (for "Advance from Customers" on creditor view)
  const vchr = useQuery({
      queryKey: ['party-analysis', 'vouchers', company, side],
    queryFn: async () => {
      return fetchAllRows((from, to) => {
        let q = supabase
          .from('tally_vouchers')
          .select('voucher_number, voucher_type, party_name, amount, date, narration, company_name')
          .in('voucher_type', ALL_PARTY_VOUCHER_TYPES as unknown as string[])
          .range(from, to);
        if (company !== 'all') q = q.eq('company_name', company);
        return q;
      });
    },
  });

  // Ledger balances — keep ALL snapshots (need earliest for opening balance + latest for closing).
  const ledg = useQuery({
    queryKey: ['party-analysis', 'ledgers-all', company, side],
    queryFn: async () => {
      const ledgerGroups = side === 'debtors'
        ? ['Sundry Debtors']
        : ['Sundry Creditors', 'Sundry Debtors'];
      const fetchByGroupField = (field: 'ultimate_group' | 'ledger_group') => fetchAllRows((from, to) => {
        let q = supabase
          .from('tally_ledger_balances')
          .select('ledger_name, ledger_group, ultimate_group, closing_balance, company_name, as_of_date')
          .in(field, ledgerGroups)
          .order('as_of_date', { ascending: true })
          .range(from, to);
        if (company !== 'all') q = q.eq('company_name', company);
        return q;
      });
      const [byUltimateGroup, byLedgerGroup] = await Promise.all([
        fetchByGroupField('ultimate_group'),
        fetchByGroupField('ledger_group'),
      ]);
      // Dedupe by full row identity (company + ledger + as_of_date)
      const seen = new Set<string>();
      const all = [...byUltimateGroup, ...byLedgerGroup].filter((r: any) => {
        const k = `${r.company_name}::${r.ledger_name}::${r.as_of_date}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return all;
    },
  });

  const dm = useQuery({
    queryKey: ['debtor-master'],
    queryFn: async () => {
      const { data, error } = await supabase.from('debtor_master').select('*').limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const cps = useQuery({
    queryKey: ['invoice-credit-periods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoice_credit_periods').select('*').limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const dmMap = useMemo(() => {
    const m = new Map<string, number>();
    (dm.data ?? []).forEach((d: any) => {
      if (d.credit_period_days != null) {
        m.set(`${d.company_name}::${d.ledger_name}`, d.credit_period_days);
      }
    });
    return m;
  }, [dm.data]);

  const dmRecordMap = useMemo(() => {
    const m = new Map<string, any>();
    (dm.data ?? []).forEach((d: any) => m.set(`${d.company_name}::${d.ledger_name}`, d));
    return m;
  }, [dm.data]);

  const cpMap = useMemo(() => {
    const m = new Map<string, number>();
    (cps.data ?? []).forEach((c: any) =>
      m.set(`${c.company_name}::${c.voucher_number}`, c.credit_period_days),
    );
    return m;
  }, [cps.data]);

  // Auto-populate debtor_master from ledger balances (only for debtors side)
  // — never overwrite credit_period_days or sales_rep, only insert missing.
  useEffect(() => {
    if (side !== 'debtors' || !ledg.data || !dm.data || !intra.data) return;
    const debtorLedgers = ledg.data.filter((l: any) => {
      const grp = l.ultimate_group ?? l.ledger_group;
      if (grp !== 'Sundry Debtors') return false;
      if (intra.data!.has(l.ledger_name)) return false;
      return true;
    });
    const missing = debtorLedgers.filter(
      (l: any) => !dmRecordMap.has(`${l.company_name}::${l.ledger_name}`),
    );
    if (missing.length === 0) return;
    const rows = missing.map((l: any) => ({
      company_name: l.company_name,
      ledger_name: l.ledger_name,
      is_active: true,
    }));
    supabase
      .from('debtor_master')
      .upsert(rows, { onConflict: 'company_name,ledger_name', ignoreDuplicates: true })
      .then(({ error }) => {
        if (!error) qc.invalidateQueries({ queryKey: ['debtor-master'] });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledg.data, dm.data, intra.data, side]);

  const buckets: AgeingBucket[] = ['not_yet_due', '1_30', '31_60', '61_90', '90_plus'];

  // Build party rows using the new ledger-anchored balance calculator.
  // Outstanding always == ledger closing balance (sign-corrected). FIFO is used only
  // for invoice-wise paid/outstanding/overdue distribution in the drill-down.
  const { mainRows, advanceRows } = useMemo(() => {
    if (!vchr.data || !ledg.data) return { mainRows: [], advanceRows: [] };

    const intraSet = intra.data ?? new Set<string>();

    // Group vouchers by company::party
    const vchrByParty = new Map<string, any[]>();
    vchr.data.forEach((v: any) => {
      if (intraSet.has(v.party_name)) return;
      const key = `${v.company_name}::${v.party_name ?? ''}`;
      if (!vchrByParty.has(key)) vchrByParty.set(key, []);
      vchrByParty.get(key)!.push(v);
    });

    // Group ledger snapshots by company::ledger
    type Snap = { as_of_date: string; closing_balance: number; ultimate_group?: string; ledger_group?: string };
    const snapsByLedger = new Map<string, Snap[]>();
    const groupByLedger = new Map<string, string>();
    ledg.data.forEach((l: any) => {
      const key = `${l.company_name}::${l.ledger_name}`;
      if (!snapsByLedger.has(key)) snapsByLedger.set(key, []);
      snapsByLedger.get(key)!.push(l);
      const grp = l.ultimate_group ?? l.ledger_group ?? '';
      if (!groupByLedger.has(key)) groupByLedger.set(key, grp);
    });

    const buildRow = (
      key: string,
      partyName: string,
      companyKey: string,
      isAdvance: boolean,
      side_: 'debtors' | 'creditors',
    ) => {
      const partyVchrs = (vchrByParty.get(key) ?? []) as any[];
      const snaps = snapsByLedger.get(key) ?? [];
      const partyDM = dmRecordMap.get(key);

      const balance = calculatePartyBalance({
        side: side_,
        vouchers: partyVchrs.map((v: any) => ({
          voucher_number: v.voucher_number,
          voucher_type: v.voucher_type,
          date: v.date,
          amount: Number(v.amount || 0),
          narration: v.narration,
        })),
        ledgerSnaps: snaps.map((s: any) => ({
          as_of_date: s.as_of_date,
          closing_balance: Number(s.closing_balance || 0),
        })),
        creditPeriodResolver: (vno, _date) =>
          resolveCreditPeriod(companyKey, vno, partyName, cpMap, dmMap),
      });

      // For "Advance from Customers" rows on the creditor side, ledgerOutstanding (debtor-side
      // computation) is negative; flip to a positive payable.
      const totalOutstanding = isAdvance
        ? Math.max(0, -balance.ledgerOutstanding)
        : Math.max(0, balance.ledgerOutstanding);

      const ageBucket = balance.maxOverdueDays > 0
        ? ageingBucketFor(balance.maxOverdueDays)
        : 'not_yet_due' as AgeingBucket;

      return {
        key,
        company: companyKey,
        party: partyName,
        creditPeriod: partyDM?.credit_period_days ?? null,
        salesRep: partyDM?.sales_rep ?? null,
        totalOutstanding,
        totalOverdue: balance.totalOverdue,
        maxOverdueDays: balance.maxOverdueDays,
        ageBucket,
        isAdvance,
        balance,
        invoices: balance.invoices,
      };
    };

    const main: any[] = [];
    const advances: any[] = [];

    // Iterate the union of ledger-keys and voucher-keys so that parties with vouchers
    // but no ledger row (rare) still surface, but only debtors/creditors are kept.
    const allKeys = new Set<string>([...snapsByLedger.keys(), ...vchrByParty.keys()]);

    allKeys.forEach((key) => {
      const [companyKey, partyName] = key.split('::');
      if (!partyName) return;
      if (intraSet.has(partyName)) return;

      const grp = groupByLedger.get(key);
      // If we have no ledger at all for this party, default-classify by side
      // (cannot determine group; skip — outstanding wouldn't be reliable anyway).
      if (!grp) return;

      if (grp === 'Sundry Debtors') {
        if (side === 'debtors') {
          // Compute side='debtors' to get debit-positive ledgerOutstanding
          const row = buildRow(key, partyName, companyKey, false, 'debtors');
          if (row.totalOutstanding > 0) main.push(row);
        } else {
          // creditor view → advances (credit balance on debtor ledger).
          // Use side='debtors' to compute ledgerOutstanding, then check it's negative.
          const probe = buildRow(key, partyName, companyKey, true, 'debtors');
          if (probe.balance.ledgerOutstanding < 0) {
            advances.push(probe);
          }
        }
      } else if (grp === 'Sundry Creditors' && side === 'creditors') {
        const row = buildRow(key, partyName, companyKey, false, 'creditors');
        if (row.totalOutstanding > 0) main.push(row);
      }
    });

    const applyFilters = (arr: any[]) => {
      let f = arr;
      if (search.trim()) {
        const s = search.toLowerCase();
        f = f.filter(r => r.party.toLowerCase().includes(s));
      }
      if (bucketFilter !== 'all') {
        f = f.filter(r => r.ageBucket === bucketFilter && r.totalOverdue > 0);
      }
      f.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
      return f;
    };

    return { mainRows: applyFilters(main), advanceRows: applyFilters(advances) };
  }, [vchr.data, ledg.data, dmMap, dmRecordMap, cpMap, search, side, bucketFilter, intra.data]);

  const ageingSummary = useMemo(() => {
    const s: Record<AgeingBucket, { amount: number; count: number }> = {
      not_yet_due: { amount: 0, count: 0 },
      '1_30': { amount: 0, count: 0 },
      '31_60': { amount: 0, count: 0 },
      '61_90': { amount: 0, count: 0 },
      '90_plus': { amount: 0, count: 0 },
    };
    let grand = 0;
    mainRows.forEach(r => {
      grand += r.totalOutstanding;
      if (r.ageBucket === 'not_yet_due') {
        s.not_yet_due.amount += r.totalOutstanding;
        if (r.totalOutstanding > 0) s.not_yet_due.count += 1;
      } else if (r.totalOverdue > 0) {
        s[r.ageBucket].amount += r.totalOverdue;
        s[r.ageBucket].count += 1;
      }
    });
    return { s, grand };
  }, [mainRows]);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const historicalIncomplete = useMemo(() => {
    if (!vchr.data || vchr.data.length === 0) return false;
    const dates = vchr.data.map((v: any) => v.date).filter(Boolean).sort();
    if (dates.length === 0) return false;
    const oldest = new Date(dates[0]);
    const monthsSpan = (Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return monthsSpan < 3;
  }, [vchr.data]);

  return (
    <div className="space-y-6">
      {historicalIncomplete && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Historical sync incomplete</AlertTitle>
          <AlertDescription>Ageing data may be inaccurate. Go to Tally Sync to complete historical sync.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Card className={bucketFilter === 'all' ? 'ring-2 ring-primary cursor-pointer' : 'cursor-pointer'} onClick={() => setBucketFilter('all')}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Active {cfg.partyLabel}s</div>
            <div className="text-lg font-bold mt-1">{mainRows.length}</div>
            <div className="text-xs text-muted-foreground">with outstanding &gt; 0</div>
          </CardContent>
        </Card>
        {buckets.map(b => (
          <Card
            key={b}
            className={`cursor-pointer ${bucketFilter === b ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setBucketFilter(bucketFilter === b ? 'all' : b)}
          >
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{AGEING_LABELS[b]}</div>
              <div className="text-lg font-bold mt-1">{formatINRCompact(ageingSummary.s[b].amount)}</div>
              <div className="text-xs text-muted-foreground">{ageingSummary.s[b].count} parties</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="text-sm text-right">
        <span className="text-muted-foreground">Grand Total Outstanding: </span>
        <span className="font-bold">{formatINR(ageingSummary.grand)}</span>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Company</label>
            <CompanyFilter value={company} onChange={setCompany} />
          </div>
          <div className="space-y-1 ml-auto">
            <label className="text-xs text-muted-foreground">Search {cfg.partyLabel}</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-8 w-[260px]" />
            </div>
          </div>
        </CardContent>
      </Card>

      <PartyTable
        title={`${cfg.partyLabel}s`}
        rows={mainRows}
        loading={vchr.isLoading || ledg.isLoading}
        expanded={expanded}
        toggle={toggle}
        creditLabel={cfg.creditLabel}
        showSalesRep={side === 'debtors'}
      />

      {side === 'creditors' && (
        <PartyTable
          title="Advance from Customers"
          rows={advanceRows}
          loading={vchr.isLoading || ledg.isLoading}
          expanded={expanded}
          toggle={toggle}
          creditLabel="Credit Period"
          showSalesRep={false}
          subtitle="Customers who have paid in advance — credit balance on debtor ledger"
        />
      )}
    </div>
  );
}

function PartyTable({
  title, subtitle, rows, loading, expanded, toggle, creditLabel, showSalesRep,
}: {
  title: string;
  subtitle?: string;
  rows: any[];
  loading: boolean;
  expanded: Set<string>;
  toggle: (k: string) => void;
  creditLabel: string;
  showSalesRep: boolean;
}) {
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const totalOutstanding = useMemo(() => rows.reduce((s, r) => s + (r.totalOutstanding || 0), 0), [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // Reset to page 1 if filter shrinks results below current page
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const startIdx = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(page * PAGE_SIZE, rows.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No data found.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 text-sm">
              <div>
                <span className="font-medium">Showing {rows.length} {title.toLowerCase()}</span>
                <span className="text-muted-foreground"> — Total Outstanding: </span>
                <span className="font-semibold">{formatINR(totalOutstanding)}</span>
              </div>
              {rows.length > PAGE_SIZE && (
                <div className="text-xs text-muted-foreground">
                  Rows {startIdx}–{endIdx} of {rows.length}
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 w-8"></th>
                  <th className="py-2">Name</th>
                  <th className="py-2">Company</th>
                  {showSalesRep && <th className="py-2">Sales Rep</th>}
                  <th className="py-2 text-right">{creditLabel} (days)</th>
                  <th className="py-2 text-right">Total Outstanding</th>
                  <th className="py-2 text-right">Total Overdue</th>
                  <th className="py-2">Bucket</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(r => (
                  <Fragment key={r.key}>
                    <tr className="border-b hover:bg-muted/40 cursor-pointer" onClick={() => toggle(r.key)}>
                      <td className="py-2">
                        {expanded.has(r.key) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {r.party}
                          {r.balance?.hasMismatch && (
                            <span title={`Balance mismatch of ${formatINR(Math.abs(r.balance.mismatch))} — sync may be incomplete`}>
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 text-muted-foreground">{r.company}</td>
                      {showSalesRep && <td className="py-2 text-muted-foreground">{r.salesRep ?? '—'}</td>}
                      <td className="py-2 text-right">{r.creditPeriod ?? '—'}</td>
                      <td className="py-2 text-right font-medium">{formatINR(r.totalOutstanding)}</td>
                      <td className="py-2 text-right text-destructive">{r.totalOverdue > 0 ? formatINR(r.totalOverdue) : '—'}</td>
                      <td className="py-2">
                        <Badge variant={r.ageBucket === '90_plus' ? 'destructive' : r.ageBucket === 'not_yet_due' ? 'secondary' : 'default'}>
                          {AGEING_LABELS[r.ageBucket]}
                        </Badge>
                      </td>
                    </tr>
                    {expanded.has(r.key) && (
                      <tr className="bg-muted/20">
                        <td colSpan={showSalesRep ? 8 : 7} className="p-3">
                          <DrillDown row={r} creditLabel={creditLabel} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 text-sm">
                <button
                  className="px-3 py-1 rounded border disabled:opacity-50 hover:bg-muted/50"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </button>
                <span className="text-muted-foreground">Page {page} of {totalPages}</span>
                <button
                  className="px-3 py-1 rounded border disabled:opacity-50 hover:bg-muted/50"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Drill-down with editable credit periods + summary + mismatch warning ───
function DrillDown({ row, creditLabel }: { row: any; creditLabel: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const invoices = (row.invoices ?? []) as InvoiceRow[];
  const balance = row.balance;

  const totals = useMemo(() => {
    let inv = 0, paid = 0, out = 0, over = 0;
    invoices.forEach(i => {
      inv += i.original_amount;
      paid += i.paid_amount;
      out += i.outstanding;
      if (i.days_overdue > 0 && i.outstanding > 0) over += i.outstanding;
    });
    return { inv, paid, out, over };
  }, [invoices]);

  const saveCreditPeriod = async (voucher: string, value: number) => {
    if (voucher === 'Opening Balance') return;
    setSavingKey(voucher);
    try {
      const { error } = await supabase
        .from('invoice_credit_periods')
        .upsert({
          company_name: row.company,
          voucher_number: voucher,
          credit_period_days: value,
        }, { onConflict: 'company_name,voucher_number' });
      if (error) throw error;
      toast.success('Credit period updated');
      qc.invalidateQueries({ queryKey: ['invoice-credit-periods'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save');
    } finally {
      setSavingKey(null);
    }
  };

  if (invoices.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No outstanding invoices found in synced data.
        {row.totalOutstanding > 0 && ' Closing balance from Tally suggests outstanding exists — historical vouchers may not be synced.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-left py-1">Invoice #</th>
            <th className="text-left py-1">Invoice Date</th>
            <th className="text-right py-1">Invoice Amount</th>
            <th className="text-right py-1">Paid</th>
            <th className="text-right py-1">Outstanding</th>
            <th className="text-right py-1">{creditLabel} (days)</th>
            <th className="text-left py-1">Due Date</th>
            <th className="text-right py-1">Overdue Days</th>
            <th className="text-left py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((f) => {
            const isOpening = f.is_opening || f.voucher_number === 'Opening Balance';
            const draftVal = draft[f.voucher_number];
            return (
              <tr key={f.voucher_number} className={`border-t ${f.days_overdue > 0 ? 'bg-destructive/5' : ''} ${isOpening ? 'italic' : ''}`}>
                <td className="py-1">{isOpening ? 'Opening Balance' : f.voucher_number}</td>
                <td className="py-1">{formatDate(f.invoice_date)}</td>
                <td className="py-1 text-right">{formatINR(f.original_amount)}</td>
                <td className="py-1 text-right">{formatINR(f.paid_amount)}</td>
                <td className="py-1 text-right font-medium">{formatINR(f.outstanding)}</td>
                <td className="py-1 text-right">
                  {isOpening ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Input
                      type="number"
                      className="h-7 w-20 text-right text-xs ml-auto"
                      value={draftVal ?? String(f.credit_period_days || 0)}
                      disabled={savingKey === f.voucher_number}
                      onChange={(e) => setDraft(prev => ({ ...prev, [f.voucher_number]: e.target.value }))}
                      onBlur={() => {
                        const raw = draft[f.voucher_number];
                        if (raw == null) return;
                        const n = parseInt(raw, 10);
                        if (isNaN(n) || n < 0) return;
                        if (n === (f.credit_period_days || 0)) return;
                        saveCreditPeriod(f.voucher_number, n);
                      }}
                    />
                  )}
                </td>
                <td className="py-1">{formatDate(f.due_date)}</td>
                <td className={`py-1 text-right font-medium ${f.days_overdue > 0 ? 'text-destructive' : ''}`}>
                  {f.days_overdue > 0 ? f.days_overdue : '—'}
                </td>
                <td className="py-1">
                  <Badge variant={
                    f.status === 'Overdue' ? 'destructive' :
                    f.status === 'Paid' ? 'secondary' : 'default'
                  }>{f.status}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 font-semibold">
          <tr>
            <td className="py-2" colSpan={2}>Totals</td>
            <td className="py-2 text-right">{formatINR(totals.inv)}</td>
            <td className="py-2 text-right">{formatINR(totals.paid)}</td>
            <td className="py-2 text-right">{formatINR(totals.out)}</td>
            <td className="py-2"></td>
            <td className="py-2"></td>
            <td className="py-2 text-right text-destructive">{totals.over > 0 ? formatINR(totals.over) : '—'}</td>
            <td className="py-2"></td>
          </tr>
          <tr className="text-xs text-muted-foreground">
            <td colSpan={4} className="py-1">Ledger closing balance (Tally)</td>
            <td className="py-1 text-right">{formatINR(row.totalOutstanding)}</td>
            <td colSpan={4}></td>
          </tr>
        </tfoot>
      </table>
      {balance?.hasMismatch && (
        <div className="text-xs text-destructive flex items-start gap-1.5 pt-1">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Balance mismatch of {formatINR(Math.abs(balance.mismatch))} — historical sync may be incomplete.
            Run Full Year History sync for accurate data.
          </span>
        </div>
      )}
    </div>
  );
}

