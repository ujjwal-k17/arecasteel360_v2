import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay, endOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { CalendarIcon, Package, Layers, CheckCircle, Warehouse, TruckIcon, ArrowDownUp } from 'lucide-react';

type DateRange = { from: Date | undefined; to: Date | undefined };

function DateRangeFilter({ dateRange, setDateRange, label }: { dateRange: DateRange; setDateRange: (r: DateRange) => void; label: string }) {
  const today = new Date();
  const presets = [
    { label: 'Today', from: startOfDay(today), to: endOfDay(today) },
    { label: 'Yesterday', from: startOfDay(subDays(today, 1)), to: endOfDay(subDays(today, 1)) },
    { label: 'This Week', from: startOfWeek(today, { weekStartsOn: 1 }), to: endOfDay(today) },
    { label: 'This Month', from: startOfMonth(today), to: endOfDay(today) },
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
        >
          {p.label}
        </Button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
            <CalendarIcon className="h-3 w-3" />
            {dateRange.from ? (
              dateRange.to ? (
                `${format(dateRange.from, 'dd/MM')} - ${format(dateRange.to, 'dd/MM')}`
              ) : format(dateRange.from, 'dd/MM/yy')
            ) : 'Custom'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
            numberOfMonths={2}
            className={cn("p-3 pointer-events-auto")}
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

export default function InventorySummaryTab() {
  const today = new Date();
  const [prodRange, setProdRange] = useState<DateRange>({ from: startOfDay(today), to: endOfDay(today) });
  const [dispatchRange, setDispatchRange] = useState<DateRange>({ from: startOfDay(today), to: endOfDay(today) });

  // In-transit total
  const { data: inTransitData } = useQuery({
    queryKey: ['summary-in-transit'],
    queryFn: async () => {
      const { data } = await supabase.from('batches').select('net_weight').eq('status', 'in-transit');
      return data || [];
    },
  });

  // Coils inventory total
  const { data: coilsData } = useQuery({
    queryKey: ['summary-coils'],
    queryFn: async () => {
      const { data } = await supabase.from('batches').select('net_weight').eq('status', 'received');
      return data || [];
    },
  });

  // WIP inventory total
  const { data: wipData } = useQuery({
    queryKey: ['summary-wip'],
    queryFn: async () => {
      const { data } = await supabase.from('wip_items').select('qty').eq('status', 'active');
      return data || [];
    },
  });

  // FG inventory total
  const { data: fgData } = useQuery({
    queryKey: ['summary-fg'],
    queryFn: async () => {
      const { data } = await supabase.from('fg_items').select('qty');
      return data || [];
    },
  });

  // FG sales for total FG sold
  const { data: fgSalesData } = useQuery({
    queryKey: ['summary-fg-sales'],
    queryFn: async () => {
      const { data } = await supabase.from('fg_sales').select('quantity');
      return data || [];
    },
  });

  // Processing records for production
  const { data: processingData } = useQuery({
    queryKey: ['summary-processing'],
    queryFn: async () => {
      const { data } = await supabase.from('processing_records').select('input_qty, created_at');
      return data || [];
    },
  });

  // Dispatch data: inventory_actions (coil sales) + fg_sales + defective_sales
  const { data: coilSalesData } = useQuery({
    queryKey: ['summary-coil-sales'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_actions').select('net_weight, sales_date').eq('action_type', 'sell');
      return data || [];
    },
  });

  const { data: fgSalesAllData } = useQuery({
    queryKey: ['summary-fg-sales-all'],
    queryFn: async () => {
      const { data } = await supabase.from('fg_sales').select('quantity, sales_date');
      return data || [];
    },
  });

  const { data: defSalesData } = useQuery({
    queryKey: ['summary-def-sales'],
    queryFn: async () => {
      const { data } = await supabase.from('defective_sales').select('quantity, sales_date');
      return data || [];
    },
  });

  // Computed values
  const inTransitTotal = useMemo(() => (inTransitData || []).reduce((s, r) => s + (r.net_weight || 0), 0), [inTransitData]);
  const coilsTotal = useMemo(() => (coilsData || []).reduce((s, r) => s + (r.net_weight || 0), 0), [coilsData]);
  const wipTotal = useMemo(() => (wipData || []).reduce((s, r) => s + (r.qty || 0), 0), [wipData]);

  const fgTotal = useMemo(() => {
    const totalProduced = (fgData || []).reduce((s, r) => s + (r.qty || 0), 0);
    const totalSold = (fgSalesData || []).reduce((s, r) => s + (r.quantity || 0), 0);
    return totalProduced - totalSold;
  }, [fgData, fgSalesData]);

  const productionTotal = useMemo(() => {
    if (!prodRange.from) return (processingData || []).reduce((s, r) => s + (r.input_qty || 0), 0);
    return (processingData || []).filter(r => {
      const d = new Date(r.created_at);
      return d >= prodRange.from! && (!prodRange.to || d <= prodRange.to);
    }).reduce((s, r) => s + (r.input_qty || 0), 0);
  }, [processingData, prodRange]);

  const dispatchTotal = useMemo(() => {
    const inRange = (dateStr: string | null) => {
      if (!dateStr || !dispatchRange.from) return !dispatchRange.from;
      const d = new Date(dateStr);
      return d >= dispatchRange.from! && (!dispatchRange.to || d <= dispatchRange.to);
    };
    const coilSales = (coilSalesData || []).filter(r => inRange(r.sales_date)).reduce((s, r) => s + (r.net_weight || 0), 0);
    const fgSales = (fgSalesAllData || []).filter(r => inRange(r.sales_date)).reduce((s, r) => s + (r.quantity || 0), 0);
    const defSales = (defSalesData || []).filter(r => inRange(r.sales_date)).reduce((s, r) => s + (r.quantity || 0), 0);
    return coilSales + fgSales + defSales;
  }, [coilSalesData, fgSalesAllData, defSalesData, dispatchRange]);

  const formatWeight = (val: number) => `${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;

  const summaryCards = [
    { label: 'In-Transit', value: inTransitTotal, icon: TruckIcon, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800' },
    { label: 'Coils Inventory', value: coilsTotal, icon: Warehouse, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800' },
    { label: 'WIP Inventory', value: wipTotal, icon: Layers, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800' },
    { label: 'FG Inventory', value: fgTotal, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800' },
  ];

  return (
    <div className="space-y-6">
      {/* Static summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className={cn("border", card.border, card.bg)}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", card.bg)}>
                  <card.icon className={cn("h-5 w-5", card.color)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={cn("text-lg font-bold", card.color)}>{formatWeight(card.value)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Production with date filter */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-indigo-600" />
              <CardTitle className="text-base">Total Production</CardTitle>
              <span className="ml-auto text-xl font-bold text-indigo-600">{formatWeight(productionTotal)}</span>
            </div>
            <DateRangeFilter dateRange={prodRange} setDateRange={setProdRange} label="Period" />
          </div>
        </CardHeader>
      </Card>

      {/* Dispatch with date filter */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <ArrowDownUp className="h-5 w-5 text-rose-600" />
              <CardTitle className="text-base">Total Dispatch</CardTitle>
              <span className="ml-auto text-xl font-bold text-rose-600">{formatWeight(dispatchTotal)}</span>
            </div>
            <DateRangeFilter dateRange={dispatchRange} setDateRange={setDispatchRange} label="Period" />
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
