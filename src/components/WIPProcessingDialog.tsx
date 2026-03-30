import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useWIPProcessing } from '@/hooks/useProcessing';
import { Plus, Trash2 } from 'lucide-react';

const DEFECT_TYPES = ['End pcs', 'Scratch/ Dent', 'Waviness', 'Other'];

interface DefectEntry {
  type: string;
  weight: string;
}

interface Props {
  wipItem: any;
  open: boolean;
  onClose: () => void;
}

export default function WIPProcessingDialog({ wipItem, open, onClose }: Props) {
  const wipProcessing = useWIPProcessing();
  const [numSizes, setNumSizes] = useState('');
  const [ctlLengths, setCtlLengths] = useState<{ length: string; qty: string; pcs: string }[]>([]);
  const [defectEntries, setDefectEntries] = useState<DefectEntry[]>([{ type: '', weight: '' }]);

  const addDefectEntry = () => setDefectEntries(prev => [...prev, { type: '', weight: '' }]);
  const removeDefectEntry = (i: number) => setDefectEntries(prev => prev.filter((_, idx) => idx !== i));
  const updateDefectEntry = (i: number, field: keyof DefectEntry, val: string) => {
    setDefectEntries(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d));
  };

  const defectiveTotal = useMemo(() => {
    return defectEntries.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);
  }, [defectEntries]);

  const handleNumSizesChange = (val: string) => {
    const n = parseInt(val) || 0;
    setNumSizes(val);
    setCtlLengths(Array.from({ length: n }, (_, i) => ctlLengths[i] || { length: '', qty: '', pcs: '' }));
  };

  const totalOutputQty = useMemo(() => {
    return ctlLengths.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  }, [ctlLengths]);

  const totalCommitted = totalOutputQty + defectiveTotal;
  const exceedsAvailable = totalCommitted > (wipItem.qty || 0) + 0.01;

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (ctlLengths.length === 0 || ctlLengths.some(s => !s.length || !s.qty || !s.pcs)) {
      toast.error('Please fill all CTL length entries');
      return;
    }
    if (exceedsAvailable) {
      toast.error(`Total (${totalCommitted.toFixed(2)} Kg) exceeds available qty (${(wipItem.qty || 0).toFixed(2)} Kg)`);
      return;
    }

    // Collect valid defect entries
    const validDefects = defectEntries.filter(d => d.type && Number(d.weight) > 0);

    setIsSubmitting(true);
    try {
      await wipProcessing.mutateAsync({
        wipItemId: wipItem.id,
        wipItem,
        outputItems: ctlLengths.map(s => ({ length: Number(s.length), qty_kg: Number(s.qty), num_pcs: Number(s.pcs) })),
        defectives: validDefects.map(d => ({ type: d.type, weight: Number(d.weight) })),
        orderId: undefined,
      });
      toast.success('WIP processed to FG successfully');
      onClose();
    } catch {
      toast.error('Failed to process WIP item');
    }
  };

  const estWeights = useMemo(() => {
    return ctlLengths.map(s => {
      const t = wipItem.thickness || 0;
      const w = wipItem.width || 0;
      const l = Number(s.length) || 0;
      const pcs = Number(s.pcs) || 0;
      return t * w * l * pcs * 0.00000785;
    });
  }, [ctlLengths, wipItem.thickness, wipItem.width]);

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>CTL Processing — {wipItem.material} {wipItem.width}mm</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Coil Details */}
          <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
            <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Coil Details</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground text-xs">Dimensions:</span>
              <span className="text-xs font-mono-num">{wipItem.thickness ?? '-'} × {wipItem.width ?? '-'} mm</span>
              <span className="text-muted-foreground text-xs">Material:</span>
              <span className="text-xs">{wipItem.material || '-'}</span>
              <span className="text-muted-foreground text-xs">Grade:</span>
              <span className="text-xs">{wipItem.grade || '-'}</span>
              <span className="text-muted-foreground text-xs">Coating:</span>
              <span className="text-xs">{wipItem.coating || '-'}</span>
              <span className="text-muted-foreground text-xs">Make:</span>
              <span className="text-xs">{wipItem.make || '-'}</span>
              <span className="text-muted-foreground text-xs">Available Qty:</span>
              <span className="text-xs font-mono-num font-semibold">{wipItem.qty} Kg</span>
            </div>
          </div>

          {/* Defective Section — Multiple entries */}
          <div className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Defective</p>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={addDefectEntry}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {defectEntries.map((d, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div>
                  <Label className="text-xs">Defect Type</Label>
                  <Select value={d.type} onValueChange={v => updateDefectEntry(i, 'type', v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {DEFECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Net Weight (Kg)</Label>
                  <Input type="number" className="h-8" value={d.weight} onChange={e => updateDefectEntry(i, 'weight', e.target.value)} placeholder="0" />
                </div>
                {defectEntries.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => removeDefectEntry(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {defectiveTotal > 0 && (
              <div className="text-xs text-muted-foreground text-right">Total Defective: {defectiveTotal.toFixed(2)} Kg</div>
            )}
          </div>

          <div className="space-y-3 border rounded-md p-3">
            <div>
              <Label className="text-xs"># of CTL Sizes</Label>
              <Input type="number" value={numSizes} onChange={e => handleNumSizesChange(e.target.value)} className="w-24" />
            </div>
            {ctlLengths.map((s, i) => (
              <div key={i} className="space-y-1">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Length {i + 1} (mm)</Label>
                    <Input type="number" value={s.length} onChange={e => {
                      const arr = [...ctlLengths]; arr[i] = { ...arr[i], length: e.target.value }; setCtlLengths(arr);
                    }} />
                  </div>
                  <div>
                    <Label className="text-xs"># Pcs</Label>
                    <Input type="number" value={s.pcs} onChange={e => {
                      const arr = [...ctlLengths]; arr[i] = { ...arr[i], pcs: e.target.value }; setCtlLengths(arr);
                    }} />
                  </div>
                  <div>
                    <Label className="text-xs">Qty (Kg)</Label>
                    <Input type="number" value={s.qty} onChange={e => {
                      const arr = [...ctlLengths]; arr[i] = { ...arr[i], qty: e.target.value }; setCtlLengths(arr);
                    }} />
                  </div>
                </div>
                {estWeights[i] > 0 && (
                  <div className="text-xs text-muted-foreground pl-1">
                    Est. Weight: <span className="font-mono-num font-medium">{estWeights[i].toFixed(2)} Kg</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Validation warning */}
          {exceedsAvailable && (
            <div className="bg-destructive/10 text-destructive text-xs rounded-md p-2 font-medium">
              ⚠ Total ({totalCommitted.toFixed(2)} Kg) exceeds available qty ({(wipItem.qty || 0).toFixed(2)} Kg)
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={wipProcessing.isPending || exceedsAvailable}>
            {wipProcessing.isPending ? 'Saving...' : 'Process to FG'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
