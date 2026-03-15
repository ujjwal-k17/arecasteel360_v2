import { useState, useMemo, useRef } from 'react';
import { useOrders, useCustomers, useInsertOrder, useAllDispatches, useDeleteOrder } from '@/hooks/useOrders';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, ChevronDown, ChevronRight, Pencil, ShoppingCart, Download, Upload, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useQueryClient } from '@tanstack/react-query';
import NewOrderDialog from '@/components/NewOrderDialog';
import OrderSalesDialog from '@/components/OrderSalesDialog';
import { parseOrderExcel, downloadOrdersExcel, generateOrderTemplate } from '@/lib/order-excel-utils';
import { toast } from 'sonner';
import { getSkuLabel } from '@/lib/sku-utils';

export default function OrderBookPage() {
  const { data: orders, isLoading } = useOrders();
  const { data: customers } = useCustomers();
  const { data: allDispatches } = useAllDispatches();
  const [showNew, setShowNew] = useState(false);
  const [editOrder, setEditOrder] = useState<any>(null);
  const [salesOrder, setSalesOrder] = useState<any>(null);
  const [deleteOrder, setDeleteOrder] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const insertOrder = useInsertOrder();
  const deleteOrderMutation = useDeleteOrder();
  const fileRef = useRef<HTMLInputElement>(null);

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

  const getOrderTotals = (items: any[]) => {
    if (!items) return { total: 0, dispatched: 0, balance: 0 };
    const total = items.reduce((s: number, i: any) => s + (Number(i.net_weight) || 0), 0);
    const dispatched = items.reduce((s: number, i: any) => s + getItemDispatched(i.id), 0);
    return { total, dispatched, balance: total - dispatched };
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseOrderExcel(file);
      if (rows.length === 0) { toast.error('No valid rows found'); return; }

      // Group by order_number
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
          <Button variant="outline" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ['orders'] })}>
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
              const totals = getOrderTotals(o.order_items);
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
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditOrder(o); setShowNew(true); }} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSalesOrder(o)} title="Sales">
                          <ShoppingCart className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteOrder(o)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && o.order_items?.length > 0 && (
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
                              {o.order_items.map((item: any) => {
                                const oq = Number(item.net_weight) || 0;
                                const dq = getItemDispatched(item.id);
                                return (
                                  <TableRow key={item.id}>
                                    <TableCell className="text-xs">{getSKULabel(item)}</TableCell>
                                    <TableCell className="text-xs text-right font-mono">{oq.toFixed(2)}</TableCell>
                                    <TableCell className="text-xs text-right font-mono">{dq.toFixed(2)}</TableCell>
                                    <TableCell className="text-xs text-right font-mono">{(oq - dq).toFixed(2)}</TableCell>
                                  </TableRow>
                                );
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

      <NewOrderDialog open={showNew} onOpenChange={setShowNew} editOrder={editOrder} />
      {salesOrder && (
        <OrderSalesDialog open={!!salesOrder} onOpenChange={() => setSalesOrder(null)} order={salesOrder} />
      )}

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
