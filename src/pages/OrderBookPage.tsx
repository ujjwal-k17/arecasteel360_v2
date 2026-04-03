import { useState, useMemo, useRef } from 'react';
import { useOrders, useCustomers, useInsertOrder, useAllDispatches, useDeleteOrder } from '@/hooks/useOrders';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, ChevronDown, ChevronRight, Pencil, Download, Upload, Trash2, X, XCircle, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import NewOrderDialog from '@/components/NewOrderDialog';
import { parseOrderExcel, downloadOrdersExcel, generateOrderTemplate } from '@/lib/order-excel-utils';
import { toast } from 'sonner';
import { getSkuLabel } from '@/lib/sku-utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useActionLog, useSubmitApproval } from '@/hooks/useActionLog';
import { useUndoAction } from '@/hooks/useUndoAction';



const skuKey = (item: { material?: string | null; thickness?: number | null; width?: number | null; length?: number | null; coating?: string | null; grade?: string | null }) =>
  [item.material || '', item.thickness ?? '', item.width ?? '', item.length ?? '', item.coating || '', item.grade || ''].join('|');

type DatePreset = 'all' | 'current_month' | 'today' | 'custom';
type SortField = 'order_number' | 'customer_name' | 'order_date';
type SortDir = 'asc' | 'desc' | null;

