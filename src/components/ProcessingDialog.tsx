import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useInsertProcessing } from '@/hooks/useProcessing';
import { useInsertAction } from '@/hooks/useBatches';
import type { Batch, InventoryAction } from '@/hooks/useBatches';
import { calcUsableBalanceQty } from '@/hooks/useBatches';
import { Plus, Trash2 } from 'lucide-react';

const PROCESSES = ['Slit', 'CTL', 'Profile', 'GC'];
const OUTPUT_TYPES = ['WIP', 'FG'];
const SCRAP_TYPES_NO_TRIM = ['End Pcs', 'Metal Cover', 'Non metal cover', 'Short qty'];
const DEFECT_TYPES = ['End pcs', 'Scratch/ Dent', 'Waviness', 'Other'];

interface DefectEntry {
  type: string;
  weight: string;
}

interface Props {
  batch: Batch;
  allActions: InventoryAction[];
  processingRecords: any[];
  open: boolean;
  onClose: () => void;
}

export default function ProcessingDialog({ batch, allActions, processingRecords, open, onClose }: Props) {
  const insertProcessing = useInsertProcessing();
  const insertAction = useInsertAction();
  const usableQty = calcUsableBalanceQty(batch, allActions, processingRecords);
  const coilWidth = batch.width || 0;

  const [processType, setProcessType] = useState('');
  const [outputType, setOutputType] = useState('');
  const [numSizes, setNumSizes] = useState('');
  const [slitWidths, setSlitWidths] = useState<{ width: string; qty: string }[]>([]);
  const [ctlLengths, setCtlLengths] = useState<{ length: string; qty: string; pcs: string }[]>([]);
  const [coilMode] = useState<'full'>('full');
  const [partialQty] = useState('');
  const [trimOption, setTrimOption] = useState<'yes' | 'no' | ''>('');

  // Inline scrap & defective state
  const [scrapEntries, setScrapEntries] = useState<Record<string, string>>(
    Object.fromEntries(SCRAP_TYPES_NO_TRIM.map(t => [t, '']))
  );
  const [defectEntries, setDefectEntries] = useState<DefectEntry[]>([{ type: '', weight: '' }]);
  // looseCoilSaleQty removed

  // Calculate inline scrap + defective totals
  const inlineScrapTotal = useMemo(() => {
    return Object.values(scrapEntries).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }, [scrapEntries]);

  const inlineDefectiveTotal = useMemo(() => {
    return defectEntries.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);
  }, [defectEntries]);

  const inlineDeductions = inlineScrapTotal + inlineDefectiveTotal;

  // Processing qty: always full coil minus deductions
  const processingQty = Math.max(0, usableQty - inlineDeductions);

  // Defect entry helpers
  const addDefectEntry = () => setDefectEntries(prev => [...prev, { type: '', weight: '' }]);
  const removeDefectEntry = (i: number) => setDefectEntries(prev => prev.filter((_, idx) => idx !== i));
  const updateDefectEntry = (i: number, field: keyof DefectEntry, val: string) => {
    setDefectEntries(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d));
  };

  // Auto-calculate slit quantities when widths change
  const autoCalcSlitWidths = useMemo(() => {
    if (processType !== 'Slit' || coilWidth <= 0) return slitWidths;
    const sumWidths = slitWidths.reduce((s, w) => s + (Number(w.width) || 0), 0);
    return slitWidths.map(s => {
      const w = Number(s.width) || 0;
      if (w <= 0) return s;
      if (trimOption === 'no' && sumWidths > 0) {
        // No trim: divide processing qty by ratio of widths
        const autoQty = (processingQty * w) / sumWidths;
        return { ...s, qty: autoQty.toFixed(2) };
      }
      // Trim = yes (default): use coil width ratio
      const autoQty = (processingQty * w) / coilWidth;
      return { ...s, qty: autoQty.toFixed(2) };
    });
  }, [slitWidths.map(s => s.width).join(','), processingQty, coilWidth, processType, trimOption]);

  // Trim qty for slit
  const trimQty = useMemo(() => {
    if (processType !== 'Slit' || coilWidth <= 0 || trimOption === 'no') return 0;
    const sumWidths = slitWidths.reduce((s, w) => s + (Number(w.width) || 0), 0);
    return (processingQty * (coilWidth - sumWidths)) / coilWidth;
  }, [slitWidths.map(s => s.width).join(','), processingQty, coilWidth, processType, trimOption]);

  const totalOutputQty = useMemo(() => {
    if (processType === 'Slit') {
      return autoCalcSlitWidths.reduce((s, w) => s + (Number(w.qty) || 0), 0);
    } else if (processType === 'CTL') {
      return ctlLengths.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    }
    return processingQty;
  }, [processType, autoCalcSlitWidths, ctlLengths, processingQty]);

  const totalCommitted = totalOutputQty + inlineDeductions;
  const exceedsUsable = totalCommitted > usableQty + 0.01;

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
    const effectiveOutputType = processType === 'Slit' ? outputType : 'FG';

    if (!processType || !effectiveOutputType) {
      toast.error('Please select Process' + (processType === 'Slit' ? ' and Output Type' : ''));
      return;
    }
    if (processingQty <= 0) {
      toast.error('Processing quantity must be greater than 0');
      return;
    }
    if (exceedsUsable) {
      toast.error(`Total (${totalCommitted.toFixed(2)} Kg) exceeds usable qty (${usableQty.toFixed(2)} Kg)`);
      return;
    }

    try {
      // 1. Save inline scrap entries
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

      // 2. Save inline defective entries (multiple)
      for (const d of defectEntries) {
        if (d.type && Number(d.weight) > 0) {
          await insertAction.mutateAsync({
            batch_id: batch.id,
            action_type: 'defective',
            defect_type: d.type,
            net_weight: Number(d.weight),
            gross_weight: null,
            order_id: null,
            sales_date: null,
            invoice_number: null,
            scrap_type: null,
          });
        }
      }

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
        outputType: effectiveOutputType,
        inputQty: processingQty,
        orderId: '',
        outputItems,
        batch,
      });

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
              <span className="text-muted-foreground text-xs">Coating:</span>
              <span className="text-xs">{batch.coating || '-'}</span>
              <span className="text-muted-foreground text-xs">Usable Qty:</span>
              <span className="text-xs font-mono-num font-semibold">{usableQty.toFixed(2)} Kg</span>
            </div>
          </div>

          {/* Inline Scrap Section */}
          <div className="border rounded-md p-3 space-y-2">
            <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Scrap (Kg)</p>
            {SCRAP_TYPES_NO_TRIM.map(type => (
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
            {inlineScrapTotal > 0 && (
              <div className="text-xs text-muted-foreground text-right">Total Scrap: {inlineScrapTotal.toFixed(2)} Kg</div>
            )}
          </div>

          {/* Inline Defective Section — Multiple entries */}
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
            {inlineDefectiveTotal > 0 && (
              <div className="text-xs text-muted-foreground text-right">Total Defective: {inlineDefectiveTotal.toFixed(2)} Kg</div>
            )}
          </div>


          {/* Processing Quantity (auto-calculated) */}
          <div className="bg-muted/30 rounded-md p-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Processing Quantity:</span>
              <span className="text-sm font-mono-num font-semibold">{processingQty.toFixed(2)} Kg</span>
            </div>
            {inlineDeductions > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                = {usableQty.toFixed(2)} − {inlineDeductions.toFixed(2)} (scrap + defective)
              </div>
            )}
          </div>

          {/* Process Type */}
          <div>
            <Label className="text-xs">Process</Label>
            <Select value={processType} onValueChange={v => { setProcessType(v); setNumSizes(''); setSlitWidths([]); setCtlLengths([]); setTrimOption(''); if (v === 'Slit') setOutputType(''); else setOutputType('FG'); }}>
              <SelectTrigger><SelectValue placeholder="Select process" /></SelectTrigger>
              <SelectContent>
                {PROCESSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Output Type - only for Slit */}
          {processType === 'Slit' && (
            <div>
              <Label className="text-xs">Output Type</Label>
              <Select value={outputType} onValueChange={setOutputType}>
                <SelectTrigger><SelectValue placeholder="Select output type" /></SelectTrigger>
                <SelectContent>
                  {OUTPUT_TYPES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Trim option - only for Slit */}
          {processType === 'Slit' && (
            <div>
              <Label className="text-xs">Trim</Label>
              <Select value={trimOption} onValueChange={(v: 'yes' | 'no') => setTrimOption(v)}>
                <SelectTrigger><SelectValue placeholder="Select Yes or No" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
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
              {ctlLengths.map((s, i) => {
                const t = batch.thickness || 0;
                const w = batch.width || 0;
                const l = Number(s.length) || 0;
                const pcs = Number(s.pcs) || 0;
                const estWt = t * w * l * pcs * 0.00000785;
                return (
                  <div key={i} className="space-y-1">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">CTL Length {i + 1} (mm)</Label>
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
                    {estWt > 0 && (
                      <div className="text-xs text-muted-foreground pl-1">
                        Est. Weight: <span className="font-mono-num font-medium">{estWt.toFixed(2)} Kg</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

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
  );
}
