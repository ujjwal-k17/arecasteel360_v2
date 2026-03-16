import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { usePackCoilSale } from '@/hooks/useProcessing';
import { useInsertAction } from '@/hooks/useBatches';
import type { Batch, InventoryAction } from '@/hooks/useBatches';
import { calcUsableBalanceQty } from '@/hooks/useBatches';
import { useCustomers, useOrders, useAllDispatches } from '@/hooks/useOrders';

interface Props {
  batch: Batch;
  allActions: InventoryAction[];
  processingRecords: any[];
  open: boolean;
  onClose: () => void;
  mode: 'pack' | 'loose';
}

export default function PackCoilSaleDialog({ batch, allActions, processingRecords, open, onClose, mode }: Props) {
  const packCoilSale = usePackCoilSale();
  const insertAction = useInsertAction();
  const usableQty = calcUsableBalanceQty(batch, allActions, processingRecords);
  const { data: customers } = useCustomers();
  const { data: orders } = useOrders();
  const { data: allDispatches } = useAllDispatches();

  const [customerId, setCustomerId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [salesDate, setSalesDate] = useState('');
  const [salesQty, setSalesQty] = useState('');

  const isLoose = mode === 'loose';
  const title = isLoose ? 'Loose Coil Sale' : 'Pack Coil Sale';

  // SKU label from batch
  const skuLabel = useMemo(() => {
    const parts = [
      batch.material,
      batch.thickness ? `${batch.thickness}mm` : null,
      batch.width ? `${batch.width}W` : null,
      batch.coating,
      batch.grade,
    ].filter(Boolean);
    return parts.join(' | ') || '-';
  }, [batch]);

  // Filter open orders for the selected customer
  const filteredOrders = useMemo(() => {
    if (!orders || !customerId) return [];
    return orders.filter((o: any) => o.customer_id === customerId && o.status === 'open');
  }, [orders, customerId]);

  // Compute order balance qty for selected order
  const orderBalanceQty = useMemo(() => {
    if (!orderId || !orders) return null;
    const order = orders.find((o: any) => o.order_number === orderId);
    if (!order) return null;
    const orderItems = order.order_items || [];
    const totalOrderQty = orderItems.reduce((s: number, i: any) => s + (i.net_weight || 0), 0);
    const dispatchMap = new Map<string, number>();
    (allDispatches || []).forEach((d: any) => {
      dispatchMap.set(d.order_item_id, (dispatchMap.get(d.order_item_id) || 0) + (d.dispatch_qty || 0));
    });
    const totalDispatched = orderItems.reduce((s: number, i: any) => s + (dispatchMap.get(i.id) || 0), 0);
    return totalOrderQty - totalDispatched;
  }, [orderId, orders, allDispatches]);

  const handleCustomerChange = (val: string) => {
    setCustomerId(val);
    setOrderId(''); // reset order when customer changes
  };

  const handleSubmit = async () => {
    if (!orderId.trim()) { toast.error('Order ID is required'); return; }
    if (!invoiceNumber.trim()) { toast.error('Invoice Number is required'); return; }
    if (!salesDate) { toast.error('Invoice Date is required'); return; }

    if (isLoose) {
      const qty = Number(salesQty) || 0;
      if (qty <= 0) { toast.error('Enter a valid quantity'); return; }
      if (qty > usableQty + 0.01) { toast.error(`Quantity exceeds usable qty (${usableQty.toFixed(2)} Kg)`); return; }
      try {
        await insertAction.mutateAsync({
          batch_id: batch.id,
          action_type: 'loose_coil_sale',
          net_weight: qty,
          gross_weight: null,
          order_id: orderId,
          sales_date: salesDate,
          invoice_number: invoiceNumber,
          defect_type: null,
          scrap_type: null,
        });
        toast.success(`Loose Coil sold for batch ${batch.batch_number} — ${qty.toFixed(2)} Kg`);
        onClose();
      } catch (err) {
        console.error('Loose Coil Sale error:', err);
        toast.error('Failed to record sale');
      }
    } else {
      try {
        await packCoilSale.mutateAsync({
          batchId: batch.id,
          usableQty,
          orderId,
          invoiceNumber,
          salesDate,
        });
        toast.success(`Pack Coil sold for batch ${batch.batch_number} — ${usableQty.toFixed(2)} Kg`);
        onClose();
      } catch (err) {
        console.error('Pack Coil Sale error:', err);
        toast.error('Failed to record sale');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title} — Batch {batch.batch_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* SKU Info */}
          <div className="bg-accent/30 rounded-md p-3 text-sm border border-accent">
            <span className="text-muted-foreground">SKU:</span>{' '}
            <span className="font-semibold">{skuLabel}</span>
          </div>

          {isLoose ? (
            <div className="bg-muted/50 rounded-md p-3 text-sm">
              <span className="text-muted-foreground">Max Sales Qty (Usable):</span>{' '}
              <span className="font-semibold font-mono-num">{usableQty.toFixed(2)} Kg</span>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-md p-3 text-sm">
              <span className="text-muted-foreground">Sales Qty (full coil):</span>{' '}
              <span className="font-semibold font-mono-num">{usableQty.toFixed(2)} Kg</span>
            </div>
          )}
          <div>
            <Label className="text-xs">Customer Name</Label>
            <Select value={customerId} onValueChange={handleCustomerChange}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {(customers || []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Order ID</Label>
            <Select value={orderId} onValueChange={setOrderId} disabled={!customerId}>
              <SelectTrigger><SelectValue placeholder={customerId ? 'Select order' : 'Select customer first'} /></SelectTrigger>
              <SelectContent>
                {filteredOrders.map((o: any) => (
                  <SelectItem key={o.id} value={o.order_number}>{o.order_number}{o.po_number ? ` (PO: ${o.po_number})` : ''}</SelectItem>
                ))}
                {filteredOrders.length === 0 && customerId && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No open orders</div>
                )}
              </SelectContent>
            </Select>
          </div>
          {/* Order Balance Qty */}
          {orderBalanceQty !== null && (
            <div className="bg-primary/10 rounded-md p-3 text-sm border border-primary/20">
              <span className="text-muted-foreground">Order Balance Qty:</span>{' '}
              <span className="font-semibold font-mono-num text-primary">{orderBalanceQty.toFixed(2)} Kg</span>
            </div>
          )}
          <div>
            <Label className="text-xs">Invoice Number</Label>
            <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
          </div>
          {isLoose && (
            <div>
              <Label className="text-xs">Sales Quantity (Kg)</Label>
              <Input type="number" value={salesQty} onChange={e => setSalesQty(e.target.value)} placeholder={`Max ${usableQty.toFixed(2)}`} max={usableQty} />
            </div>
          )}
          <div>
            <Label className="text-xs">Invoice Date</Label>
            <Input type="date" value={salesDate} onChange={e => setSalesDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={packCoilSale.isPending || insertAction.isPending}>
            {(packCoilSale.isPending || insertAction.isPending) ? 'Saving...' : 'Confirm Sale'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}