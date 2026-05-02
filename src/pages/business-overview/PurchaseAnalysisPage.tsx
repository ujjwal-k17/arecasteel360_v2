import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronRight, ShoppingCart, Search } from 'lucide-react';
import { CompanyFilter } from '@/components/business-overview/CompanyFilter';
import { LastSyncedFooter } from '@/components/business-overview/LastSyncedFooter';
import {
  formatINR, formatINRCompact, formatMT, formatDate, totalMTFromLineItems, currentMonthRange, toISODate,
} from '@/lib/business-overview-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function StatCard({ title, value, loading }: any) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-7 w-32" /> : <div className="text-2xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}

export default function PurchaseAnalysisPage() {
  const [company, setCompany] = useState<string>('all');
  const [monthSel, setMonthSel] = useState<string>('current');
  const [from, setFrom] = useState<string>(toISODate(currentMonthRange().from));
  const [to, setTo] = useState<string>(toISODate(currentMonthRange().to));
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const purchases = useQuery({
    queryKey: ['purchase-analysis', company, toISODate(range.from), toISODate(range.to)],
    queryFn: async () => {
      let q = supabase
        .from('tally_vouchers')
        .select('voucher_number, party_name, amount, date, line_items, narration, company_name')
        .eq('voucher_type', 'Purchase')
        .gte('date', toISODate(range.from))
        .lte('date', toISODate(range.to))
        .order('date', { ascending: false });
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const data = purchases.data ?? [];
    return {
      value: data.reduce((s: number, d: any) => s + Number(d.amount || 0), 0),
      mt: data.reduce((s: number, d: any) => s + totalMTFromLineItems(d.line_items), 0),
      n: data.length,
      parties: new Set(data.map((d: any) => `${d.company_name}::${d.party_name ?? ''}`)).size,
    };
  }, [purchases.data]);

  const grouped = useMemo(() => {
    const map = new Map<string, { party: string; company: string; invoices: any[]; mt: number; value: number }>();
    (purchases.data ?? []).forEach((v: any) => {
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
  }, [purchases.data, search]);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Purchase Analysis</h1>
        <p className="text-sm text-muted-foreground">Procurement performance — supplier wise</p>
      </div>

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
            <label className="text-xs text-muted-foreground">Search Supplier</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-8 w-[240px]" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Purchase Value" value={formatINRCompact(summary.value)} loading={purchases.isLoading} />
        <StatCard title="Total Purchase MT" value={formatMT(summary.mt)} loading={purchases.isLoading} />
        <StatCard title="Invoices" value={String(summary.n)} loading={purchases.isLoading} />
        <StatCard title="Unique Suppliers" value={String(summary.parties)} loading={purchases.isLoading} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Supplier wise breakdown</CardTitle></CardHeader>
        <CardContent>
          {purchases.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No data found. Run Tally Sync to import data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 w-8"></th>
                    <th className="py-2">Supplier Name</th>
                    <th className="py-2">Company</th>
                    <th className="py-2 text-right">Invoices</th>
                    <th className="py-2 text-right">Total MT</th>
                    <th className="py-2 text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(g => (
                    <Fragment key={g.key}>
                      <tr className="border-b hover:bg-muted/40 cursor-pointer" onClick={() => toggle(g.key)}>
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
                                  <th className="text-left py-1">Narration</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.invoices.map((inv: any) => (
                                  <tr key={inv.voucher_number} className="border-t">
                                    <td className="py-1">{inv.voucher_number}</td>
                                    <td className="py-1">{formatDate(inv.date)}</td>
                                    <td className="py-1 text-right">{formatMT(totalMTFromLineItems(inv.line_items))}</td>
                                    <td className="py-1 text-right">{formatINR(inv.amount)}</td>
                                    <td className="py-1 text-muted-foreground truncate max-w-[280px]">{inv.narration ?? ''}</td>
                                  </tr>
                                ))}
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
