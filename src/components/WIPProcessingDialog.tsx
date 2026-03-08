import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useWIPProcessing } from '@/hooks/useProcessing';

interface Props {
  wipItem: any;
  open: boolean;
  onClose: () => void;
}

export default function WIPProcessingDialog({ wipItem, open, onClose }: Props) {
  const wipProcessing = useWIPProcessing();
  const [orderId, setOrderId] = useState('');
  const [numSizes, setNumSizes] = useState('');
  const [ctlLengths, setCtlLengths] = useState<{ length: string; qty: string; pcs: string }[]>([]);
  const [defLength, setDefLength] = useState('');
  const [defPcs, setDefPcs] = useState('');
  const [defWeight, setDefWeight] = useState('');

  const handleNumSizesChange = (val: string) => {
    const n = parseInt(val) || 0;
    setNumSizes(val);
    setCtlLengths(Array.from({ length: n }, (_, i) => ctlLengths[i] || { length: '', qty: '', pcs: '' }));
  };

  const handleSubmit = async () => {
    if (ctlLengths.length === 0 || ctlLengths.some(s => !s.length || !s.qty || !s.pcs)) {
      toast.error('Please fill all CTL length entries');
      return;
    }

    try {
      await wipProcessing.mutateAsync({
        wipItemId: wipItem.id,
        wipItem,
        outputItems: ctlLengths.map(s => ({ length: Number(s.length), qty_kg: Number(s.qty), num_pcs: Number(s.pcs) })),
        defective: defWeight && Number(defWeight) > 0
          ? { length: Number(defLength) || 0, num_pcs: Number(defPcs) || 0, weight: Number(defWeight) }
          : undefined,
        orderId: orderId || undefined,
      });
      toast.success('WIP processed to FG successfully');
      onClose();
    } catch {
      toast.error('Failed to process WIP item');
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>CTL Processing — {wipItem.material} {wipItem.width}mm</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/50 rounded-md p-3 text-sm">
            <span className="text-muted-foreground">Available Qty:</span>{' '}
            <span className="font-semibold font-mono-num">{wipItem.qty} Kg</span>
          </div>

          <div>
            <Label className="text-xs">Order ID</Label>
            <Input value={orderId} onChange={e => setOrderId(e.target.value)} />
          </div>

          <div className="space-y-3 border rounded-md p-3">
            <div>
              <Label className="text-xs"># of CTL Sizes</Label>
              <Input type="number" value={numSizes} onChange={e => handleNumSizesChange(e.target.value)} className="w-24" />
            </div>
            {ctlLengths.map((s, i) => (
              <div key={i} className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Length {i + 1} (mm)</Label>
                  <Input type="number" value={s.length} onChange={e => {
                    const arr = [...ctlLengths]; arr[i] = { ...arr[i], length: e.target.value }; setCtlLengths(arr);
                  }} />
                </div>
                <div>
                  <Label className="text-xs">Qty (Kg)</Label>
                  <Input type="number" value={s.qty} onChange={e => {
                    const arr = [...ctlLengths]; arr[i] = { ...arr[i], qty: e.target.value }; setCtlLengths(arr);
                  }} />
                </div>
                <div>
                  <Label className="text-xs"># Pcs</Label>
                  <Input type="number" value={s.pcs} onChange={e => {
                    const arr = [...ctlLengths]; arr[i] = { ...arr[i], pcs: e.target.value }; setCtlLengths(arr);
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Defective section */}
          <div className="border rounded-md p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Defective (optional)</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Length (mm)</Label>
                <Input type="number" value={defLength} onChange={e => setDefLength(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs"># Pcs</Label>
                <Input type="number" value={defPcs} onChange={e => setDefPcs(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Weight (Kg)</Label>
                <Input type="number" value={defWeight} onChange={e => setDefWeight(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={wipProcessing.isPending}>
            {wipProcessing.isPending ? 'Saving...' : 'Process to FG'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
