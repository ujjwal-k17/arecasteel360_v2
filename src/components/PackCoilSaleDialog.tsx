import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { usePackCoilSale } from '@/hooks/useProcessing';
import type { Batch, InventoryAction } from '@/hooks/useBatches';
import { calcUsableBalanceQty } from '@/hooks/useBatches';

interface Props {
  batch: Batch;
  allActions: InventoryAction[];
  processingRecords: any[];
  open: boolean;
  onClose: () => void;
}

export default function PackCoilSaleDialog({ batch, allActions, processingRecords, open, onClose }: Props) {
  const packCoilSale = usePackCoilSale();
  const usableQty = calcUsableBalanceQty(batch, allActions, processingRecords);
  const [orderId, setOrderId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [salesDate, setSalesDate] = useState('');

  const handleSubmit = async () => {
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
    } catch {
      toast.error('Failed to record sale');
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pack Coil Sale — Batch {batch.batch_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted/50 rounded-md p-3 text-sm">
            <span className="text-muted-foreground">Sales Qty (full coil):</span>{' '}
            <span className="font-semibold font-mono-num">{usableQty.toFixed(2)} Kg</span>
          </div>
          <div>
            <Label className="text-xs">Order ID</Label>
            <Input value={orderId} onChange={e => setOrderId(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Invoice Number</Label>
            <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Sales Date</Label>
            <Input type="date" value={salesDate} onChange={e => setSalesDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={packCoilSale.isPending}>
            {packCoilSale.isPending ? 'Saving...' : 'Confirm Sale'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
