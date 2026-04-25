import { useState, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useWIPProcessing } from '@/hooks/useProcessing';
import { Plus, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  const queryClient = useQueryClient();
  const [numSizes, setNumSizes] = useState('');
  const [ctlLengths, setCtlLengths] = useState<{ length: string; qty: string; pcs: string }[]>([]);
  const [defectEntries, setDefectEntries] = useState<DefectEntry[]>([{ type: '', weight: '' }]);

  // Pallet consumption state — multiple sizes (default: consumption expected)
  // skuKey format: "wooden:<id>" or "steel:<id>"
  const [noPalletConsumption, setNoPalletConsumption] = useState(false);
  const [palletEntries, setPalletEntries] = useState<{ skuKey: string; pcs: string }[]>([{ skuKey: '', pcs: '' }]);

  const { data: woodenSkus } = useQuery({
    queryKey: ['pallet_skus'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pallet_skus').select('*').order('pallet_size');
      if (error) throw error;
      return data;
    },
  });

  const { data: steelSkus } = useQuery({
    queryKey: ['steel_pallet_skus'],
    queryFn: async () => {
      const { data, error } = await supabase.from('steel_pallet_skus' as any).select('*').order('pallet_size');
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: woodenPurchases } = useQuery({
    queryKey: ['pallet_purchases'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pallet_purchases').select('*').order('purchase_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: steelPurchases } = useQuery({
    queryKey: ['steel_pallet_purchases'],
    queryFn: async () => {
      const { data, error } = await supabase.from('steel_pallet_purchases' as any).select('*').order('purchase_date', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const combinedPalletOptions = useMemo(() => {
    const wooden = (woodenSkus || []).map((s: any) => ({ key: `wooden:${s.id}`, label: `${s.pallet_size} (Wooden)` }));
    const steel = (steelSkus || []).map((s: any) => ({ key: `steel:${s.id}`, label: `${s.pallet_size} (Steel)` }));
    return [...wooden, ...steel];
  }, [woodenSkus, steelSkus]);

  const latestWtPerPc = useMemo(() => {
    const map = new Map<string, number>();
    (woodenPurchases || []).forEach((p: any) => {
      const k = `wooden:${p.pallet_sku_id}`;
      if (!map.has(k) && p.num_pcs > 0) map.set(k, p.weight_kg / p.num_pcs);
    });
    (steelPurchases || []).forEach((p: any) => {
      const k = `steel:${p.pallet_sku_id}`;
      if (!map.has(k) && p.num_pcs > 0) map.set(k, p.weight_kg / p.num_pcs);
    });
    return map;
  }, [woodenPurchases, steelPurchases]);

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
  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (ctlLengths.length === 0 || ctlLengths.some(s => !s.length || !s.qty || !s.pcs)) {
      toast.error('Please fill all CTL length entries');
      return;
    }
    // Note: over-quantity allowed; warning shown but submission permitted

    // Validate pallet BEFORE mutation
    if (!noPalletConsumption) {
      const validPalletEntries = palletEntries.filter(e => e.skuKey && Number(e.pcs) > 0);
      if (validPalletEntries.length === 0) {
        toast.error('Please add pallet consumption or check "No Pallet Consumption"');
        return;
      }
    }

    // Collect valid defect entries
    const validDefects = defectEntries.filter(d => d.type && Number(d.weight) > 0);

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const procResult = await wipProcessing.mutateAsync({
        wipItemId: wipItem.id,
        wipItem,
        outputItems: ctlLengths.map(s => ({ length: Number(s.length), qty_kg: Number(s.qty), num_pcs: Number(s.pcs) })),
        defectives: validDefects.map(d => ({ type: d.type, weight: Number(d.weight) })),
        orderId: undefined,
      });
      const processingRecordId = (procResult as any)?.id || null;

      // Record pallet consumption — multiple entries (wooden or steel)
      if (!noPalletConsumption) {
        const validEntries = palletEntries.filter(e => e.skuKey && Number(e.pcs) > 0);
        for (const entry of validEntries) {
          const wtPerPc = latestWtPerPc.get(entry.skuKey) || 0;
          const totalWt = wtPerPc * Number(entry.pcs);
          const [type, id] = entry.skuKey.split(':');
          if (type === 'steel') {
            await supabase.from('steel_pallet_consumptions' as any).insert({
              pallet_sku_id: id,
              consumption_date: new Date().toISOString().slice(0, 10),
              order_id: null,
              weight_kg: totalWt,
              num_pcs: Number(entry.pcs),
            } as any);
          } else {
            await supabase.from('pallet_consumptions').insert({
              pallet_sku_id: id,
              consumption_date: new Date().toISOString().slice(0, 10),
              order_id: null,
              weight_kg: totalWt,
              num_pcs: Number(entry.pcs),
              processing_record_id: processingRecordId,
            } as any);
          }
        }
        if (validEntries.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['pallet_consumptions'] });
          queryClient.invalidateQueries({ queryKey: ['steel_pallet_consumptions'] });
        }
      }

      toast.success('WIP processed to FG successfully');
      onClose();
    } catch {
      toast.error('Failed to process WIP item');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
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

          {/* Pallet Consumption — Multiple Sizes (Wooden + Steel) */}
          <div className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Pallet Consumption</p>
              {!noPalletConsumption && (
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => setPalletEntries(prev => [...prev, { skuKey: '', pcs: '' }])}>
                  <Plus className="h-3 w-3" /> Add Size
                </Button>
              )}
            </div>
            {!noPalletConsumption && palletEntries.map((entry, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div>
                  <Label className="text-xs">Pallet Size</Label>
                  <Select value={entry.skuKey} onValueChange={v => { const arr = [...palletEntries]; arr[i] = { ...arr[i], skuKey: v }; setPalletEntries(arr); }}>
                    <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                    <SelectContent>
                      {combinedPalletOptions.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs"># of Pcs</Label>
                  <Input type="number" value={entry.pcs} onChange={e => { const arr = [...palletEntries]; arr[i] = { ...arr[i], pcs: e.target.value }; setPalletEntries(arr); }} placeholder="0" />
                </div>
                {palletEntries.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => setPalletEntries(prev => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {!noPalletConsumption && palletEntries.some(e => e.skuKey && Number(e.pcs) > 0) && (
              <p className="text-xs text-muted-foreground">
                Est. total weight: {palletEntries.reduce((sum, e) => sum + ((latestWtPerPc.get(e.skuKey) || 0) * (Number(e.pcs) || 0)), 0).toFixed(2)} Kg
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <Checkbox id="wip-no-pallet-check" checked={noPalletConsumption} onCheckedChange={(v) => setNoPalletConsumption(!!v)} />
              <Label htmlFor="wip-no-pallet-check" className="text-xs font-medium cursor-pointer">No Pallet Consumption</Label>
            </div>
          </div>

          {/* Soft warning — does not block submission */}
          {exceedsAvailable && (
            <div className="bg-muted text-muted-foreground border border-border text-xs rounded-md p-2 font-medium">
              ⚠ Total ({totalCommitted.toFixed(2)} Kg) exceeds available qty ({(wipItem.qty || 0).toFixed(2)} Kg). You can still proceed.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || wipProcessing.isPending}>
            {isSubmitting || wipProcessing.isPending ? 'Saving...' : 'Process to FG'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
