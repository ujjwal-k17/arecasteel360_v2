import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay, endOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { CalendarIcon, TruckIcon, Factory, ShoppingCart } from 'lucide-react';
import { useIntracompanyParties } from '@/hooks/useIntracompanyParties';
import { totalMTFromLineItems } from '@/lib/business-overview-utils';

type DateRange = { from: Date | undefined; to: Date | undefined };

function DateRangeFilter({ dateRange, setDateRange, label }: { dateRange: DateRange; setDateRange: (r: DateRange) => void; label: string }) {
  const today = new Date();
  const presets = [
    { label: 'Today', from: startOfDay(today), to: endOfDay(today) },
    { label: 'Yesterday', from: startOfDay(subDays(today, 1)), to: endOfDay(subDays(today, 1)) },
    { label: 'This Week', from: startOfWeek(today, { weekStartsOn: 1 }), to: endOfDay(today) },
    { label: `${today.toLocaleString('en-US', { month: 'short' })} '${String(today.getFullYear()).slice(-2)}`, from: startOfMonth(today), to: endOfDay(today) },
    { label: 'Last 7 Days', from: startOfDay(subDays(today, 6)), to: endOfDay(today) },
    { label: 'Last 30 Days', from: startOfDay(subDays(today, 29)), to: endOfDay(today) },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      {presets.map((p) => (
        <Button
          key={p.label}
          variant={dateRange.from?.getTime() === p.from.getTime() && dateRange.to?.getTime() === p.to.getTime() ? 'default' : 'outline'}
          size="sm"
          className="text-xs h-7 px-2"
          onClick={() => setDateRange({ from: p.from, to: p.to })}
        >{p.label}</Button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
            <CalendarIcon className="h-3 w-3" />
            {dateRange.from
              ? dateRange.to
                ? `${format(dateRange.from, 'dd/MM')} - ${format(dateRange.to, 'dd/MM')}`
                : format(dateRange.from, 'dd/MM/yy')
              : 'Custom'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={dateRange as any}
            onSelect={(range: any) => setDateRange({ from: range?.from, to: range?.to })}
            numberOfMonths={2}
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
      {dateRange.from && (
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setDateRange({ from: undefined, to: undefined })}>
          Clear
        </Button>
      )}
    </div>
  );
}

const fmtKg = (kg: number) => `${(kg || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Kgs`;
const parseAppDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const isoDate = (value: string | Date | null | undefined) => {
  const d = parseAppDate(value);
  return d ? format(d, 'yyyy-MM-dd') : '';
};
const displayDate = (value: string | Date | null | undefined, pattern = 'dd MMM yyyy') => {
  const d = parseAppDate(value);
  return d ? format(d, pattern) : '-';
};
const inRange = (dateStr: string | null | undefined, range: DateRange) => {
  if (!range.from) return true;
  const key = isoDate(dateStr);
  if (!key) return false;
  const fromKey = isoDate(range.from);
  const toKey = range.to ? isoDate(range.to) : '';
  return key >= fromKey && (!toKey || key <= toKey);
};

interface DrillRow { name: string; qtyKg: number }
interface DrillState { open: boolean; title: string; rows: DrillRow[] }

// ─── Section 1: Dispatches ─────────────────────────────────────────────────
function DispatchesSection() {
  const today = new Date();
  const [range, setRange] = useState<DateRange>({ from: startOfMonth(today), to: endOfDay(today) });
  const [drill, setDrill] = useState<DrillState>({ open: false, title: '', rows: [] });
  const intra = useIntracompanyParties();

  // Inventory dispatches: coil sales + FG sales + defective sales (all in Kgs)
  const coilSales = useQuery({
    queryKey: ['sum-coil-sales', 'v2'],
    queryFn: async () => (await supabase.from('inventory_actions')
      .select('net_weight, sales_date, order_id')
      .in('action_type', ['pack_coil_sale', 'loose_coil_sale'])
      .order('sales_date', { ascending: false })
      .limit(50000)).data || [],
  });
  const fgSales = useQuery({
    queryKey: ['sum-fg-sales', 'v2'],
    queryFn: async () => (await supabase.from('fg_sales').select('quantity, sales_date, order_id').order('sales_date', { ascending: false }).limit(50000)).data || [],
  });
  const defSales = useQuery({
    queryKey: ['sum-def-sales', 'v2'],
    queryFn: async () => (await supabase.from('defective_sales').select('quantity, sales_date, order_id').order('sales_date', { ascending: false }).limit(50000)).data || [],
  });
  const orders = useQuery({
    queryKey: ['sum-orders'],
    queryFn: async () => (await supabase.from('orders').select('id, order_number, customers(customer_name)')).data || [],
  });
  // Tally sales
  const tallySales = useQuery({
    queryKey: ['sum-tally-sales', 'v2', isoDate(range.from), isoDate(range.to)],
    queryFn: async () => {
      let q = supabase.from('tally_vouchers')
        .select('party_name, line_items, date, voucher_type')
        .eq('voucher_type', 'Sales')
        .order('date', { ascending: false })
        .limit(50000);
      if (range.from) q = q.gte('date', isoDate(range.from));
      if (range.to) q = q.lte('date', isoDate(range.to));
      return (await q).data || [];
    },
  });

  const orderMap = useMemo(() => {
    const m = new Map<string, string>();
    (orders.data || []).forEach((o: any) => {
      const name = o.customers?.customer_name || '-';
      m.set(o.id, name);
      if (o.order_number) m.set(o.order_number, name);
    });
    return m;
  }, [orders.data]);

  // Build per-day rows
  const { dateRows, totals } = useMemo(() => {
    const map = new Map<string, { invKg: number; tallyKg: number }>();

    const add = (date: string | null | undefined, kg: number, key: 'invKg' | 'tallyKg') => {
      if (!date || !inRange(date, range)) return;
      const d = isoDate(date);
      if (!map.has(d)) map.set(d, { invKg: 0, tallyKg: 0 });
      map.get(d)![key] += kg;
    };

    (coilSales.data || []).forEach((r: any) => add(r.sales_date, Number(r.net_weight || 0), 'invKg'));
    (fgSales.data || []).forEach((r: any) => add(r.sales_date, Number(r.quantity || 0), 'invKg'));
    (defSales.data || []).forEach((r: any) => add(r.sales_date, Number(r.quantity || 0), 'invKg'));

    (tallySales.data || []).forEach((r: any) => {
      if (intra.data?.isIntracompany(r.party_name)) return;
      const kg = totalMTFromLineItems(r.line_items) * 1000;
      add(r.date, kg, 'tallyKg');
    });

    const rows = Array.from(map.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const totals = rows.reduce((s, r) => ({ invKg: s.invKg + r.invKg, tallyKg: s.tallyKg + r.tallyKg }), { invKg: 0, tallyKg: 0 });
    return { dateRows: rows, totals };
  }, [coilSales.data, fgSales.data, defSales.data, tallySales.data, range, intra.data]);

  // Drill-down builders
  const showInvDrill = (date?: string) => {
    const partyMap = new Map<string, number>();
    const addRec = (name: string, kg: number) => {
      partyMap.set(name, (partyMap.get(name) || 0) + kg);
    };
    const filterDate = (d: string | null | undefined) => date ? (d && isoDate(new Date(d)) === date) : inRange(d, range);

    (coilSales.data || []).forEach((r: any) => {
      if (!filterDate(r.sales_date)) return;
      const name = (r.order_id && orderMap.get(r.order_id)) || '(no customer)';
      addRec(name, Number(r.net_weight || 0));
    });
    (fgSales.data || []).forEach((r: any) => {
      if (!filterDate(r.sales_date)) return;
      const name = (r.order_id && orderMap.get(r.order_id)) || '(no customer)';
      addRec(name, Number(r.quantity || 0));
    });
    (defSales.data || []).forEach((r: any) => {
      if (!filterDate(r.sales_date)) return;
      const name = (r.order_id && orderMap.get(r.order_id)) || '(no customer)';
      addRec(name, Number(r.quantity || 0));
    });

    const rows = Array.from(partyMap.entries())
      .map(([name, qtyKg]) => ({ name, qtyKg }))
      .sort((a, b) => b.qtyKg - a.qtyKg);
    setDrill({ open: true, title: `Inventory Dispatches — ${date ? format(new Date(date), 'dd MMM yyyy') : 'All'}`, rows });
  };

  const showTallyDrill = (date?: string) => {
    const partyMap = new Map<string, number>();
    (tallySales.data || []).forEach((r: any) => {
      if (intra.data?.isIntracompany(r.party_name)) return;
      const matchDate = date ? isoDate(r.date) === date : inRange(r.date, range);
      if (!matchDate) return;
      const kg = totalMTFromLineItems(r.line_items) * 1000;
      const name = r.party_name || '(unknown)';
      partyMap.set(name, (partyMap.get(name) || 0) + kg);
    });
    const rows = Array.from(partyMap.entries())
      .map(([name, qtyKg]) => ({ name, qtyKg }))
      .sort((a, b) => b.qtyKg - a.qtyKg);
    setDrill({ open: true, title: `Tally Sales (Debtors) — ${date ? displayDate(date) : 'All'}`, rows });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <TruckIcon className="h-5 w-5 text-rose-600" />
            <CardTitle className="text-base">Total Dispatches</CardTitle>
          </div>
          <DateRangeFilter dateRange={range} setDateRange={setRange} label="Period" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Date</TableHead>
                <TableHead className="text-xs font-semibold text-right">Inventory Dispatch (Kgs)</TableHead>
                <TableHead className="text-xs font-semibold text-right">Tally Sales (Kgs)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dateRows.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No data for selected period</TableCell></TableRow>
              ) : dateRows.map((r) => (
                <TableRow key={r.date}>
                  <TableCell className="text-xs">{displayDate(r.date)}</TableCell>
                  <TableCell className="text-xs text-right">
                    <button
                      className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                      onClick={() => showInvDrill(r.date)}
                      disabled={r.invKg <= 0}
                    >{fmtKg(r.invKg)}</button>
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    <button
                      className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                      onClick={() => showTallyDrill(r.date)}
                      disabled={r.tallyKg <= 0}
                    >{fmtKg(r.tallyKg)}</button>
                  </TableCell>
                </TableRow>
              ))}
              {dateRows.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell className="text-xs">Total</TableCell>
                  <TableCell className="text-xs text-right">
                    <button className="text-primary hover:underline" onClick={() => showInvDrill()}>{fmtKg(totals.invKg)}</button>
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    <button className="text-primary hover:underline" onClick={() => showTallyDrill()}>{fmtKg(totals.tallyKg)}</button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <DrillDialog state={drill} onClose={() => setDrill(s => ({ ...s, open: false }))} nameLabel="Customer / Debtor" />
    </Card>
  );
}

// ─── Section 2: Production ─────────────────────────────────────────────────
function ProductionSection() {
  const today = new Date();
  const [range, setRange] = useState<DateRange>({ from: startOfMonth(today), to: endOfDay(today) });
  const [drill, setDrill] = useState<{ open: boolean; title: string; records: any[] }>({ open: false, title: '', records: [] });

  const proc = useQuery({
    queryKey: ['sum-processing'],
    queryFn: async () => (await supabase.from('processing_records')
      .select('id, input_qty, created_at, process_type, source_type, output_type, batch_id, batches(batch_number, material, thickness, width, make, coating, grade), processing_output_items(width, length, qty_kg, num_pcs)')
      .order('created_at', { ascending: false })).data || [],
  });

  // Classify each record as Coils→WIP or WIP→FG (or other)
  const classify = (r: any): 'coil_to_wip' | 'wip_to_fg' | 'coil_to_fg' | 'other' => {
    const src = (r.source_type || '').toLowerCase();
    const out = (r.output_type || '').toLowerCase();
    if (src === 'coil' && out === 'wip') return 'coil_to_wip';
    if (src === 'wip' && out === 'fg') return 'wip_to_fg';
    if (src === 'coil' && out === 'fg') return 'coil_to_fg';
    return 'other';
  };

  const { dateRows, totals } = useMemo(() => {
    const map = new Map<string, { c2w: number; w2f: number; c2f: number }>();
    (proc.data || []).forEach((r: any) => {
      if (!inRange(r.created_at, range)) return;
      const d = isoDate(r.created_at);
      if (!map.has(d)) map.set(d, { c2w: 0, w2f: 0, c2f: 0 });
      const kg = Number(r.input_qty || 0);
      const cls = classify(r);
      if (cls === 'coil_to_wip') map.get(d)!.c2w += kg;
      else if (cls === 'wip_to_fg') map.get(d)!.w2f += kg;
      else if (cls === 'coil_to_fg') map.get(d)!.c2f += kg;
    });
    const rows = Array.from(map.entries()).map(([date, v]) => ({ date, ...v })).sort((a, b) => (a.date < b.date ? 1 : -1));
    const totals = rows.reduce((s, r) => ({ c2w: s.c2w + r.c2w, w2f: s.w2f + r.w2f, c2f: s.c2f + r.c2f }), { c2w: 0, w2f: 0, c2f: 0 });
    return { dateRows: rows, totals };
  }, [proc.data, range]);

  const showDrill = (kind: 'coil_to_wip' | 'wip_to_fg' | 'coil_to_fg', date?: string) => {
    const records = (proc.data || []).filter((r: any) => {
      if (classify(r) !== kind) return false;
      return date ? isoDate(r.created_at) === date : inRange(r.created_at, range);
    });
    const labels: Record<typeof kind, string> = {
      coil_to_wip: 'Coils → WIP',
      wip_to_fg: 'WIP → FG',
      coil_to_fg: 'Coils → FG',
    } as any;
    setDrill({ open: true, title: `${labels[kind]} — ${date ? displayDate(date) : 'All'}`, records });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-indigo-600" />
            <CardTitle className="text-base">Total Production</CardTitle>
          </div>
          <DateRangeFilter dateRange={range} setDateRange={setRange} label="Period" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Date</TableHead>
                <TableHead className="text-xs font-semibold text-right">Coils → WIP (Kgs)</TableHead>
                <TableHead className="text-xs font-semibold text-right">WIP → FG (Kgs)</TableHead>
                <TableHead className="text-xs font-semibold text-right">Coils → FG (Kgs)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dateRows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No production for selected period</TableCell></TableRow>
              ) : dateRows.map((r) => (
                <TableRow key={r.date}>
                  <TableCell className="text-xs">{displayDate(r.date)}</TableCell>
                  <TableCell className="text-xs text-right">
                    <button className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline" onClick={() => showDrill('coil_to_wip', r.date)} disabled={r.c2w <= 0}>{fmtKg(r.c2w)}</button>
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    <button className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline" onClick={() => showDrill('wip_to_fg', r.date)} disabled={r.w2f <= 0}>{fmtKg(r.w2f)}</button>
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    <button className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline" onClick={() => showDrill('coil_to_fg', r.date)} disabled={r.c2f <= 0}>{fmtKg(r.c2f)}</button>
                  </TableCell>
                </TableRow>
              ))}
              {dateRows.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell className="text-xs">Total</TableCell>
                  <TableCell className="text-xs text-right"><button className="text-primary hover:underline" onClick={() => showDrill('coil_to_wip')}>{fmtKg(totals.c2w)}</button></TableCell>
                  <TableCell className="text-xs text-right"><button className="text-primary hover:underline" onClick={() => showDrill('wip_to_fg')}>{fmtKg(totals.w2f)}</button></TableCell>
                  <TableCell className="text-xs text-right"><button className="text-primary hover:underline" onClick={() => showDrill('coil_to_fg')}>{fmtKg(totals.c2f)}</button></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <ProductionDrillDialog state={drill} onClose={() => setDrill(s => ({ ...s, open: false }))} />
    </Card>
  );
}

// ─── Section 3: Purchases ──────────────────────────────────────────────────
function PurchasesSection() {
  const today = new Date();
  const [range, setRange] = useState<DateRange>({ from: startOfMonth(today), to: endOfDay(today) });
  const [drill, setDrill] = useState<DrillState>({ open: false, title: '', rows: [] });
  const intra = useIntracompanyParties();

  // Inventory inwards: batches received (use purchase_date as the received date)
  const batches = useQuery({
    queryKey: ['sum-batches-received'],
    queryFn: async () => (await supabase.from('batches')
      .select('id, net_weight, purchase_from, purchase_date, status')
      .eq('status', 'received')
      .limit(50000)).data || [],
  });
  const tallyPurch = useQuery({
    queryKey: ['sum-tally-purchases'],
    queryFn: async () => (await supabase.from('tally_vouchers')
      .select('party_name, line_items, date, voucher_type')
      .ilike('voucher_type', 'Purchase%')
      .order('date', { ascending: false })
      .limit(50000)).data || [],
  });

  const { dateRows, totals } = useMemo(() => {
    const map = new Map<string, { invKg: number; tallyKg: number }>();
    const add = (date: string | null | undefined, kg: number, key: 'invKg' | 'tallyKg') => {
      if (!date || !inRange(date, range)) return;
      const d = isoDate(new Date(date));
      if (!map.has(d)) map.set(d, { invKg: 0, tallyKg: 0 });
      map.get(d)![key] += kg;
    };
    (batches.data || []).forEach((r: any) => add(r.purchase_date, Number(r.net_weight || 0), 'invKg'));
    (tallyPurch.data || []).forEach((r: any) => {
      if (intra.data?.isIntracompany(r.party_name)) return;
      add(r.date, totalMTFromLineItems(r.line_items) * 1000, 'tallyKg');
    });
    const rows = Array.from(map.entries()).map(([date, v]) => ({ date, ...v })).sort((a, b) => (a.date < b.date ? 1 : -1));
    const totals = rows.reduce((s, r) => ({ invKg: s.invKg + r.invKg, tallyKg: s.tallyKg + r.tallyKg }), { invKg: 0, tallyKg: 0 });
    return { dateRows: rows, totals };
  }, [batches.data, tallyPurch.data, range, intra.data]);

  const showInvDrill = (date?: string) => {
    const map = new Map<string, number>();
    (batches.data || []).forEach((r: any) => {
      const matchDate = date ? (r.purchase_date && isoDate(new Date(r.purchase_date)) === date) : inRange(r.purchase_date, range);
      if (!matchDate) return;
      const name = r.purchase_from || '(no supplier)';
      map.set(name, (map.get(name) || 0) + Number(r.net_weight || 0));
    });
    const rows = Array.from(map.entries()).map(([name, qtyKg]) => ({ name, qtyKg })).sort((a, b) => b.qtyKg - a.qtyKg);
    setDrill({ open: true, title: `Inventory Inwards — ${date ? format(new Date(date), 'dd MMM yyyy') : 'All'}`, rows });
  };

  const showTallyDrill = (date?: string) => {
    const map = new Map<string, number>();
    (tallyPurch.data || []).forEach((r: any) => {
      if (intra.data?.isIntracompany(r.party_name)) return;
      const matchDate = date ? (r.date && isoDate(new Date(r.date)) === date) : inRange(r.date, range);
      if (!matchDate) return;
      const kg = totalMTFromLineItems(r.line_items) * 1000;
      const name = r.party_name || '(unknown)';
      map.set(name, (map.get(name) || 0) + kg);
    });
    const rows = Array.from(map.entries()).map(([name, qtyKg]) => ({ name, qtyKg })).sort((a, b) => b.qtyKg - a.qtyKg);
    setDrill({ open: true, title: `Tally Purchases (Creditors) — ${date ? format(new Date(date), 'dd MMM yyyy') : 'All'}`, rows });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-teal-600" />
            <CardTitle className="text-base">Total Purchases</CardTitle>
          </div>
          <DateRangeFilter dateRange={range} setDateRange={setRange} label="Period" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Date</TableHead>
                <TableHead className="text-xs font-semibold text-right">Inventory Inward (Kgs)</TableHead>
                <TableHead className="text-xs font-semibold text-right">Tally Purchases (Kgs)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dateRows.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No data for selected period</TableCell></TableRow>
              ) : dateRows.map((r) => (
                <TableRow key={r.date}>
                  <TableCell className="text-xs">{format(new Date(r.date), 'dd MMM yyyy')}</TableCell>
                  <TableCell className="text-xs text-right">
                    <button className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline" onClick={() => showInvDrill(r.date)} disabled={r.invKg <= 0}>{fmtKg(r.invKg)}</button>
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    <button className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline" onClick={() => showTallyDrill(r.date)} disabled={r.tallyKg <= 0}>{fmtKg(r.tallyKg)}</button>
                  </TableCell>
                </TableRow>
              ))}
              {dateRows.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell className="text-xs">Total</TableCell>
                  <TableCell className="text-xs text-right"><button className="text-primary hover:underline" onClick={() => showInvDrill()}>{fmtKg(totals.invKg)}</button></TableCell>
                  <TableCell className="text-xs text-right"><button className="text-primary hover:underline" onClick={() => showTallyDrill()}>{fmtKg(totals.tallyKg)}</button></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <DrillDialog state={drill} onClose={() => setDrill(s => ({ ...s, open: false }))} nameLabel="Supplier / Creditor" />
    </Card>
  );
}

// ─── Drill-down dialogs ────────────────────────────────────────────────────
function DrillDialog({ state, onClose, nameLabel }: { state: DrillState; onClose: () => void; nameLabel: string }) {
  const total = state.rows.reduce((s, r) => s + r.qtyKg, 0);
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="text-base">{state.title}</DialogTitle></DialogHeader>
        <div className="overflow-x-auto rounded-md border max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">{nameLabel}</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total Quantity (Kgs)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.rows.length === 0 ? (
                <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground py-6">No records</TableCell></TableRow>
              ) : state.rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="text-xs">{r.name}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{fmtKg(r.qtyKg)}</TableCell>
                </TableRow>
              ))}
              {state.rows.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell className="text-xs">Total</TableCell>
                  <TableCell className="text-xs text-right">{fmtKg(total)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductionDrillDialog({ state, onClose }: { state: { open: boolean; title: string; records: any[] }; onClose: () => void }) {
  const total = state.records.reduce((s, r) => s + Number(r.input_qty || 0), 0);
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle className="text-base">{state.title}</DialogTitle></DialogHeader>
        <div className="overflow-x-auto rounded-md border max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Date</TableHead>
                <TableHead className="text-xs font-semibold">Process</TableHead>
                <TableHead className="text-xs font-semibold">Batch</TableHead>
                <TableHead className="text-xs font-semibold">Material</TableHead>
                <TableHead className="text-xs font-semibold">Input Dim</TableHead>
                <TableHead className="text-xs font-semibold">Output Dims</TableHead>
                <TableHead className="text-xs font-semibold text-right">Input Qty (Kgs)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.records.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No records</TableCell></TableRow>
              ) : state.records.map((r: any) => {
                const b = r.batches;
                const outs = r.processing_output_items || [];
                const outDims = outs.length
                  ? [...new Set(outs.map((o: any) => `${o.width ?? '-'} x ${o.length ?? 'Coil'}`))].join(', ')
                  : '-';
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{format(new Date(r.created_at), 'dd/MM/yy')}</TableCell>
                    <TableCell className="text-xs">{r.process_type}</TableCell>
                    <TableCell className="text-xs font-mono">{b?.batch_number || '-'}</TableCell>
                    <TableCell className="text-xs">{b?.material || '-'}</TableCell>
                    <TableCell className="text-xs">{b ? `${b.thickness ?? '-'} x ${b.width ?? '-'}` : '-'}</TableCell>
                    <TableCell className="text-xs">{outDims}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{Number(r.input_qty || 0).toLocaleString('en-IN')}</TableCell>
                  </TableRow>
                );
              })}
              {state.records.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={6} className="text-xs">Total</TableCell>
                  <TableCell className="text-xs text-right">{fmtKg(total)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function InventorySummaryTab() {
  return (
    <div className="space-y-6">
      <DispatchesSection />
      <ProductionSection />
      <PurchasesSection />
    </div>
  );
}
