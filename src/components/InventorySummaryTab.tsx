import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay, endOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { CalendarIcon, Package, Layers, CheckCircle, Warehouse, TruckIcon, ArrowDownUp, ChevronDown, AlertTriangle, Trash2, ArrowDownToLine } from 'lucide-react';

type DateRange = { from: Date | undefined; to: Date | undefined };

function DateRangeFilter({ dateRange, setDateRange, label }: { dateRange: DateRange; setDateRange: (r: DateRange) => void; label: string }) {
  const today = new Date();
  const presets = [
    { label: 'Today', from: startOfDay(today), to: endOfDay(today) },
    { label: 'Yesterday', from: startOfDay(subDays(today, 1)), to: endOfDay(subDays(today, 1)) },
    { label: 'This Week', from: startOfWeek(today, { weekStartsOn: 1 }), to: endOfDay(today) },
    { label: `${today.toLocaleString('en-US', { month: 'long' })} '${String(today.getFullYear()).slice(-2)}`, from: startOfMonth(today), to: endOfDay(today) },
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
  const [inwardRange, setInwardRange] = useState<DateRange>({ from: startOfDay(today), to: endOfDay(today) });
  const [prodOpen, setProdOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [inwardOpen, setInwardOpen] = useState(false);

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

  // Scrap inventory total (from inventory_actions with scrap_type)
  const { data: scrapData } = useQuery({
    queryKey: ['summary-scrap'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_actions').select('net_weight').not('scrap_type', 'is', null);
      return data || [];
    },
  });

  // Scrap sold total
  const { data: scrapSoldData } = useQuery({
    queryKey: ['summary-scrap-sold'],
    queryFn: async () => {
      const { data } = await supabase.from('scrap_sales').select('qty_sold');
      return data || [];
    },
  });

  // Defective inventory total (from inventory_actions with defect_type)
  const { data: defectiveActionData } = useQuery({
    queryKey: ['summary-defective-actions'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_actions').select('net_weight').not('defect_type', 'is', null);
      return data || [];
    },
  });

  // Defective sold
  const { data: defectiveSoldData } = useQuery({
    queryKey: ['summary-defective-sold'],
    queryFn: async () => {
      const { data } = await supabase.from('defective_sales').select('quantity');
      return data || [];
    },
  });

  // FG defectives total
  const { data: fgDefectivesData } = useQuery({
    queryKey: ['summary-fg-defectives'],
    queryFn: async () => {
      const { data } = await supabase.from('fg_defectives').select('quantity');
      return data || [];
    },
  });

  // Processing records with details for production breakdown
  const { data: processingDetailData } = useQuery({
    queryKey: ['summary-processing-detail'],
    queryFn: async () => {
      const { data } = await supabase
        .from('processing_records')
        .select('id, input_qty, created_at, process_type, source_type, output_type, order_id, batch_id, batches(batch_number, material, thickness, width, make, coating, grade), processing_output_items(width, length)')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Dispatch details: coil sales with batch info
  const { data: coilSalesDetailData } = useQuery({
    queryKey: ['summary-coil-sales-detail'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_actions')
        .select('net_weight, sales_date, order_id, invoice_number, batch_id, batches(batch_number, material, thickness, width, length, make, coating, grade)')
        .in('action_type', ['pack_coil_sale', 'loose_coil_sale', 'sell', 'sales'])
        .order('sales_date', { ascending: false });
      return data || [];
    },
  });

  // FG sales with fg_item + sku info
  const { data: fgSalesDetailData } = useQuery({
    queryKey: ['summary-fg-sales-detail'],
    queryFn: async () => {
      const { data } = await supabase
        .from('fg_sales')
        .select('quantity, sales_date, order_id, invoice_number, fg_item_id, fg_items(material, thickness, width, length, process, make, coating, grade)')
        .order('sales_date', { ascending: false });
      return data || [];
    },
  });

  // Defective sales with batch info
  const { data: defSalesDetailData } = useQuery({
    queryKey: ['summary-def-sales-detail'],
    queryFn: async () => {
      const { data } = await supabase
        .from('defective_sales')
        .select('quantity, sales_date, order_id, invoice_number, batch_id, batches(batch_number, material, thickness, width, make, coating, grade)')
        .order('sales_date', { ascending: false });
      return data || [];
    },
  });

  // Fetch orders with customers for dispatch details
  const { data: ordersData } = useQuery({
    queryKey: ['summary-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('id, order_number, customers(customer_name)');
      return data || [];
    },
  });

  // Inward details: batches with status='received', using updated_at as received date
  const { data: inwardDetailData } = useQuery({
    queryKey: ['summary-inward-detail'],
    queryFn: async () => {
      const { data } = await supabase
        .from('batches')
        .select('id, batch_number, material, thickness, width, length, make, coating, grade, net_weight, gross_weight, purchase_from, updated_at, created_at, status')
        .eq('status', 'received')
        .order('updated_at', { ascending: false });
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

  const scrapTotal = useMemo(() => {
    const totalScrap = (scrapData || []).reduce((s, r) => s + (r.net_weight || 0), 0);
    const totalSold = (scrapSoldData || []).reduce((s, r) => s + (r.qty_sold || 0), 0);
    return totalScrap - totalSold;
  }, [scrapData, scrapSoldData]);

  const defectiveTotal = useMemo(() => {
    const fromActions = (defectiveActionData || []).reduce((s, r) => s + (r.net_weight || 0), 0);
    const fromFG = (fgDefectivesData || []).reduce((s, r) => s + (r.quantity || 0), 0);
    const sold = (defectiveSoldData || []).reduce((s, r) => s + (r.quantity || 0), 0);
    return fromActions + fromFG - sold;
  }, [defectiveActionData, fgDefectivesData, defectiveSoldData]);

  const inDateRange = (dateStr: string | null | undefined, range: DateRange) => {
    if (!range.from) return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= range.from && (!range.to || d <= range.to);
  };

  // Also fetch WIP items for input dimensions when source is WIP
  const { data: wipLookupData } = useQuery({
    queryKey: ['summary-wip-lookup'],
    queryFn: async () => {
      const { data } = await supabase.from('wip_items').select('id, source_batch_id, thickness, width, length');
      return data || [];
    },
  });

  // Processing filtered details
  const filteredProduction = useMemo(() => {
    return (processingDetailData || []).filter(r => inDateRange(r.created_at, prodRange));
  }, [processingDetailData, prodRange]);

  const productionTotal = useMemo(() => filteredProduction.reduce((s, r) => s + (r.input_qty || 0), 0), [filteredProduction]);

  // Dispatch filtered details
  const filteredDispatch = useMemo(() => {
    const orderMap = new Map<string, { order_number: string; customer_name: string }>();
    (ordersData || []).forEach((o: any) => {
      const entry = { order_number: o.order_number, customer_name: o.customers?.customer_name || '-' };
      orderMap.set(o.id, entry);
      // Also key by order_number since order_id in sales tables stores order_number text
      if (o.order_number) orderMap.set(o.order_number, entry);
    });

    const records: Array<{
      date: string;
      type: string;
      order_id: string;
      order_number: string;
      customer_name: string;
      sku: string;
      qty: number;
      invoice: string;
    }> = [];

    (coilSalesDetailData || []).filter(r => inDateRange(r.sales_date, dispatchRange)).forEach((r: any) => {
      const batch = r.batches;
      const order = r.order_id ? orderMap.get(r.order_id) : null;
      records.push({
        date: r.sales_date || '-',
        type: 'Coil',
        order_id: r.order_id || '-',
        order_number: order?.order_number || r.order_id || '-',
        customer_name: order?.customer_name || '-',
        sku: batch ? `${batch.material || ''} ${batch.thickness || ''}x${batch.width || ''}${batch.coating ? ' ' + batch.coating : ''}${batch.grade ? ' ' + batch.grade : ''}` : '-',
        qty: r.net_weight || 0,
        invoice: r.invoice_number || '-',
      });
    });

    (fgSalesDetailData || []).filter(r => inDateRange(r.sales_date, dispatchRange)).forEach((r: any) => {
      const fg = r.fg_items;
      const order = r.order_id ? orderMap.get(r.order_id) : null;
      records.push({
        date: r.sales_date || '-',
        type: 'FG',
        order_id: r.order_id || '-',
        order_number: order?.order_number || r.order_id || '-',
        customer_name: order?.customer_name || '-',
        sku: fg ? `${fg.material || ''} ${fg.thickness || ''}x${fg.width || ''}x${fg.length || ''}${fg.coating ? ' ' + fg.coating : ''}${fg.grade ? ' ' + fg.grade : ''}` : '-',
        qty: r.quantity || 0,
        invoice: r.invoice_number || '-',
      });
    });

    (defSalesDetailData || []).filter(r => inDateRange(r.sales_date, dispatchRange)).forEach((r: any) => {
      const batch = r.batches;
      const order = r.order_id ? orderMap.get(r.order_id) : null;
      records.push({
        date: r.sales_date || '-',
        type: 'Defective',
        order_id: r.order_id || '-',
        order_number: order?.order_number || r.order_id || '-',
        customer_name: order?.customer_name || '-',
        sku: batch ? `${batch.material || ''} ${batch.thickness || ''}x${batch.width || ''}${batch.coating ? ' ' + batch.coating : ''}` : '-',
        qty: r.quantity || 0,
        invoice: r.invoice_number || '-',
      });
    });

    return records.sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [coilSalesDetailData, fgSalesDetailData, defSalesDetailData, ordersData, dispatchRange]);

  const dispatchTotal = useMemo(() => filteredDispatch.reduce((s, r) => s + r.qty, 0), [filteredDispatch]);

  // Inward filtered details
  const filteredInward = useMemo(() => {
    return (inwardDetailData || []).filter(r => inDateRange(r.updated_at, inwardRange));
  }, [inwardDetailData, inwardRange]);

  const inwardTotal = useMemo(() => filteredInward.reduce((s, r) => s + (r.net_weight || 0), 0), [filteredInward]);

  const formatWeight = (val: number) => `${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;

  const summaryCards = [
    { label: 'In-Transit', value: inTransitTotal, icon: TruckIcon, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800' },
    { label: 'Coils Inventory', value: coilsTotal, icon: Warehouse, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800' },
    { label: 'WIP Inventory', value: wipTotal, icon: Layers, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800' },
    { label: 'FG Inventory', value: fgTotal, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800' },
  ];

  const smallCards = [
    { label: 'Scrap', value: scrapTotal, icon: Trash2, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800' },
    { label: 'Defective', value: defectiveTotal, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800' },
  ];

  return (
    <div className="space-y-6">
      {/* Main summary cards */}
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

      {/* Smaller Scrap & Defective cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {smallCards.map((card) => (
          <Card key={card.label} className={cn("border", card.border, card.bg)}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <card.icon className={cn("h-4 w-4", card.color)} />
                <div>
                  <p className="text-[10px] text-muted-foreground">{card.label}</p>
                  <p className={cn("text-sm font-semibold", card.color)}>{formatWeight(card.value)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Total Inward with date filter + expandable details */}
      <Collapsible open={inwardOpen} onOpenChange={setInwardOpen}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="h-5 w-5 text-teal-600" />
                <CardTitle className="text-base">Total Inward</CardTitle>
                <span className="ml-auto text-xl font-bold text-teal-600">{formatWeight(inwardTotal)}</span>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <ChevronDown className={cn("h-4 w-4 transition-transform", inwardOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <DateRangeFilter dateRange={inwardRange} setDateRange={setInwardRange} label="Period" />
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {filteredInward.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No inward records for selected period</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs font-semibold">Date</TableHead>
                        <TableHead className="text-xs font-semibold">Batch #</TableHead>
                        <TableHead className="text-xs font-semibold">Material</TableHead>
                        <TableHead className="text-xs font-semibold">Dimensions</TableHead>
                        <TableHead className="text-xs font-semibold">Make</TableHead>
                        <TableHead className="text-xs font-semibold">Coating</TableHead>
                        <TableHead className="text-xs font-semibold">Grade</TableHead>
                        <TableHead className="text-xs font-semibold">Supplier</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Net Wt (kg)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInward.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">{format(new Date(r.updated_at), 'dd/MM/yy')}</TableCell>
                          <TableCell className="text-xs font-mono">{r.batch_number}</TableCell>
                          <TableCell className="text-xs">{r.material || '-'}</TableCell>
                          <TableCell className="text-xs">{`${r.thickness ?? '-'} x ${r.width ?? '-'}`}</TableCell>
                          <TableCell className="text-xs">{r.make || '-'}</TableCell>
                          <TableCell className="text-xs">{r.coating || '-'}</TableCell>
                          <TableCell className="text-xs">{r.grade || '-'}</TableCell>
                          <TableCell className="text-xs">{r.purchase_from || '-'}</TableCell>
                          <TableCell className="text-xs text-right font-medium">{(r.net_weight || 0).toLocaleString('en-IN')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Production with date filter + expandable details */}
      <Collapsible open={prodOpen} onOpenChange={setProdOpen}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-indigo-600" />
                <CardTitle className="text-base">Total Production</CardTitle>
                <span className="ml-auto text-xl font-bold text-indigo-600">{formatWeight(productionTotal)}</span>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <ChevronDown className={cn("h-4 w-4 transition-transform", prodOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <DateRangeFilter dateRange={prodRange} setDateRange={setProdRange} label="Period" />
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {filteredProduction.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No production records for selected period</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs font-semibold">Date</TableHead>
                        <TableHead className="text-xs font-semibold">Type</TableHead>
                        <TableHead className="text-xs font-semibold">Source → Output</TableHead>
                        <TableHead className="text-xs font-semibold">Batch</TableHead>
                        <TableHead className="text-xs font-semibold">Material</TableHead>
                        <TableHead className="text-xs font-semibold">Input Dimensions</TableHead>
                        <TableHead className="text-xs font-semibold">Output Dimensions</TableHead>
                        
                        <TableHead className="text-xs font-semibold text-right">Input Qty (kg)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProduction.map((r: any) => {
                        const batch = r.batches;
                        const outputItems = r.processing_output_items || [];
                        // Input dimensions: from coil (batch) if source=coil, else from WIP
                        let inputDims = '-';
                        if (r.source_type === 'wip') {
                          // find WIP item by source_batch_id matching batch_id
                          const wipItem = (wipLookupData || []).find((w: any) => w.source_batch_id === r.batch_id);
                          if (wipItem) inputDims = `${wipItem.thickness ?? '-'} x ${wipItem.width ?? '-'}`;
                        } else if (batch) {
                          inputDims = `${batch.thickness ?? '-'} x ${batch.width ?? '-'}`;
                        }
                        // Output dimensions: from processing_output_items
                        let outputDims = '-';
                        if (outputItems.length > 0) {
                          const dimStrs = outputItems.map((oi: any) => `${oi.width ?? '-'} x ${oi.length ?? 'Coil'}`);
                          const unique = [...new Set(dimStrs)];
                          outputDims = unique.join(', ');
                        }
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs">{format(new Date(r.created_at), 'dd/MM/yy')}</TableCell>
                            <TableCell className="text-xs">{r.process_type}</TableCell>
                            <TableCell className="text-xs">
                              <span className="capitalize">{r.source_type}</span> → <span className="capitalize">{r.output_type}</span>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{batch?.batch_number || '-'}</TableCell>
                            <TableCell className="text-xs">{batch?.material || '-'}</TableCell>
                            <TableCell className="text-xs">{inputDims}</TableCell>
                            <TableCell className="text-xs">{outputDims}</TableCell>
                            
                            <TableCell className="text-xs text-right font-medium">{(r.input_qty || 0).toLocaleString('en-IN')}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Dispatch with date filter + expandable details */}
      <Collapsible open={dispatchOpen} onOpenChange={setDispatchOpen}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <ArrowDownUp className="h-5 w-5 text-rose-600" />
                <CardTitle className="text-base">Total Dispatch</CardTitle>
                <span className="ml-auto text-xl font-bold text-rose-600">{formatWeight(dispatchTotal)}</span>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <ChevronDown className={cn("h-4 w-4 transition-transform", dispatchOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <DateRangeFilter dateRange={dispatchRange} setDateRange={setDispatchRange} label="Period" />
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {filteredDispatch.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No dispatch records for selected period</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs font-semibold">Date</TableHead>
                        <TableHead className="text-xs font-semibold">Type</TableHead>
                        <TableHead className="text-xs font-semibold">Order #</TableHead>
                        <TableHead className="text-xs font-semibold">Customer</TableHead>
                        <TableHead className="text-xs font-semibold">SKU</TableHead>
                        <TableHead className="text-xs font-semibold">Invoice</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Qty (kg)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDispatch.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{r.date !== '-' ? format(new Date(r.date), 'dd/MM/yy') : '-'}</TableCell>
                          <TableCell className="text-xs">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-medium",
                              r.type === 'Coil' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                              r.type === 'FG' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                              'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            )}>
                              {r.type}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{r.order_number}</TableCell>
                          <TableCell className="text-xs">{r.customer_name}</TableCell>
                          <TableCell className="text-xs font-mono">{r.sku}</TableCell>
                          <TableCell className="text-xs">{r.invoice}</TableCell>
                          <TableCell className="text-xs text-right font-medium">{r.qty.toLocaleString('en-IN')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
