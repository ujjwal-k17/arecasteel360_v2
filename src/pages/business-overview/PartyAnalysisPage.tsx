import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChevronDown, ChevronRight, Search, Save, AlertTriangle } from 'lucide-react';
import { CompanyFilter } from '@/components/business-overview/CompanyFilter';
import { LastSyncedFooter } from '@/components/business-overview/LastSyncedFooter';
import {
  formatINR, formatINRCompact, formatDate, applyFIFO, ageingBucketFor, AGEING_LABELS, AgeingBucket,
} from '@/lib/business-overview-utils';
import { toast } from 'sonner';

interface Mode {
  // 'debtors' or 'creditors' — share the same analysis page logic
  side: 'debtors' | 'creditors';
}

const SIDE_CONFIG = {
  debtors: {
    title: 'Debtor Analysis',
    subtitle: 'Outstanding & ageing — debtor wise (FIFO)',
    invoiceType: 'Sales',
    receiptType: 'Receipt',
    ledgerGroup: 'Sundry Debtors',
    partyLabel: 'Debtor Name',
    creditLabel: 'Credit Period',
  },
  creditors: {
    title: 'Creditor Analysis',
    subtitle: 'Payable & ageing — supplier wise (FIFO)',
    invoiceType: 'Purchase',
    receiptType: 'Payment',
    ledgerGroup: 'Sundry Creditors',
    partyLabel: 'Supplier Name',
    creditLabel: 'Payment Terms',
  },
} as const;

