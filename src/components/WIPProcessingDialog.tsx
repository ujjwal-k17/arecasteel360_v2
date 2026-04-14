import { useState, useMemo } from 'react';
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

  // Pallet consumption state — multiple sizes
  const [palletEnabled, setPalletEnabled] = useState(false);
  const [palletEntries, setPalletEntries] = useState<{ skuId: string; pcs: string }[]>([{ skuId: '', pcs: '' }]);

  const { data: palletSkus } = useQuery({
    queryKey: ['pallet_skus'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pallet_skus').select('*').order('pallet_size');
      if (error) throw error;
      return data;
    },
  });

  const { data: palletPurchases } = useQuery({
    queryKey: ['pallet_purchases'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pallet_purchases').select('*').order('purchase_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const latestWtPerPc = useMemo(() => {
    const map = new Map<string, number>();
    (palletPurchases || []).forEach((p: any) => {
      if (!map.has(p.pallet_sku_id) && p.num_pcs > 0) {
        map.set(p.pallet_sku_id, p.weight_kg / p.num_pcs);
      }
    });
    return map;
  }, [palletPurchases]);

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

      // Record pallet consumption
      if (palletEnabled && palletSkuId && palletPcs && Number(palletPcs) > 0) {
        const wtPerPc = latestWtPerPc.get(palletSkuId) || 0;
        const totalWt = wtPerPc * Number(palletPcs);
        await supabase.from('pallet_consumptions').insert({
          pallet_sku_id: palletSkuId,
          consumption_date: new Date().toISOString().slice(0, 10),
          order_id: null,
          weight_kg: totalWt,
          num_pcs: Number(palletPcs),
        });
        queryClient.invalidateQueries({ queryKey: ['pallet_consumptions'] });
      }

      toast.success('WIP processed to FG successfully');
      onClose();
    } catch {
      toast.error('Failed to process WIP item');
    } finally {
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

          {/* Wooden Pallet Consumption */}
          <div className="border rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="wip-pallet-check" checked={palletEnabled} onCheckedChange={(v) => setPalletEnabled(!!v)} />
              <Label htmlFor="wip-pallet-check" className="text-xs font-medium cursor-pointer">Wooden Pallet Consumption</Label>
            </div>
            {palletEnabled && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <Label className="text-xs">Pallet Size</Label>
                  <Select value={palletSkuId} onValueChange={setPalletSkuId}>
                    <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                    <SelectContent>
                      {(palletSkus || []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.pallet_size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs"># of Pcs</Label>
                  <Input type="number" value={palletPcs} onChange={e => setPalletPcs(e.target.value)} placeholder="0" />
                </div>
              </div>
            )}
            {palletEnabled && palletSkuId && palletPcs && Number(palletPcs) > 0 && (
              <p className="text-xs text-muted-foreground pl-6">
                Est. weight: {((latestWtPerPc.get(palletSkuId) || 0) * Number(palletPcs)).toFixed(2)} Kg
              </p>
            )}
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
          <Button onClick={handleSubmit} disabled={isSubmitting || wipProcessing.isPending || exceedsAvailable}>
            {isSubmitting || wipProcessing.isPending ? 'Saving...' : 'Process to FG'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
