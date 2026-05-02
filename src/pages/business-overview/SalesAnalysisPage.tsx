import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronRight, TrendingUp, Search, Save } from 'lucide-react';
import { CompanyFilter } from '@/components/business-overview/CompanyFilter';
import { LastSyncedFooter } from '@/components/business-overview/LastSyncedFooter';
import {
  formatINR,
  formatINRCompact,
  formatMT,
  formatDate,
  totalMTFromLineItems,
  currentMonthRange,
  toISODate,
} from '@/lib/business-overview-utils';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

function StatCard({ title, value, icon: Icon, loading }: any) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-7 w-32" /> : <div className="text-2xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}

export default function SalesAnalysisPage() {
  const qc = useQueryClient();
  const [company, setCompany] = useState<string>('all');
  const [monthSel, setMonthSel] = useState<string>('current'); // 'current' | 'last' | 'custom'
  const [from, setFrom] = useState<string>(toISODate(currentMonthRange().from));
  const [to, setTo] = useState<string>(toISODate(currentMonthRange().to));
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingCP, setEditingCP] = useState<Record<string, string>>({});

  const range = useMemo(() => {
    if (monthSel === 'current') return currentMonthRange();
    if (monthSel === 'last') {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
      };
    }
    return { from: new Date(from), to: new Date(to) };
  }, [monthSel, from, to]);

  const sales = useQuery({
    queryKey: ['sales-analysis', company, toISODate(range.from), toISODate(range.to)],
    queryFn: async () => {
      let q = supabase
        .from('tally_vouchers')
        .select('voucher_number, voucher_type, party_name, amount, date, line_items, narration, company_name')
        .eq('voucher_type', 'Sales')
        .gte('date', toISODate(range.from))
        .lte('date', toISODate(range.to))
        .order('date', { ascending: false });
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const cps = useQuery({
    queryKey: ['invoice-credit-periods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoice_credit_periods').select('*');
      if (error) throw error;
      const map = new Map<string, number>();
      (data ?? []).forEach((c: any) => map.set(`${c.company_name}::${c.voucher_number}`, c.credit_period_days));
      return map;
    },
  });

  const summary = useMemo(() => {
    const data = sales.data ?? [];
    const partyByKey = new Set(data.map((d: any) => `${d.company_name}::${d.party_name ?? ''}`));
    return {
      value: data.reduce((s: number, d: any) => s + Number(d.amount || 0), 0),
      mt: data.reduce((s: number, d: any) => s + totalMTFromLineItems(d.line_items), 0),
      n: data.length,
      parties: partyByKey.size,
    };
  }, [sales.data]);

  const grouped = useMemo(() => {
    const map = new Map<string, { party: string; company: string; invoices: any[]; mt: number; value: number }>();
    (sales.data ?? []).forEach((v: any) => {
      const key = `${v.company_name}::${v.party_name ?? '(unknown)'}`;
      if (!map.has(key)) {
        map.set(key, { party: v.party_name ?? '(unknown)', company: v.company_name, invoices: [], mt: 0, value: 0 });
      }
      const g = map.get(key)!;
      g.invoices.push(v);
      g.mt += totalMTFromLineItems(v.line_items);
      g.value += Number(v.amount || 0);
    });
    let arr = Array.from(map.entries()).map(([k, v]) => ({ key: k, ...v }));
    arr.sort((a, b) => b.value - a.value);
    if (search.trim()) {
      const s = search.toLowerCase();
      arr = arr.filter(x => x.party.toLowerCase().includes(s));
    }
    return arr;
  }, [sales.data, search]);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const saveCP = async (companyName: string, voucher: string) => {
    const key = `${companyName}::${voucher}`;
    const raw = editingCP[key];
    if (raw == null) return;
    const days = parseInt(raw, 10);
    if (isNaN(days) || days < 0) {
      toast.error('Enter a valid number of days');
      return;
    }
    const { error } = await supabase
      .from('invoice_credit_periods')
      .upsert(
        { company_name: companyName, voucher_number: voucher, credit_period_days: days },
        { onConflict: 'company_name,voucher_number' },
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Credit period saved');
    setEditingCP(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    qc.invalidateQueries({ queryKey: ['invoice-credit-periods'] });
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sales Analysis</h1>
          <p className="text-sm text-muted-foreground">Dispatch performance — debtor & invoice wise</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Period</label>
            <Select value={monthSel} onValueChange={setMonthSel}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current Month</SelectItem>
                <SelectItem value="last">Last Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {monthSel === 'custom' && (
            <>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">From</label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[160px]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">To</label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[160px]" />
              </div>
            </>
          )}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Company</label>
            <CompanyFilter value={company} onChange={setCompany} />
          </div>
          <div className="space-y-1 ml-auto">
            <label className="text-xs text-muted-foreground">Search Debtor</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-8 w-[240px]" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Dispatch Value" value={formatINRCompact(summary.value)} icon={TrendingUp} loading={sales.isLoading} />
        <StatCard title="Total Dispatch MT" value={formatMT(summary.mt)} icon={TrendingUp} loading={sales.isLoading} />
        <StatCard title="Invoices" value={String(summary.n)} icon={TrendingUp} loading={sales.isLoading} />
        <StatCard title="Unique Debtors" value={String(summary.parties)} icon={TrendingUp} loading={sales.isLoading} />
      </div>

      {/* Debtor-wise table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Debtor wise breakdown</CardTitle></CardHeader>
        <CardContent>
          {sales.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No data found. Run Tally Sync to import data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 w-8"></th>
                    <th className="py-2">Debtor Name</th>
                    <th className="py-2">Company</th>
                    <th className="py-2 text-right">Invoices</th>
                    <th className="py-2 text-right">Total MT</th>
                    <th className="py-2 text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(g => (
                    <Fragment key={g.key}>
                      <tr
                        className="border-b hover:bg-muted/40 cursor-pointer"
                        onClick={() => toggle(g.key)}
                      >
                        <td className="py-2">
                          {expanded.has(g.key) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="py-2 font-medium">{g.party}</td>
                        <td className="py-2 text-muted-foreground">{g.company}</td>
                        <td className="py-2 text-right">{g.invoices.length}</td>
                        <td className="py-2 text-right">{formatMT(g.mt)}</td>
                        <td className="py-2 text-right font-medium">{formatINR(g.value)}</td>
                      </tr>
                      {expanded.has(g.key) && (
                        <tr className="bg-muted/20">
                          <td colSpan={6} className="p-3">
                            <table className="w-full text-xs">
                              <thead className="text-muted-foreground">
                                <tr>
                                  <th className="text-left py-1">Invoice #</th>
                                  <th className="text-left py-1">Date</th>
                                  <th className="text-right py-1">MT</th>
                                  <th className="text-right py-1">Value</th>
                                  <th className="text-right py-1">Credit (days)</th>
                                  <th className="text-left py-1">Due Date</th>
                                  <th className="text-left py-1">Narration</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.invoices.map((inv: any) => {
                                  const cpKey = `${inv.company_name}::${inv.voucher_number}`;
                                  const stored = cps.data instanceof Map ? cps.data.get(cpKey) : undefined;
                                  const editing = editingCP[cpKey];
                                  const cp = editing != null ? editing : (stored != null ? String(stored) : '');
                                  const cpNum = parseInt(cp, 10);
                                  let due = '—';
                                  if (!isNaN(cpNum) && inv.date) {
                                    const d = new Date(inv.date);
                                    d.setDate(d.getDate() + cpNum);
                                    due = formatDate(d);
                                  }
                                  return (
                                    <tr key={inv.voucher_number} className="border-t">
                                      <td className="py-1">{inv.voucher_number}</td>
                                      <td className="py-1">{formatDate(inv.date)}</td>
                                      <td className="py-1 text-right">{formatMT(totalMTFromLineItems(inv.line_items))}</td>
                                      <td className="py-1 text-right">{formatINR(inv.amount)}</td>
                                      <td className="py-1 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <Input
                                            value={cp}
                                            onChange={e => setEditingCP(prev => ({ ...prev, [cpKey]: e.target.value }))}
                                            className="h-7 w-20 text-right"
                                            placeholder="—"
                                            inputMode="numeric"
                                          />
                                          {editing != null && editing !== String(stored ?? '') && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-7 w-7 p-0"
                                              onClick={() => saveCP(inv.company_name, inv.voucher_number)}
                                            >
                                              <Save className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-1">{due}</td>
                                      <td className="py-1 text-muted-foreground truncate max-w-[280px]">{inv.narration ?? ''}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
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

      <LastSyncedFooter />
    </div>
  );
}

import { Fragment } from 'react';