export default function PartyAnalysisPage({ side }: Mode) {
  const cfg = SIDE_CONFIG[side];
  const qc = useQueryClient();
  const [company, setCompany] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [bucketFilter, setBucketFilter] = useState<AgeingBucket | 'all'>('all');

  // Vouchers
  const vchr = useQuery({
    queryKey: ['party-analysis', side, company],
    queryFn: async () => {
      let q = supabase
        .from('tally_vouchers')
        .select('voucher_number, voucher_type, party_name, amount, date, narration, company_name')
        .in('voucher_type', [cfg.invoiceType, cfg.receiptType]);
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Ledger balances
  const ledg = useQuery({
    queryKey: ['party-ledger-balances', side, company],
    queryFn: async () => {
      let q = supabase
        .from('tally_ledger_balances')
        .select('ledger_name, ledger_group, closing_balance, company_name')
        .eq('ledger_group', cfg.ledgerGroup);
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Debtor master (always — used on creditor side too if user adds suppliers, but primarily debtors)
  const dm = useQuery({
    queryKey: ['debtor-master'],
    queryFn: async () => {
      const { data, error } = await supabase.from('debtor_master').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });

  const cps = useQuery({
    queryKey: ['invoice-credit-periods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoice_credit_periods').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });

  const dmMap = useMemo(() => {
    const m = new Map<string, any>();
    (dm.data ?? []).forEach((d: any) => m.set(`${d.company_name}::${d.ledger_name}`, d));
    return m;
  }, [dm.data]);

  const cpMap = useMemo(() => {
    const m = new Map<string, number>();
    (cps.data ?? []).forEach((c: any) => m.set(`${c.company_name}::${c.voucher_number}`, c.credit_period_days));
    return m;
  }, [cps.data]);

  // Compute per-party FIFO results
  const partyRows = useMemo(() => {
    if (!vchr.data) return [];
    const groups = new Map<string, { invoices: any[]; receipts: any[] }>();
    vchr.data.forEach((v: any) => {
      const key = `${v.company_name}::${v.party_name ?? ''}`;
      if (!groups.has(key)) groups.set(key, { invoices: [], receipts: [] });
      const g = groups.get(key)!;
      if (v.voucher_type === cfg.invoiceType) g.invoices.push(v);
      else g.receipts.push(v);
    });

    // Lookup outstanding from ledger
    const ledgerMap = new Map<string, number>();
    (ledg.data ?? []).forEach((l: any) =>
      ledgerMap.set(`${l.company_name}::${l.ledger_name}`, Number(l.closing_balance || 0)),
    );

    // Combine all known party keys (from both vchr and ledger)
    const allKeys = new Set<string>([...groups.keys(), ...ledgerMap.keys()]);

    const rows = Array.from(allKeys).map(key => {
      const [companyKey, partyName] = key.split('::');
      const g = groups.get(key) ?? { invoices: [], receipts: [] };
      const partyDM = dmMap.get(key);
      const fallbackCP = side === 'debtors' ? (partyDM?.credit_period_days ?? 0) : 0;
      const invs = g.invoices.map((s: any) => ({
        voucher_number: s.voucher_number,
        date: s.date,
        amount: Number(s.amount || 0),
        narration: s.narration,
        credit_period_days: cpMap.get(`${companyKey}::${s.voucher_number}`) ?? fallbackCP,
      }));
      const recs = g.receipts.map((r: any) => ({ date: r.date, amount: Number(r.amount || 0) }));
      const fifo = applyFIFO(invs, recs);
      const totalOverdue = fifo
        .filter(r => r.outstanding > 0 && r.days_overdue > 0)
        .reduce((s, r) => s + r.outstanding, 0);
      const maxOverdueDays = Math.max(0, ...fifo.filter(r => r.outstanding > 0).map(r => r.days_overdue));
      const ageBucket = ageingBucketFor(maxOverdueDays);
      const totalOutstanding = ledgerMap.get(key) ?? fifo.reduce((s, r) => s + r.outstanding, 0);
      return {
        key,
        company: companyKey,
        party: partyName,
        creditPeriod: partyDM?.credit_period_days ?? null,
        totalOutstanding,
        totalOverdue,
        maxOverdueDays,
        ageBucket,
        fifo: fifo.filter(r => r.outstanding > 0).sort((a, b) => b.days_overdue - a.days_overdue),
      };
    });

    // Filter
    let filtered = rows;
    if (search.trim()) {
      const s = search.toLowerCase();
      filtered = filtered.filter(r => r.party.toLowerCase().includes(s));
    }
    if (bucketFilter !== 'all') {
      filtered = filtered.filter(r => r.ageBucket === bucketFilter && r.totalOverdue > 0);
    }
    filtered.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
    return filtered;
  }, [vchr.data, ledg.data, dmMap, cpMap, search, side, bucketFilter]);

  const ageingSummary = useMemo(() => {
    const s: Record<AgeingBucket, { amount: number; count: number }> = {
      not_yet_due: { amount: 0, count: 0 },
      '1_30': { amount: 0, count: 0 },
      '31_60': { amount: 0, count: 0 },
      '61_90': { amount: 0, count: 0 },
      '90_plus': { amount: 0, count: 0 },
    };
    let grand = 0;
    partyRows.forEach(r => {
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
  }, [partyRows]);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const saveCreditPeriod = async (key: string) => {
    const [companyName, ledgerName] = key.split('::');
    const raw = editing[key];
    if (raw == null) return;
    const days = parseInt(raw, 10);
    if (isNaN(days) || days < 0) {
      toast.error('Enter a valid number of days');
      return;
    }
    const { error } = await supabase
      .from('debtor_master')
      .upsert(
        {
          company_name: companyName,
          ledger_name: ledgerName,
          credit_period_days: days,
          is_active: true,
        },
        { onConflict: 'company_name,ledger_name' },
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Saved');
    setEditing(prev => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
    qc.invalidateQueries({ queryKey: ['debtor-master'] });
  };

  // Detect historical sync incomplete: are there fewer than ~3 months of data?
  const historicalIncomplete = useMemo(() => {
    if (!vchr.data || vchr.data.length === 0) return false;
    const dates = vchr.data.map((v: any) => v.date).filter(Boolean).sort();
    if (dates.length === 0) return false;
    const oldest = new Date(dates[0]);
    const monthsSpan = (Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return monthsSpan < 3;
  }, [vchr.data]);

  const buckets: AgeingBucket[] = ['not_yet_due', '1_30', '31_60', '61_90', '90_plus'];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{cfg.title}</h1>
        <p className="text-sm text-muted-foreground">{cfg.subtitle}</p>
      </div>

      {historicalIncomplete && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Historical sync incomplete</AlertTitle>
          <AlertDescription>Ageing data may be inaccurate. Go to Tally Sync to complete historical sync.</AlertDescription>
        </Alert>
      )}

      {/* Ageing summary */}
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

      {/* Filters */}
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

      {/* Party table */}
      <Card>
        <CardHeader><CardTitle className="text-base">{cfg.partyLabel}s</CardTitle></CardHeader>
        <CardContent>
          {vchr.isLoading || ledg.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : partyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No data found. Run Tally Sync to import data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 w-8"></th>
                    <th className="py-2">{cfg.partyLabel}</th>
                    <th className="py-2">Company</th>
                    <th className="py-2 text-right">{cfg.creditLabel} (days)</th>
                    <th className="py-2 text-right">Total Outstanding</th>
                    <th className="py-2 text-right">Total Overdue</th>
                    <th className="py-2">Bucket</th>
                  </tr>
                </thead>
                <tbody>
                  {partyRows.map(r => {
                    const cpVal = editing[r.key] != null
                      ? editing[r.key]
                      : (r.creditPeriod != null ? String(r.creditPeriod) : '');
                    return (
                      <Fragment key={r.key}>
                        <tr className="border-b hover:bg-muted/40">
                          <td className="py-2 cursor-pointer" onClick={() => toggle(r.key)}>
                            {expanded.has(r.key) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="py-2 font-medium cursor-pointer" onClick={() => toggle(r.key)}>{r.party}</td>
                          <td className="py-2 text-muted-foreground">{r.company}</td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                value={cpVal}
                                onChange={e => setEditing(prev => ({ ...prev, [r.key]: e.target.value }))}
                                className="h-7 w-20 text-right"
                                placeholder="—"
                                inputMode="numeric"
                              />
                              {editing[r.key] != null && editing[r.key] !== String(r.creditPeriod ?? '') && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveCreditPeriod(r.key)}>
                                  <Save className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </td>
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
                            <td colSpan={7} className="p-3">
                              {r.fifo.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No outstanding invoices.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead className="text-muted-foreground">
                                    <tr>
                                      <th className="text-left py-1">Invoice #</th>
                                      <th className="text-left py-1">Date</th>
                                      <th className="text-right py-1">Original</th>
                                      <th className="text-right py-1">Paid</th>
                                      <th className="text-right py-1">Outstanding</th>
                                      <th className="text-right py-1">{cfg.creditLabel}</th>
                                      <th className="text-left py-1">Due Date</th>
                                      <th className="text-right py-1">Overdue Days</th>
                                      <th className="text-left py-1">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.fifo.map(f => (
                                      <tr key={f.voucher_number} className="border-t">
                                        <td className="py-1">{f.voucher_number}</td>
                                        <td className="py-1">{formatDate(f.invoice_date)}</td>
                                        <td className="py-1 text-right">{formatINR(f.original_amount)}</td>
                                        <td className="py-1 text-right">{formatINR(f.paid_amount)}</td>
                                        <td className="py-1 text-right font-medium">{formatINR(f.outstanding)}</td>
                                        <td className="py-1 text-right">{f.credit_period_days || '—'}</td>
                                        <td className="py-1">{formatDate(f.due_date)}</td>
                                        <td className="py-1 text-right">{f.days_overdue > 0 ? f.days_overdue : '—'}</td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <LastSyncedFooter />
    </div>
  );
}
