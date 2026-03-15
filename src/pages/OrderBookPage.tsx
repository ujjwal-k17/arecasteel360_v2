import { useState, useMemo, useRef } from 'react';
import { useOrders, useCustomers, useInsertOrder, useAllDispatches, useDeleteOrder } from '@/hooks/useOrders';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, ChevronDown, ChevronRight, Pencil, Download, Upload, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import NewOrderDialog from '@/components/NewOrderDialog';

import { parseOrderExcel, downloadOrdersExcel, generateOrderTemplate } from '@/lib/order-excel-utils';
import { toast } from 'sonner';
import { getSkuLabel } from '@/lib/sku-utils';
import { Badge } from '@/components/ui/badge';

/** Build a SKU key from dimension fields for matching */
const skuKey = (item: { material?: string | null; thickness?: number | null; width?: number | null; length?: number | null; coating?: string | null; grade?: string | null }) =>
  [item.material || '', item.thickness ?? '', item.width ?? '', item.length ?? '', item.coating || '', item.grade || ''].join('|');

export default function OrderBookPage() {
  const { data: orders, isLoading } = useOrders();
  const { data: customers } = useCustomers();
  const { data: allDispatches } = useAllDispatches();
  const [showNew, setShowNew] = useState(false);
  const [editOrder, setEditOrder] = useState<any>(null);
  
  const [deleteOrder, setDeleteOrder] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const insertOrder = useInsertOrder();
  const deleteOrderMutation = useDeleteOrder();
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch coil sales (pack_coil_sale & loose_coil_sale) with batch info
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

  // Fetch FG sales with fg_item info
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

  // Build a map: order_number -> { skuKey -> { label, qty, source } }
  const salesByOrder = useMemo(() => {
    const map: Record<string, Record<string, { label: string; qty: number; material?: string; thickness?: number; width?: number; length?: number; coating?: string; grade?: string }>> = {};

    const addSale = (orderNumber: string, item: any, qty: number) => {
      if (!orderNumber || !item) return;
      const key = skuKey(item);
      if (!map[orderNumber]) map[orderNumber] = {};
      if (!map[orderNumber][key]) {
        map[orderNumber][key] = {
          label: getSkuLabel(item),
          qty: 0,
          material: item.material,
          thickness: item.thickness,
          width: item.width,
          length: item.length,
          coating: item.coating,
          grade: item.grade,
        };
      }
      map[orderNumber][key].qty += qty;
    };

    // Coil sales
    for (const s of coilSales || []) {
      const batch = (s as any).batches;
      if (batch && s.order_id) {
        addSale(s.order_id, batch, s.net_weight || 0);
      }
    }

    // FG sales
    for (const s of fgSales || []) {
      const fgItem = (s as any).fg_items;
      if (fgItem && s.order_id) {
        addSale(s.order_id, fgItem, s.quantity || 0);
      }
    }

    return map;
  }, [coilSales, fgSales]);

  // Keep legacy dispatch map for order_dispatches
  const dispatchMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (allDispatches) {
      for (const d of allDispatches) {
        map[d.order_item_id] = (map[d.order_item_id] || 0) + (Number(d.dispatch_qty) || 0);
      }
    }
    return map;
  }, [allDispatches]);

  const getItemDispatched = (itemId: string) => dispatchMap[itemId] || 0;

  // Compute order totals using sales-based dispatch
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

  // Build sub-table rows: order items + extra sold SKUs
  const getSubRows = (order: any) => {
    const orderItems = order.order_items || [];
    const orderSales = salesByOrder[order.order_number] || {};

    // Track which sales SKU keys are matched to order items
    const matchedKeys = new Set<string>();

    const rows: { key: string; label: string; orderQty: number; dispatchQty: number; isExtra: boolean }[] = [];

    // Order items with their matched dispatch qty
    for (const item of orderItems) {
      const key = skuKey(item);
      const salesEntry = orderSales[key];
      const dq = salesEntry ? salesEntry.qty : 0;
      if (salesEntry) matchedKeys.add(key);

      rows.push({
        key: item.id,
        label: getSkuLabel(item),
        orderQty: Number(item.net_weight) || 0,
        dispatchQty: dq,
        isExtra: false,
      });
    }

    // Extra SKUs sold but not in order items
    for (const [key, entry] of Object.entries(orderSales)) {
      if (!matchedKeys.has(key)) {
        rows.push({
          key: `extra-${key}`,
          label: entry.label,
          orderQty: 0,
          dispatchQty: entry.qty,
          isExtra: true,
        });
      }
    }

    return rows;
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
      let skipped = 0;
      for (const [orderNum, items] of Object.entries(grouped)) {
        const custName = items[0].customer_name;
        const cust = customers?.find(c => c.customer_name.toLowerCase() === custName?.toLowerCase());
        if (!cust) { skipped++; continue; }

        try {
          await insertOrder.mutateAsync({
            order: {
              order_number: orderNum,
              customer_id: cust.id,
              comments: items[0].comments || undefined,
              order_date: items[0].order_date || undefined,
            },
            items: items.filter(i => i.material || i.net_weight).map(i => ({
              material: i.material,
              form: i.form,
              thickness: i.thickness,
              width: i.width,
              length: i.length,
              coating: i.coating,
              grade: i.grade,
              net_weight: i.net_weight,
              comments: i.item_comments,
            })),
          });
          created++;
        } catch {
          skipped++;
        }
      }
      toast.success(`Imported ${created} orders${skipped > 0 ? `, ${skipped} skipped` : ''}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse Excel');
    }
    e.target.value = '';
  };

  return (
    <div className="container py-6 space-y-4">
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

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Order ID</TableHead>
              <TableHead>PO Number</TableHead>
              <TableHead>Customer Name</TableHead>
              <TableHead>Order Date</TableHead>
              <TableHead className="text-right">Total Order Qty (Kg)</TableHead>
              <TableHead className="text-right">Dispatch Qty (Kg)</TableHead>
              <TableHead className="text-right">Balance Qty (Kg)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !orders || orders.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No orders yet</TableCell></TableRow>
            ) : orders.map((o: any) => {
              const totals = getOrderTotals(o);
              const isExpanded = expanded.has(o.id);
              const subRows = isExpanded ? getSubRows(o) : [];
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
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditOrder(o); setShowNew(true); }} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteOrder(o)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && subRows.length > 0 && (
                    <TableRow key={`${o.id}-sub`}>
                      <TableCell colSpan={9} className="p-0 bg-muted/20">
                        <div className="px-8 py-2">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">SKU</TableHead>
                                <TableHead className="text-xs text-right">Order Qty (Kg)</TableHead>
                                <TableHead className="text-xs text-right">Dispatch Qty (Kg)</TableHead>
                                <TableHead className="text-xs text-right">Balance Qty (Kg)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {subRows.filter(r => !r.isExtra).map(row => (
                                <TableRow key={row.key}>
                                  <TableCell className="text-xs">{row.label}</TableCell>
                                  <TableCell className="text-xs text-right font-mono">{row.orderQty.toFixed(2)}</TableCell>
                                  <TableCell className="text-xs text-right font-mono">{row.dispatchQty.toFixed(2)}</TableCell>
                                  <TableCell className="text-xs text-right font-mono">{(row.orderQty - row.dispatchQty).toFixed(2)}</TableCell>
                                </TableRow>
                              ))}
                              {subRows.some(r => r.isExtra) && (
                                <>
                                  <TableRow>
                                    <TableCell colSpan={4} className="text-xs font-semibold text-muted-foreground pt-3 pb-1 border-t">
                                      Additional dispatches (not in order)
                                    </TableCell>
                                  </TableRow>
                                  {subRows.filter(r => r.isExtra).map(row => (
                                    <TableRow key={row.key}>
                                      <TableCell className="text-xs">
                                        {row.label}
                                        <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">New</Badge>
                                      </TableCell>
                                      <TableCell className="text-xs text-right font-mono text-muted-foreground">-</TableCell>
                                      <TableCell className="text-xs text-right font-mono">{row.dispatchQty.toFixed(2)}</TableCell>
                                      <TableCell className="text-xs text-right font-mono text-muted-foreground">-</TableCell>
                                    </TableRow>
                                  ))}
                                </>
                              )}
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

      <NewOrderDialog open={showNew} onOpenChange={setShowNew} editOrder={editOrder} />

      <AlertDialog open={!!deleteOrder} onOpenChange={(open) => { if (!open) setDeleteOrder(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete order <strong>{deleteOrder?.order_number}</strong>? This will also remove all items and dispatch records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await deleteOrderMutation.mutateAsync(deleteOrder.id);
                  toast.success('Order deleted');
                  setDeleteOrder(null);
                } catch (e: any) {
                  toast.error(e.message || 'Failed to delete order');
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