export default function OrderBookPage() {
  const { data: orders, isLoading } = useOrders();
  const { data: customers } = useCustomers();
  const { data: allDispatches } = useAllDispatches();
  const [showNew, setShowNew] = useState(false);
  const [editOrder, setEditOrder] = useState<any>(null);
  const [deleteOrder, setDeleteOrder] = useState<any>(null);
  const [closeOrder, setCloseOrder] = useState<any>(null);
  const [reopenOrder, setReopenOrder] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const insertOrder = useInsertOrder();
  const deleteOrderMutation = useDeleteOrder();
  const { isAdmin } = useAuth();
  const logAction = useActionLog();
  const submitApproval = useSubmitApproval();
  const { performAction } = useUndoAction();
  const fileRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterOrderId, setFilterOrderId] = useState('');
  const [filterPoNumber, setFilterPoNumber] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterOrderDate, setFilterOrderDate] = useState('');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Date range
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
      case 'current_month':
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case 'today':
        return { from: startOfDay(now), to: endOfDay(now) };
      case 'custom':
        return { from: customFrom, to: customTo };
      default:
        return { from: undefined, to: undefined };
    }
  }, [datePreset, customFrom, customTo]);

  // Close/Reopen order mutations
  const updateOrderStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  // Fetch coil sales
  const { data: coilSales } = useQuery({
    queryKey: ['coil_sales_for_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_actions')
        .select('*, batches(*)')
        .in('action_type', ['pack_coil_sale', 'loose_coil_sale'])
        .not('order_id', 'is', null);
      if (error) throw error;
      return data;
    },
  });

  // Fetch FG sales
  const { data: fgSales } = useQuery({
    queryKey: ['fg_sales_for_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fg_sales' as any)
        .select('*, fg_items(*)')
        .not('order_id', 'is', null);
      if (error) throw error;
      return data as any[];
    },
  });

  const salesByOrder = useMemo(() => {
    const map: Record<string, Record<string, { label: string; qty: number }>> = {};
    const addSale = (orderNumber: string, item: any, qty: number) => {
      if (!orderNumber || !item) return;
      const key = skuKey(item);
      if (!map[orderNumber]) map[orderNumber] = {};
      if (!map[orderNumber][key]) {
        map[orderNumber][key] = { label: getSkuLabel(item), qty: 0 };
      }
      map[orderNumber][key].qty += qty;
    };
    for (const s of coilSales || []) {
      const batch = (s as any).batches;
      if (batch && s.order_id) addSale(s.order_id, batch, s.net_weight || 0);
    }
    for (const s of fgSales || []) {
      const fgItem = (s as any).fg_items;
      if (fgItem && s.order_id) addSale(s.order_id, fgItem, s.quantity || 0);
    }
    return map;
  }, [coilSales, fgSales]);

  const dispatchMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (allDispatches) {
      for (const d of allDispatches) {
        map[d.order_item_id] = (map[d.order_item_id] || 0) + (Number(d.dispatch_qty) || 0);
      }
    }
    return map;
  }, [allDispatches]);

  const getOrderTotals = (order: any) => {
    const items = order.order_items || [];
    const total = items.reduce((s: number, i: any) => s + (Number(i.net_weight) || 0), 0);
    const orderSales = salesByOrder[order.order_number] || {};
    const totalDispatched = Object.values(orderSales).reduce((s, v) => s + v.qty, 0);
    return { total, dispatched: totalDispatched, balance: total - totalDispatched };
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getSubRows = (order: any) => {
    const orderItems = order.order_items || [];
    const orderSales = salesByOrder[order.order_number] || {};
    const matchedKeys = new Set<string>();
    const rows: { key: string; label: string; form: string; comments: string; orderQty: number; dispatchQty: number; isExtra: boolean }[] = [];
    for (const item of orderItems) {
      const key = skuKey(item);
      const salesEntry = orderSales[key];
      const dq = salesEntry ? salesEntry.qty : 0;
      if (salesEntry) matchedKeys.add(key);
      rows.push({ key: item.id, label: getSkuLabel(item), form: item.form || '-', comments: item.comments || '', orderQty: Number(item.net_weight) || 0, dispatchQty: dq, isExtra: false });
    }
    for (const [key, entry] of Object.entries(orderSales)) {
      if (!matchedKeys.has(key)) {
        rows.push({ key: `extra-${key}`, label: entry.label, form: '-', comments: '', orderQty: 0, dispatchQty: entry.qty, isExtra: true });
      }
    }
    return rows;
  };

  // Split orders into open and closed
  const openOrders = useMemo(() => (orders || []).filter((o: any) => o.status !== 'closed'), [orders]);
  const closedOrders = useMemo(() => (orders || []).filter((o: any) => o.status === 'closed'), [orders]);

  // Apply filters to a list of orders
  const applyFilters = (orderList: any[]) => {
    return orderList.filter((o: any) => {
      if (filterOrderId && !o.order_number?.toLowerCase().includes(filterOrderId.toLowerCase())) return false;
      if (filterPoNumber && !(o.po_number || '').toLowerCase().includes(filterPoNumber.toLowerCase())) return false;
      if (filterCustomer && !(o.customers as any)?.customer_name?.toLowerCase().includes(filterCustomer.toLowerCase())) return false;
      if (filterOrderDate && !(o.order_date || '').includes(filterOrderDate)) return false;
      if (dateRange.from || dateRange.to) {
        const od = o.order_date ? new Date(o.order_date) : null;
        if (!od) return false;
        if (dateRange.from && od < dateRange.from) return false;
        if (dateRange.to && od > dateRange.to) return false;
      }
      return true;
    });
  };

  const filteredOpenOrders = useMemo(() => applyFilters(openOrders), [openOrders, filterOrderId, filterPoNumber, filterCustomer, filterOrderDate, dateRange]);
  const filteredClosedOrders = useMemo(() => applyFilters(closedOrders), [closedOrders, filterOrderId, filterPoNumber, filterCustomer, filterOrderDate, dateRange]);

  // Summary totals
  const summaryTotals = useMemo(() => {
    let totalOrder = 0, totalDispatch = 0;
    for (const o of filteredOpenOrders) {
      const t = getOrderTotals(o);
      totalOrder += t.total;
      totalDispatch += t.dispatched;
    }
    return { totalOrder, totalDispatch, totalBalance: totalOrder - totalDispatch };
  }, [filteredOpenOrders, salesByOrder]);

  const hasFilters = filterOrderId || filterPoNumber || filterCustomer || filterOrderDate;
  const clearFilters = () => {
    setFilterOrderId('');
    setFilterPoNumber('');
    setFilterCustomer('');
    setFilterOrderDate('');
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseOrderExcel(file);
      if (rows.length === 0) { toast.error('No valid rows found'); return; }
      const grouped: Record<string, typeof rows> = {};
      rows.forEach(r => {
        if (!grouped[r.order_number]) grouped[r.order_number] = [];
        grouped[r.order_number].push(r);
      });
      let created = 0;
      const skipReasons: string[] = [];
      for (const [orderNum, items] of Object.entries(grouped)) {
        const custName = items[0].customer_name;
        const cust = customers?.find(c => c.customer_name.toLowerCase() === custName?.toLowerCase());
        if (!cust) { skipReasons.push(`Order "${orderNum}": Customer "${custName || '(empty)'}" not found in master data`); continue; }
        try {
          await insertOrder.mutateAsync({
            order: { order_number: orderNum, customer_id: cust.id, comments: items[0].comments || undefined, order_date: items[0].order_date || undefined },
            items: items.filter(i => i.material || i.net_weight).map(i => ({ material: i.material, form: i.form, thickness: i.thickness, width: i.width, length: i.length, coating: i.coating, grade: i.grade, net_weight: i.net_weight, comments: i.item_comments })),
          });
          created++;
        } catch (insertErr: any) { skipReasons.push(`Order "${orderNum}": ${insertErr?.message || 'Insert failed'}`); }
      }
      if (skipReasons.length > 0) {
        toast.error(`${skipReasons.length} order(s) skipped:\n${skipReasons.slice(0, 5).join('\n')}${skipReasons.length > 5 ? `\n...and ${skipReasons.length - 5} more` : ''}`, { duration: 10000 });
      }
      if (created > 0) toast.success(`Imported ${created} order(s)`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse Excel');
    }
    e.target.value = '';
  };

  const renderFilterHeaders = () => (
    <TableRow>
      <TableHead className="w-8"></TableHead>
      <TableHead>
        <div className="space-y-1">
          <span>Order ID</span>
          <Input placeholder="Filter..." value={filterOrderId} onChange={e => setFilterOrderId(e.target.value)} className="h-7 text-xs" />
        </div>
      </TableHead>
      <TableHead>
        <div className="space-y-1">
          <span>PO Number</span>
          <Input placeholder="Filter..." value={filterPoNumber} onChange={e => setFilterPoNumber(e.target.value)} className="h-7 text-xs" />
        </div>
      </TableHead>
      <TableHead>
        <div className="space-y-1">
          <span>Customer Name</span>
          <Input placeholder="Filter..." value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="h-7 text-xs" />
        </div>
      </TableHead>
      <TableHead>
        <div className="space-y-1">
          <span>Order Date</span>
          <Input placeholder="YYYY-MM-DD" value={filterOrderDate} onChange={e => setFilterOrderDate(e.target.value)} className="h-7 text-xs" />
        </div>
      </TableHead>
      <TableHead className="text-right">Total Order Qty (Kg)</TableHead>
      <TableHead className="text-right">Dispatch Qty (Kg)</TableHead>
      <TableHead className="text-right">Balance Qty (Kg)</TableHead>
      <TableHead className="text-right">
        Actions
        {hasFilters && (
          <Button variant="ghost" size="sm" className="ml-1 h-6 px-1 text-xs" onClick={clearFilters}>
            <X className="h-3 w-3 mr-0.5" /> Clear
          </Button>
        )}
      </TableHead>
    </TableRow>
  );

  const renderSubRows = (o: any) => {
    const subRows = getSubRows(o);
    if (subRows.length === 0) return null;
    return (
      <TableRow key={`${o.id}-sub`}>
        <TableCell colSpan={9} className="p-0 bg-muted/20">
          <div className="px-8 py-2">
            {o.comments && (
              <div className="mb-2 text-xs text-muted-foreground bg-muted/30 rounded px-3 py-1.5">
                <span className="font-semibold">Order Comments:</span> {o.comments}
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Form</TableHead>
                  <TableHead className="text-xs text-right">Order Qty (Kg)</TableHead>
                  <TableHead className="text-xs text-right">Dispatch Qty (Kg)</TableHead>
                  <TableHead className="text-xs text-right">Balance Qty (Kg)</TableHead>
                  <TableHead className="text-xs">Comments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subRows.filter(r => !r.isExtra).map(row => (
                  <TableRow key={row.key}>
                    <TableCell className="text-xs">{row.label}</TableCell>
                    <TableCell className="text-xs">{row.form}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{row.orderQty.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{row.dispatchQty.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{(row.orderQty - row.dispatchQty).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.comments || '-'}</TableCell>
                  </TableRow>
                ))}
                {subRows.some(r => r.isExtra) && (
                  <>
                    <TableRow>
                      <TableCell colSpan={6} className="text-xs font-semibold text-muted-foreground pt-3 pb-1 border-t">
                        Additional dispatches (not in order)
                      </TableCell>
                    </TableRow>
                    {subRows.filter(r => r.isExtra).map(row => (
                      <TableRow key={row.key}>
                        <TableCell className="text-xs">
                          {row.label}
                          <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">New</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{row.form}</TableCell>
                        <TableCell className="text-xs text-right font-mono text-muted-foreground">-</TableCell>
                        <TableCell className="text-xs text-right font-mono">{row.dispatchQty.toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-mono text-muted-foreground">-</TableCell>
                        <TableCell className="text-xs text-muted-foreground">-</TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderOrderRow = (o: any, mode: 'open' | 'closed') => {
    const totals = getOrderTotals(o);
    const isExpanded = expanded.has(o.id);
    return (
      <>
        <TableRow key={o.id} className="cursor-pointer" onClick={() => toggleExpand(o.id)}>
          <TableCell className="w-8 px-2">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </TableCell>
          <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
          <TableCell className="text-xs">{o.po_number || '-'}</TableCell>
          <TableCell>{(o.customers as any)?.customer_name || '-'}</TableCell>
          <TableCell className="text-xs">{o.order_date || '-'}</TableCell>
          <TableCell className="text-right font-mono">{totals.total.toFixed(2)}</TableCell>
          <TableCell className="text-right font-mono">{totals.dispatched.toFixed(2)}</TableCell>
          <TableCell className="text-right font-mono">{totals.balance.toFixed(2)}</TableCell>
          <TableCell className="text-right">
            <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
              {mode === 'open' ? (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditOrder(o); setShowNew(true); }} title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700" onClick={() => setCloseOrder(o)} title="Close Order">
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteOrder(o)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-green-600 hover:text-green-700" onClick={() => setReopenOrder(o)} title="Re-open Order">
                  <RotateCcw className="h-3.5 w-3.5" /> Re-open
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
        {isExpanded && renderSubRows(o)}
      </>
    );
  };

  return (
    <div className="container py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Order Book</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => {
            qc.invalidateQueries({ queryKey: ['orders'] });
            qc.invalidateQueries({ queryKey: ['coil_sales_for_orders'] });
            qc.invalidateQueries({ queryKey: ['fg_sales_for_orders'] });
          }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={generateOrderTemplate}>
            <Download className="h-4 w-4 mr-1" /> Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadOrdersExcel(orders || [], allDispatches || [])}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
          <Button onClick={() => { setEditOrder(null); setShowNew(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Order
          </Button>
        </div>
      </div>

      {/* Date range tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Period:</span>
        {(['all', 'current_month', 'today', 'custom'] as DatePreset[]).map(preset => (
          <Button
            key={preset}
            variant={datePreset === preset ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDatePreset(preset)}
          >
            {preset === 'all' ? 'All' : preset === 'current_month' ? 'Current Month' : preset === 'today' ? 'Today' : 'Custom'}
          </Button>
        ))}
        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('w-[130px] justify-start text-left font-normal', !customFrom && 'text-muted-foreground')}>
                  {customFrom ? format(customFrom, 'dd/MM/yyyy') : 'From'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground">–</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('w-[130px] justify-start text-left font-normal', !customTo && 'text-muted-foreground')}>
                  {customTo ? format(customTo, 'dd/MM/yyyy') : 'To'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Total Order Qty</p>
            <p className="text-xl font-bold font-mono">{summaryTotals.totalOrder.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">Kg</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Total Dispatch Qty</p>
            <p className="text-xl font-bold font-mono">{summaryTotals.totalDispatch.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">Kg</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Total Balance Qty</p>
            <p className="text-xl font-bold font-mono">{summaryTotals.totalBalance.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">Kg</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Open / Closed / Customer View */}
      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open" className="gap-1.5">
            Open Orders
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{filteredOpenOrders.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="closed" className="gap-1.5">
            Closed Orders
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{filteredClosedOrders.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="customer">Customer View</TabsTrigger>
        </TabsList>

        <TabsContent value="open">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                {renderFilterHeaders()}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filteredOpenOrders.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No open orders found</TableCell></TableRow>
                ) : filteredOpenOrders.map((o: any) => renderOrderRow(o, 'open'))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="closed">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                {renderFilterHeaders()}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filteredClosedOrders.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No closed orders</TableCell></TableRow>
                ) : filteredClosedOrders.map((o: any) => renderOrderRow(o, 'closed'))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="customer">
          {(() => {
            // Group open orders by customer
            const customerGroups: Record<string, { name: string; orders: any[]; totalOrder: number; totalDispatched: number }> = {};
            for (const o of filteredOpenOrders) {
              const custName = (o.customers as any)?.customer_name || 'Unknown';
              if (!customerGroups[custName]) customerGroups[custName] = { name: custName, orders: [], totalOrder: 0, totalDispatched: 0 };
              const t = getOrderTotals(o);
              customerGroups[custName].orders.push(o);
              customerGroups[custName].totalOrder += t.total;
              customerGroups[custName].totalDispatched += t.dispatched;
            }
            const groups = Object.values(customerGroups).sort((a, b) => a.name.localeCompare(b.name));
            return (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Total Order Qty (Kg)</TableHead>
                      <TableHead className="text-right">Dispatch Qty (Kg)</TableHead>
                      <TableHead className="text-right">Balance Qty (Kg)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No orders</TableCell></TableRow>
                    ) : groups.map(g => {
                      const isExp = expanded.has(`cust-${g.name}`);
                      const balance = g.totalOrder - g.totalDispatched;
                      return (
                        <>
                          <TableRow key={`cust-${g.name}`} className="cursor-pointer hover:bg-muted/30 bg-muted/10 font-medium" onClick={() => toggleExpand(`cust-${g.name}`)}>
                            <TableCell className="w-8 px-2">{isExp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                            <TableCell className="font-semibold">{g.name}</TableCell>
                            <TableCell className="text-right">{g.orders.length}</TableCell>
                            <TableCell className="text-right font-mono">{g.totalOrder.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono">{g.totalDispatched.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono">{balance.toFixed(2)}</TableCell>
                          </TableRow>
                          {isExp && (
                            <TableRow key={`cust-${g.name}-items`}>
                              <TableCell colSpan={6} className="p-0 bg-muted/20">
                                <div className="px-4 py-2">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">Order ID</TableHead>
                                        <TableHead className="text-xs">PO Number</TableHead>
                                        <TableHead className="text-xs">Order Date</TableHead>
                                        <TableHead className="text-xs">SKU</TableHead>
                                        <TableHead className="text-xs">Form</TableHead>
                                        <TableHead className="text-xs text-right">Order Qty (Kg)</TableHead>
                                        <TableHead className="text-xs text-right">Dispatch Qty (Kg)</TableHead>
                                        <TableHead className="text-xs text-right">Balance Qty (Kg)</TableHead>
                                        <TableHead className="text-xs">Comments</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {g.orders.map((o: any) => {
                                        const subRows = getSubRows(o);
                                        return subRows.filter(r => !r.isExtra).map((row, idx) => (
                                          <TableRow key={`${o.id}-${row.key}`}>
                                            {idx === 0 ? (
                                              <TableCell className="text-xs font-mono" rowSpan={subRows.filter(r => !r.isExtra).length}>
                                                {o.order_number}
                                              </TableCell>
                                            ) : null}
                                            {idx === 0 ? (
                                              <TableCell className="text-xs" rowSpan={subRows.filter(r => !r.isExtra).length}>
                                                {o.po_number || '-'}
                                              </TableCell>
                                            ) : null}
                                            {idx === 0 ? (
                                              <TableCell className="text-xs" rowSpan={subRows.filter(r => !r.isExtra).length}>
                                                {o.order_date || '-'}
                                              </TableCell>
                                            ) : null}
                                            <TableCell className="text-xs">{row.label}</TableCell>
                                            <TableCell className="text-xs">{row.form}</TableCell>
                                            <TableCell className="text-xs text-right font-mono">{row.orderQty.toFixed(2)}</TableCell>
                                            <TableCell className="text-xs text-right font-mono">{row.dispatchQty.toFixed(2)}</TableCell>
                                            <TableCell className="text-xs text-right font-mono">{(row.orderQty - row.dispatchQty).toFixed(2)}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{row.comments || '-'}</TableCell>
                                          </TableRow>
                                        ));
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      <NewOrderDialog open={showNew} onOpenChange={setShowNew} editOrder={editOrder} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteOrder} onOpenChange={(open) => { if (!open) setDeleteOrder(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              {isAdmin
                ? <>Are you sure you want to delete order <strong>{deleteOrder?.order_number}</strong>? This will also remove all items and dispatch records.</>
                : <>Request deletion of order <strong>{deleteOrder?.order_number}</strong>? This will be sent to admin for approval.</>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  if (isAdmin) {
                    const orderData = deleteOrder;
                    await performAction({
                      execute: async () => {
                        await deleteOrderMutation.mutateAsync(orderData.id);
                        logAction.mutate({ action_type: 'delete', entity_type: 'order', entity_id: orderData.id, description: `Deleted order ${orderData.order_number}` });
                      },
                      undo: async () => {
                        // Re-insert the order
                        const { error } = await supabase.from('orders').insert({
                          id: orderData.id,
                          order_number: orderData.order_number,
                          customer_id: orderData.customer_id,
                          comments: orderData.comments,
                          order_date: orderData.order_date,
                          po_number: orderData.po_number,
                          status: orderData.status,
                        });
                        if (error) throw error;
                        qc.invalidateQueries({ queryKey: ['orders'] });
                      },
                      successMessage: `Order ${orderData.order_number} deleted`,
                      undoMessage: `Order ${orderData.order_number} restored`,
                    });
                  } else {
                    await submitApproval.mutateAsync({
                      action_type: 'delete',
                      entity_type: 'order',
                      entity_id: deleteOrder.id,
                      description: `Delete order ${deleteOrder.order_number}`,
                    });
                    toast.success('Deletion request submitted for admin approval');
                  }
                  setDeleteOrder(null);
                } catch (e: any) {
                  toast.error(e.message || 'Failed to process request');
                }
              }}
            >
              {isAdmin ? 'Delete' : 'Request Deletion'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Close order confirmation */}
      <AlertDialog open={!!closeOrder} onOpenChange={(open) => { if (!open) setCloseOrder(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close order <strong>{closeOrder?.order_number}</strong>? It will be moved to the Closed Orders tab. You can re-open it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await updateOrderStatus.mutateAsync({ orderId: closeOrder.id, status: 'closed' });
                  toast.success(`Order ${closeOrder.order_number} closed`);
                  setCloseOrder(null);
                } catch (e: any) {
                  toast.error(e.message || 'Failed to close order');
                }
              }}
            >
              Close Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Re-open order confirmation */}
      <AlertDialog open={!!reopenOrder} onOpenChange={(open) => { if (!open) setReopenOrder(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-open Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to re-open order <strong>{reopenOrder?.order_number}</strong>? It will be moved back to Open Orders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await updateOrderStatus.mutateAsync({ orderId: reopenOrder.id, status: 'open' });
                  toast.success(`Order ${reopenOrder.order_number} re-opened`);
                  setReopenOrder(null);
                } catch (e: any) {
                  toast.error(e.message || 'Failed to re-open order');
                }
              }}
            >
              Re-open
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
