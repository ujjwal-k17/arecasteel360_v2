import { useState, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useWIPProcessing } from '@/hooks/useProcessing';
import { fmtNum } from '@/lib/utils';

interface Props {
  wipItems: any[];
  open: boolean;
  onClose: () => void;
  batchMap: Map<string, string>;
  getAvailableQty: (item: any) => number;
}

export default function BulkWIPProcessingDialog({ wipItems, open, onClose, batchMap, getAvailableQty }: Props) {
  const wipProcessing = useWIPProcessing();
  const [numSizes, setNumSizes] = useState('');
  const [ctlLengths, setCtlLengths] = useState<{ length: string; pcs: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Only slit coil items can be CTL processed
  const processableItems = useMemo(() => wipItems.filter(i => i.process === 'Slit Coil'), [wipItems]);

  const handleNumSizesChange = (val: string) => {
    const n = parseInt(val) || 0;
    setNumSizes(val);
    setCtlLengths(Array.from({ length: n }, (_, i) => ctlLengths[i] || { length: '', pcs: '' }));
  };

  // For each item, calculate weight per CTL size based on item dimensions
  const itemBreakdowns = useMemo(() => {
    return processableItems.map(item => {
      const t = item.thickness || 0;
      const w = item.width || 0;
      const sizes = ctlLengths.map(s => {
        const l = Number(s.length) || 0;
        const pcs = Number(s.pcs) || 0;
        const wt = t * w * l * pcs * 0.00000785;
        return { length: l, pcs, qty_kg: Math.round(wt * 100) / 100 };
      });
      const totalQty = sizes.reduce((s, x) => s + x.qty_kg, 0);
      const availQty = getAvailableQty(item);
      return { item, sizes, totalQty, availQty, exceeds: totalQty > availQty + 0.01 };
    });
  }, [processableItems, ctlLengths, getAvailableQty]);

  const anyExceeds = itemBreakdowns.some(b => b.exceeds);
  const allValid = ctlLengths.length > 0 && ctlLengths.every(s => s.length && s.pcs);

  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!allValid) { toast.error('Please fill all CTL size entries'); return; }
    if (anyExceeds) { toast.error('Some items exceed available quantity'); return; }

    setIsSubmitting(true);
    try {
      for (const bd of itemBreakdowns) {
        const validSizes = bd.sizes.filter(s => s.qty_kg > 0);
        if (validSizes.length === 0) continue;
        await wipProcessing.mutateAsync({
          wipItemId: bd.item.id,
          wipItem: bd.item,
          outputItems: validSizes.map(s => ({ length: s.length, qty_kg: s.qty_kg, num_pcs: s.pcs })),
          defectives: [],
          orderId: undefined,
        });
      }
      toast.success(`Processed ${processableItems.length} WIP items to FG`);
      onClose();
    } catch {
      toast.error('Failed to process WIP items');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk CTL Processing — {processableItems.length} Items</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* CTL Sizes Input */}
          <div className="border rounded-md p-3 space-y-3">
            <div>
              <Label className="text-xs"># of CTL Sizes</Label>
              <Input type="number" value={numSizes} onChange={e => handleNumSizesChange(e.target.value)} className="w-24" />
            </div>
            {ctlLengths.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 max-w-xs">
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
              </div>
            ))}
          </div>

          {/* Items breakdown */}
          {ctlLengths.length > 0 && allValid && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Batch</TableHead>
                    <TableHead className="text-xs">Dimensions</TableHead>
                    <TableHead className="text-xs text-right">Available (Kg)</TableHead>
                    <TableHead className="text-xs text-right">Calc. Qty (Kg)</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemBreakdowns.map(bd => (
                    <TableRow key={bd.item.id} className={bd.exceeds ? 'bg-destructive/5' : ''}>
                      <TableCell className="text-xs">{batchMap.get(bd.item.source_batch_id) || '-'}</TableCell>
                      <TableCell className="text-xs font-mono-num">{bd.item.thickness ?? '-'} × {bd.item.width ?? '-'}</TableCell>
                      <TableCell className="text-xs text-right font-mono-num">{fmtNum(bd.availQty)}</TableCell>
                      <TableCell className="text-xs text-right font-mono-num font-semibold">{fmtNum(bd.totalQty)}</TableCell>
                      <TableCell className="text-xs">
                        {bd.exceeds
                          ? <span className="text-destructive font-medium">Exceeds!</span>
                          : <span className="text-green-600">OK</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || wipProcessing.isPending || !allValid || anyExceeds}>
            {isSubmitting ? 'Processing...' : `Process ${processableItems.length} Items to FG`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
