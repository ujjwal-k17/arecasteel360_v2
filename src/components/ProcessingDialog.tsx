import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useInsertProcessing } from '@/hooks/useProcessing';
import type { Batch, InventoryAction } from '@/hooks/useBatches';
import { calcUsableBalanceQty } from '@/hooks/useBatches';
import BatchActionDialog from './BatchActionDialog';

const PROCESSES = ['Slit', 'CTL', 'Profile', 'GC'];
const OUTPUT_TYPES = ['WIP', 'FG'];

interface Props {
  batch: Batch;
  allActions: InventoryAction[];
  processingRecords: any[];
  open: boolean;
  onClose: () => void;
}

export default function ProcessingDialog({ batch, allActions, processingRecords, open, onClose }: Props) {
  const insertProcessing = useInsertProcessing();
  const batchStatus = (batch as any).batch_status || (batch as any).form || 'Pack coil';
  const usableQty = calcUsableBalanceQty(batch, allActions, processingRecords);

  const [processType, setProcessType] = useState('');
  const [outputType, setOutputType] = useState('');
  const [inputQty, setInputQty] = useState('');
  const [orderId, setOrderId] = useState('');
  const [numSizes, setNumSizes] = useState('');
  const [slitWidths, setSlitWidths] = useState<{ width: string; qty: string }[]>([]);
  const [ctlLengths, setCtlLengths] = useState<{ length: string; qty: string; pcs: string }[]>([]);

  // Scrap/Defective sub-dialogs
  const [showScrap, setShowScrap] = useState(false);
  const [showDefective, setShowDefective] = useState(false);

  const isPackCoil = batchStatus === 'Pack coil' || batchStatus === 'Pack Coil';
  const effectiveInputQty = isPackCoil ? usableQty : (inputQty ? Number(inputQty) : 0);

  const handleNumSizesChange = (val: string) => {
    const n = parseInt(val) || 0;
    setNumSizes(val);
    if (processType === 'Slit') {
      setSlitWidths(Array.from({ length: n }, (_, i) => slitWidths[i] || { width: '', qty: '' }));
    } else if (processType === 'CTL') {
      setCtlLengths(Array.from({ length: n }, (_, i) => ctlLengths[i] || { length: '', qty: '', pcs: '' }));
    }
  };

  const handleSubmit = async () => {
    if (!processType || !outputType) {
      toast.error('Please select Process and Output Type');
      return;
    }
    if (!isPackCoil && (!inputQty || Number(inputQty) <= 0)) {
      toast.error('Please enter input quantity');
      return;
    }

    try {
      let outputItems: { width?: number; length?: number; qty_kg: number; num_pcs?: number }[] = [];

      if (processType === 'Slit') {
        if (slitWidths.length === 0 || slitWidths.some(s => !s.width || !s.qty)) {
          toast.error('Please fill all slit width entries');
          return;
        }
        outputItems = slitWidths.map(s => ({ width: Number(s.width), qty_kg: Number(s.qty) }));
      } else if (processType === 'CTL') {
        if (ctlLengths.length === 0 || ctlLengths.some(s => !s.length || !s.qty || !s.pcs)) {
          toast.error('Please fill all CTL length entries');
          return;
        }
        outputItems = ctlLengths.map(s => ({ length: Number(s.length), qty_kg: Number(s.qty), num_pcs: Number(s.pcs) }));
      }

      await insertProcessing.mutateAsync({
        batchId: batch.id,
        processType,
        outputType,
        inputQty: effectiveInputQty,
        orderId,
        outputItems,
        batch,
      });

      toast.success(`Processing recorded for batch ${batch.batch_number}`);
      onClose();
    } catch {
      toast.error('Failed to record processing');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Processing — Batch {batch.batch_number}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Process Type */}
            <div>
              <Label className="text-xs">Process</Label>
              <Select value={processType} onValueChange={v => { setProcessType(v); setNumSizes(''); setSlitWidths([]); setCtlLengths([]); }}>
                <SelectTrigger><SelectValue placeholder="Select process" /></SelectTrigger>
                <SelectContent>
                  {PROCESSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Output Type */}
            <div>
              <Label className="text-xs">Output Type</Label>
              <Select value={outputType} onValueChange={setOutputType}>
                <SelectTrigger><SelectValue placeholder="Select output type" /></SelectTrigger>
                <SelectContent>
                  {OUTPUT_TYPES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Input Quantity */}
            <div>
              <Label className="text-xs">Input Quantity (Kg)</Label>
              <div className="text-xs text-muted-foreground mb-1">Usable Qty: {usableQty.toFixed(2)} Kg</div>
              {isPackCoil ? (
                <Input type="number" value={usableQty.toFixed(2)} disabled className="bg-muted" />
              ) : (
                <Input type="number" value={inputQty} onChange={e => setInputQty(e.target.value)} placeholder={`Max: ${usableQty.toFixed(2)}`} />
              )}
            </div>

            {/* Order ID */}
            <div>
              <Label className="text-xs">Order ID</Label>
              <Input value={orderId} onChange={e => setOrderId(e.target.value)} />
            </div>

            {/* Slit-specific inputs */}
            {processType === 'Slit' && (
              <div className="space-y-3 border rounded-md p-3">
                <div>
                  <Label className="text-xs"># of Sizes</Label>
                  <Input type="number" value={numSizes} onChange={e => handleNumSizesChange(e.target.value)} className="w-24" />
                </div>
                {slitWidths.map((s, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Slit Width {i + 1} (mm)</Label>
                      <Input type="number" value={s.width} onChange={e => {
                        const arr = [...slitWidths]; arr[i] = { ...arr[i], width: e.target.value }; setSlitWidths(arr);
                      }} />
                    </div>
                    <div>
                      <Label className="text-xs">Qty (Kg)</Label>
                      <Input type="number" value={s.qty} onChange={e => {
                        const arr = [...slitWidths]; arr[i] = { ...arr[i], qty: e.target.value }; setSlitWidths(arr);
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CTL-specific inputs */}
            {processType === 'CTL' && (
              <div className="space-y-3 border rounded-md p-3">
                <div>
                  <Label className="text-xs"># of Sizes</Label>
                  <Input type="number" value={numSizes} onChange={e => handleNumSizesChange(e.target.value)} className="w-24" />
                </div>
                {ctlLengths.map((s, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">CTL Length {i + 1} (mm)</Label>
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
            )}

            {/* Scrap & Defective buttons */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowScrap(true)} className="text-xs">
                Record Scrap
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowDefective(true)} className="text-xs">
                Record Defective
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={insertProcessing.isPending}>
              {insertProcessing.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showScrap && (
        <BatchActionDialog batch={batch} actionType="scrap" open={showScrap} onClose={() => setShowScrap(false)} />
      )}
      {showDefective && (
        <BatchActionDialog batch={batch} actionType="defective" open={showDefective} onClose={() => setShowDefective(false)} />
      )}
    </>
  );
}
