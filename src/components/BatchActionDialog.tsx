import { useState } from 'react';
import { useInsertAction, type Batch } from '@/hooks/useBatches';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useDerivedOptions } from '@/hooks/useDropdownOptions';

const DEFECT_TYPES = ['End pcs', 'Scratch/ Dent', 'Waviness', 'Other'];
const SCRAP_TYPES = ['End Pcs', 'Trimming', 'Metal Cover', 'Non metal cover', 'Short qty'];

interface Props {
  batch: Batch;
  actionType: 'sales' | 'defective' | 'scrap';
  open: boolean;
  onClose: () => void;
}

export default function BatchActionDialog({ batch, actionType, open, onClose }: Props) {
  const insertAction = useInsertAction();
  const { forms } = useDerivedOptions();

  // Sales state
  const [orderId, setOrderId] = useState('');
  const [salesDate, setSalesDate] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [salesForm, setSalesForm] = useState((batch as any).form || '');
  const [netWeight, setNetWeight] = useState('');
  const [grossWeight, setGrossWeight] = useState('');

  // Defective state
  const [defectType, setDefectType] = useState('');
  const [defNetWeight, setDefNetWeight] = useState('');

  // Scrap state
  const [scrapEntries, setScrapEntries] = useState<Record<string, string>>(
    Object.fromEntries(SCRAP_TYPES.map(t => [t, '']))
  );

  const handleSubmit = async () => {
    if (actionType === 'scrap') {
      const shortQtyVal = Number(scrapEntries['Short qty'] || 0);
      if (shortQtyVal > 80) { toast.error('Short Qty must not exceed 80 Kgs'); return; }
    }
    try {
      if (actionType === 'sales') {
        await insertAction.mutateAsync({
          batch_id: batch.id,
          action_type: 'sales',
          order_id: orderId || null,
          sales_date: salesDate || null,
          invoice_number: invoiceNumber || null,
          net_weight: netWeight ? Number(netWeight) : 0,
          gross_weight: grossWeight ? Number(grossWeight) : 0,
          defect_type: null,
          scrap_type: null,
        });
      } else if (actionType === 'defective') {
        await insertAction.mutateAsync({
          batch_id: batch.id,
          action_type: 'defective',
          defect_type: defectType || null,
          net_weight: defNetWeight ? Number(defNetWeight) : 0,
          gross_weight: null,
          order_id: null,
          sales_date: null,
          invoice_number: null,
          scrap_type: null,
        });
      } else {
        // Insert one action per scrap type that has a value
        for (const [type, wt] of Object.entries(scrapEntries)) {
          if (wt && Number(wt) > 0) {
            await insertAction.mutateAsync({
              batch_id: batch.id,
              action_type: 'scrap',
              scrap_type: type,
              net_weight: Number(wt),
              gross_weight: null,
              order_id: null,
              sales_date: null,
              invoice_number: null,
              defect_type: null,
            });
          }
        }
      }
      toast.success(`${actionType} recorded for batch ${batch.batch_number}`);
      onClose();
    } catch {
      toast.error('Failed to record action');
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="capitalize">{actionType} — Batch {batch.batch_number}</DialogTitle>
        </DialogHeader>

        {actionType === 'sales' && (
          <div className="space-y-3">
            <div><Label className="text-xs">Order ID</Label><Input value={orderId} onChange={e => setOrderId(e.target.value)} /></div>
            <div><Label className="text-xs">Sales Date</Label><Input type="date" value={salesDate} onChange={e => setSalesDate(e.target.value)} /></div>
            <div><Label className="text-xs">Invoice Number</Label><Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} /></div>
            <div>
              <Label className="text-xs">Form</Label>
              <Select value={salesForm} onValueChange={setSalesForm}>
                <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
                <SelectContent>
                  {forms.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Net Weight (Kg)</Label><Input type="number" value={netWeight} onChange={e => setNetWeight(e.target.value)} /></div>
            <div><Label className="text-xs">Gross Weight (Kg)</Label><Input type="number" value={grossWeight} onChange={e => setGrossWeight(e.target.value)} /></div>
          </div>
        )}

        {actionType === 'defective' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Defect Type</Label>
              <Select value={defectType} onValueChange={setDefectType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {DEFECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Net Weight (Kg)</Label><Input type="number" value={defNetWeight} onChange={e => setDefNetWeight(e.target.value)} /></div>
          </div>
        )}

        {actionType === 'scrap' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Enter net weight (Kg) for each applicable scrap type:</p>
            {SCRAP_TYPES.map(type => (
              <div key={type} className="grid grid-cols-2 items-center gap-2">
                <Label className="text-xs">{type}</Label>
                <Input
                  type="number"
                  className="h-8"
                  value={scrapEntries[type]}
                  onChange={e => setScrapEntries(v => ({ ...v, [type]: e.target.value }))}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
