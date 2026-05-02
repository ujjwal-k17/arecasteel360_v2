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
  formatINR, formatINRCompact, formatDate, applyFIFO, ageingBucketFor, AGEING_LABELS, AgeingBucket,
  debtorOutstandingFromClosing, creditorOutstandingFromClosing, resolveCreditPeriod,
} from '@/lib/business-overview-utils';
import { useIntracompanyParties } from '@/hooks/useIntracompanyParties';

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
    queryKey: ['party-analysis', 'vouchers', company],
    queryFn: async () => {
      let q = supabase
        .from('tally_vouchers')
        .select('voucher_number, voucher_type, party_name, amount, date, narration, company_name')
        .in('voucher_type', ['Sales', 'Receipt', 'Purchase', 'Payment'])
        .limit(10000);
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Ledger balances — always use the latest snapshot per (company, ledger).
  // Tally writes one row per as_of_date; we keep only the most recent.
  const ledg = useQuery({
    queryKey: ['party-analysis', 'ledgers', company],
    queryFn: async () => {
      let q = supabase
        .from('tally_ledger_balances')
        .select('ledger_name, ledger_group, ultimate_group, closing_balance, company_name, as_of_date')
        .order('as_of_date', { ascending: false })
        .limit(10000);
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      // Dedupe — first occurrence wins (already sorted desc by as_of_date)
      const seen = new Set<string>();
      const latest = (data ?? []).filter((r: any) => {
        const k = `${r.company_name}::${r.ledger_name}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return latest;
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

  // Build party rows.
  // For debtors: only Sundry Debtors with debit balance (positive after sign flip).
  //   credit balances on Sundry Debtors are advances → moved to creditor view as "Advance from Customers".
  // For creditors: Sundry Creditors normal (positive closing) + advance customers section.
  const { mainRows, advanceRows } = useMemo(() => {
    if (!vchr.data || !ledg.data) return { mainRows: [], advanceRows: [] };

    const intraSet = intra.data ?? new Set<string>();

    // Group vouchers by company::party for FIFO calc later
    const grouper = (invType: string, recType: string) => {
      const g = new Map<string, { invoices: any[]; receipts: any[] }>();
      vchr.data.forEach((v: any) => {
        if (intraSet.has(v.party_name)) return;
        const key = `${v.company_name}::${v.party_name ?? ''}`;
        if (!g.has(key)) g.set(key, { invoices: [], receipts: [] });
        const rec = g.get(key)!;
        if (v.voucher_type === invType) rec.invoices.push(v);
        else if (v.voucher_type === recType) rec.receipts.push(v);
      });
      return g;
    };

    const debtorGroups = grouper('Sales', 'Receipt');
    const creditorGroups = grouper('Purchase', 'Payment');

    const buildRow = (
      key: string,
      partyName: string,
      companyKey: string,
      groups: Map<string, { invoices: any[]; receipts: any[] }>,
      ledgerOutstanding: number,
      isAdvance: boolean,
    ) => {
      const g = groups.get(key) ?? { invoices: [], receipts: [] };
      const invs = g.invoices.map((s: any) => ({
        voucher_number: s.voucher_number,
        date: s.date,
        amount: Number(s.amount || 0),
        narration: s.narration,
        credit_period_days: resolveCreditPeriod(companyKey, s.voucher_number, partyName, cpMap, dmMap),
      }));
      const recs = g.receipts.map((r: any) => ({ date: r.date, amount: Number(r.amount || 0) }));
      const fifo = applyFIFO(invs, recs);
      const totalOverdue = fifo
        .filter(r => r.outstanding > 0 && r.days_overdue > 0)
        .reduce((s, r) => s + r.outstanding, 0);
      const maxOverdueDays = Math.max(0, ...fifo.filter(r => r.outstanding > 0).map(r => r.days_overdue));
      const ageBucket = ageingBucketFor(maxOverdueDays);
      const partyDM = dmRecordMap.get(key);
      return {
        key,
        company: companyKey,
        party: partyName,
        creditPeriod: partyDM?.credit_period_days ?? null,
        salesRep: partyDM?.sales_rep ?? null,
        totalOutstanding: ledgerOutstanding,
        totalOverdue,
        maxOverdueDays,
        ageBucket,
        isAdvance,
        fifo: fifo.filter(r => r.outstanding > 0).sort((a, b) => b.days_overdue - a.days_overdue),
      };
    };

    const main: any[] = [];
    const advances: any[] = [];

    ledg.data.forEach((l: any) => {
      const partyName = l.ledger_name;
      if (intraSet.has(partyName)) return;
      const grp = l.ultimate_group ?? l.ledger_group;
      const key = `${l.company_name}::${partyName}`;
      const closing = Number(l.closing_balance || 0);

      if (grp === 'Sundry Debtors') {
        const out = debtorOutstandingFromClosing(closing); // flipped
        if (side === 'debtors') {
          // Show ALL debtors with any debit balance, no minimum threshold.
          if (out > 0) {
            main.push(buildRow(key, partyName, l.company_name, debtorGroups, out, false));
          }
        } else {
          // creditor view: pick up advances (credit balance on debtor ledger)
          if (out < 0) {
            advances.push(buildRow(key, partyName, l.company_name, debtorGroups, Math.abs(out), true));
          }
        }
      } else if (grp === 'Sundry Creditors' && side === 'creditors') {
        const out = creditorOutstandingFromClosing(closing);
        if (out > 0) {
          main.push(buildRow(key, partyName, l.company_name, creditorGroups, out, false));
        }
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
                {rows.map(r => (
                  <Fragment key={r.key}>
                    <tr className="border-b hover:bg-muted/40 cursor-pointer" onClick={() => toggle(r.key)}>
                      <td className="py-2">
                        {expanded.has(r.key) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="py-2 font-medium">{r.party}</td>
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
                          {r.fifo.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No outstanding invoices found in synced data.
                              {r.totalOutstanding > 0 && ' Closing balance from Tally suggests outstanding exists — historical vouchers may not be synced.'}
                            </p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead className="text-muted-foreground">
                                <tr>
                                  <th className="text-left py-1">Invoice #</th>
                                  <th className="text-left py-1">Invoice Date</th>
                                  <th className="text-right py-1">Original</th>
                                  <th className="text-right py-1">Paid</th>
                                  <th className="text-right py-1">Outstanding</th>
                                  <th className="text-right py-1">{creditLabel}</th>
                                  <th className="text-left py-1">Due Date</th>
                                  <th className="text-right py-1">Overdue Days</th>
                                  <th className="text-left py-1">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.fifo.map((f: any) => (
                                  <tr key={f.voucher_number} className={`border-t ${f.days_overdue > 0 ? 'bg-destructive/5' : ''}`}>
                                    <td className="py-1">{f.voucher_number}</td>
                                    <td className="py-1">{formatDate(f.invoice_date)}</td>
                                    <td className="py-1 text-right">{formatINR(f.original_amount)}</td>
                                    <td className="py-1 text-right">{formatINR(f.paid_amount)}</td>
                                    <td className="py-1 text-right font-medium">{formatINR(f.outstanding)}</td>
                                    <td className="py-1 text-right">{f.credit_period_days || 0}</td>
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
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
