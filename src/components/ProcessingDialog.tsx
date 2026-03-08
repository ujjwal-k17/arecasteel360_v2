import { useState, useMemo } from 'react';
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
  const _batchStatus = (batch as any).batch_status || (batch as any).form || 'Pack coil';
  const usableQty = calcUsableBalanceQty(batch, allActions, processingRecords);
  const coilWidth = batch.width || 0;

  const [processType, setProcessType] = useState('');
  const [outputType, setOutputType] = useState('');
  const [coilProcessed, setCoilProcessed] = useState<'full' | 'partial' | ''>('');
  const [inputQty, setInputQty] = useState('');
  const [numSizes, setNumSizes] = useState('');
  const [slitWidths, setSlitWidths] = useState<{ width: string; qty: string }[]>([]);
  const [ctlLengths, setCtlLengths] = useState<{ length: string; qty: string; pcs: string }[]>([]);

  const [showScrap, setShowScrap] = useState(false);
  const [showDefective, setShowDefective] = useState(false);

  const effectiveInputQty = coilProcessed === 'full' ? usableQty : (inputQty ? Number(inputQty) : 0);

  // Auto-calculate slit quantities when widths change
  const autoCalcSlitWidths = useMemo(() => {
    if (processType !== 'Slit' || coilWidth <= 0) return slitWidths;
    return slitWidths.map(s => {
      const w = Number(s.width) || 0;
      if (w <= 0) return s;
      const autoQty = (effectiveInputQty * w) / coilWidth;
      return { ...s, qty: autoQty.toFixed(2) };
    });
  }, [slitWidths.map(s => s.width).join(','), effectiveInputQty, coilWidth, processType]);

  // Trim qty for slit
  const trimQty = useMemo(() => {
    if (processType !== 'Slit' || coilWidth <= 0) return 0;
    const sumWidths = slitWidths.reduce((s, w) => s + (Number(w.width) || 0), 0);
    return (effectiveInputQty * (coilWidth - sumWidths)) / coilWidth;
  }, [slitWidths.map(s => s.width).join(','), effectiveInputQty, coilWidth, processType]);

  // Total processed qty (scrap + defective from actions + output items)
  const scrapDefectiveQty = useMemo(() => {
    const batchActions = allActions.filter(a => a.batch_id === batch.id);
    return batchActions
      .filter(a => ['scrap', 'defective'].includes(a.action_type))
      .reduce((sum, a) => sum + (a.net_weight || 0), 0);
  }, [allActions, batch.id]);

  const totalOutputQty = useMemo(() => {
    if (processType === 'Slit') {
      return autoCalcSlitWidths.reduce((s, w) => s + (Number(w.qty) || 0), 0);
    } else if (processType === 'CTL') {
      return ctlLengths.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    }
    return effectiveInputQty;
  }, [processType, autoCalcSlitWidths, ctlLengths, effectiveInputQty]);

  const totalCommitted = totalOutputQty + scrapDefectiveQty;
  const exceedsUsable = totalCommitted > usableQty + 0.01; // small tolerance

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
    if (!processType || !outputType || !coilProcessed) {
      toast.error('Please select Process, Output Type, and Coil Processed option');
      return;
    }
    if (coilProcessed === 'partial' && (!inputQty || Number(inputQty) <= 0)) {
      toast.error('Please enter input quantity');
      return;
    }
    if (exceedsUsable) {
      toast.error(`Total (${totalCommitted.toFixed(2)} Kg) exceeds usable qty (${usableQty.toFixed(2)} Kg)`);
      return;
    }

    try {
      let outputItems: { width?: number; length?: number; qty_kg: number; num_pcs?: number }[] = [];

      if (processType === 'Slit') {
        if (autoCalcSlitWidths.length === 0 || autoCalcSlitWidths.some(s => !s.width)) {
          toast.error('Please fill all slit width entries');
          return;
        }
        outputItems = autoCalcSlitWidths.map(s => ({ width: Number(s.width), qty_kg: Number(s.qty) }));
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
        orderId: '',
        outputItems,
        batch,
      });

      // Auto-insert trim qty as scrap for Slit process
      if (processType === 'Slit' && trimQty > 0.01) {
        const { supabase } = await import('@/integrations/supabase/client');
        await supabase.from('inventory_actions').insert({
          batch_id: batch.id,
          action_type: 'scrap',
          scrap_type: 'Trimming',
          net_weight: Math.round(trimQty * 100) / 100,
          gross_weight: null,
          order_id: null,
          sales_date: null,
          invoice_number: null,
          defect_type: null,
        } as any);
      }

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
            {/* Coil Details */}
            <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
              <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Coil Details</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground text-xs">Dimensions:</span>
                <span className="text-xs font-mono-num">{batch.thickness ?? '-'} × {batch.width ?? '-'} mm</span>
                <span className="text-muted-foreground text-xs">Material:</span>
                <span className="text-xs">{batch.material || '-'}</span>
                <span className="text-muted-foreground text-xs">Grade:</span>
                <span className="text-xs">{batch.grade || '-'}</span>
                <span className="text-muted-foreground text-xs">Usable Qty:</span>
                <span className="text-xs font-mono-num font-semibold">{usableQty.toFixed(2)} Kg</span>
              </div>
            </div>

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

            {/* Coil Processed - Full or Partial */}
            <div>
              <Label className="text-xs">Coil Processed</Label>
              <Select value={coilProcessed} onValueChange={v => { setCoilProcessed(v as 'full' | 'partial'); if (v === 'full') setInputQty(''); }}>
                <SelectTrigger><SelectValue placeholder="Select Full or Partial" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Input Quantity */}
            {coilProcessed && (
              <div>
                <Label className="text-xs">Processing Quantity (Kg)</Label>
                <div className="text-xs text-muted-foreground mb-1">Usable Qty: {usableQty.toFixed(2)} Kg</div>
                {coilProcessed === 'full' ? (
                  <Input type="number" value={usableQty.toFixed(2)} disabled className="bg-muted" />
                ) : (
                  <Input type="number" value={inputQty} onChange={e => setInputQty(e.target.value)} placeholder={`Max: ${usableQty.toFixed(2)}`} />
                )}
              </div>
            )}

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
                      <Label className="text-xs">Qty (Kg) — auto</Label>
                      <Input type="number" value={autoCalcSlitWidths[i]?.qty || ''} disabled className="bg-muted" />
                    </div>
                  </div>
                ))}
                {slitWidths.length > 0 && (
                  <div className="bg-muted/30 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sum of slit widths:</span>
                      <span className="font-mono-num">{slitWidths.reduce((s, w) => s + (Number(w.width) || 0), 0)} mm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Trim Qty:</span>
                      <span className="font-mono-num font-semibold">{trimQty.toFixed(2)} Kg</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Output Qty:</span>
                      <span className="font-mono-num">{totalOutputQty.toFixed(2)} Kg</span>
                    </div>
                  </div>
                )}
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
              {scrapDefectiveQty > 0 && (
                <span className="text-xs text-muted-foreground self-center ml-2">
                  Scrap/Defective: {scrapDefectiveQty.toFixed(2)} Kg
                </span>
              )}
            </div>

            {/* Validation warning */}
            {exceedsUsable && (
              <div className="bg-destructive/10 text-destructive text-xs rounded-md p-2 font-medium">
                ⚠ Total committed ({totalCommitted.toFixed(2)} Kg) exceeds usable qty ({usableQty.toFixed(2)} Kg)
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={insertProcessing.isPending || exceedsUsable}>
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
