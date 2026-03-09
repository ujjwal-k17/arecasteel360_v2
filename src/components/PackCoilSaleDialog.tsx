import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { usePackCoilSale } from '@/hooks/useProcessing';
import { useInsertAction } from '@/hooks/useBatches';
import type { Batch, InventoryAction } from '@/hooks/useBatches';
import { calcUsableBalanceQty } from '@/hooks/useBatches';

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
  const [orderId, setOrderId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [salesDate, setSalesDate] = useState('');
  const [salesQty, setSalesQty] = useState('');

  const isLoose = mode === 'loose';
  const title = isLoose ? 'Loose Coil Sale' : 'Pack Coil Sale';

  const handleSubmit = async () => {
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
          order_id: orderId || null,
          sales_date: salesDate || null,
          invoice_number: invoiceNumber || null,
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
          orderId: orderId || undefined,
          invoiceNumber: invoiceNumber || undefined,
          salesDate: salesDate || undefined,
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
          {isLoose && (
            <div>
              <Label className="text-xs">Sales Quantity (Kg)</Label>
              <Input type="number" value={salesQty} onChange={e => setSalesQty(e.target.value)} placeholder={`Max ${usableQty.toFixed(2)}`} max={usableQty} />
            </div>
          )}
          <div>
            <Label className="text-xs">Order ID</Label>
            <Input value={orderId} onChange={e => setOrderId(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Invoice Number</Label>
            <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
          </div>
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
