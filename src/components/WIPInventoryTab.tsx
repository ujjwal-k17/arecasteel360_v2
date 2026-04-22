import { useState, useMemo } from 'react';
import { uniqueCaseInsensitive, eqCI, fmtNum } from '@/lib/utils';
import { useWIPItems } from '@/hooks/useProcessing';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw, ChevronRight, ChevronDown, Trash2, Undo2, ArrowRightCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import WIPProcessingDialog from './WIPProcessingDialog';
import BulkWIPProcessingDialog from './BulkWIPProcessingDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useSubmitApproval } from '@/hooks/useActionLog';

const DEFECT_TYPES = ['End pcs', 'Scratch/ Dent', 'Waviness', 'Other'];

interface SKUGroup {
  key: string;
  material: string;
  make: string;
  process: string;
  thickness: number | null;
  width: number | null;
  coating: string;
  grade: string;
  totalQty: number;
  items: any[];
}

export default function WIPInventoryTab() {
  const { data: wipItems } = useWIPItems();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const submitApproval = useSubmitApproval();
  const [processingItem, setProcessingItem] = useState<any | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkProcessOpen, setBulkProcessOpen] = useState(false);

  // Defective dialog
  const [defectDialog, setDefectDialog] = useState<any | null>(null);
  const [defectForm, setDefectForm] = useState({ defect_type: '', quantity: '' });

  // Filters
  const [filterMaterial, setFilterMaterial] = useState('all');
  const [filterMake, setFilterMake] = useState('all');
  const [filterProcess, setFilterProcess] = useState('all');
  const [filterCoating, setFilterCoating] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');

  const { data: batches } = useQuery({
    queryKey: ['batches_lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('batches').select('id, batch_number');
      if (error) throw error;
      return data;
    },
  });

  // WIP defectives query
  const { data: wipDefectives } = useQuery({
    queryKey: ['wip_defectives'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wip_defectives' as any).select('*');
      if (error) throw error;
      return data as any[];
    },
  });

  const insertWIPDefective = useMutation({
    mutationFn: async (params: { wip_item_id: string; defect_type: string; quantity: number }) => {
      const { error } = await supabase.from('wip_defectives' as any).insert(params);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wip_defectives'] });
      queryClient.invalidateQueries({ queryKey: ['wip_items'] });
    },
  });

  const batchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of batches || []) map.set(b.id, b.batch_number);
    return map;
  }, [batches]);

  const defectiveByItem = useMemo(() => {
    const map = new Map<string, number>();
    (wipDefectives || []).forEach((d: any) => {
      map.set(d.wip_item_id, (map.get(d.wip_item_id) || 0) + (d.quantity || 0));
    });
    return map;
  }, [wipDefectives]);

  const getAvailableQty = (item: any) => {
    const original = item.qty || 0;
    const defective = defectiveByItem.get(item.id) || 0;
    return original - defective;
  };

  const items = wipItems || [];

  const uniqueVals = useMemo(() => ({
    material: uniqueCaseInsensitive(items.map(i => i.material || '-')),
    make: uniqueCaseInsensitive(items.map(i => i.make || '-')),
    process: uniqueCaseInsensitive(items.map(i => i.process || '-')),
    coating: uniqueCaseInsensitive(items.map(i => i.coating || '-')),
    grade: uniqueCaseInsensitive(items.map(i => i.grade || '-')),
  }), [items]);

  const filteredItems = useMemo(() => {
    return items.filter(i =>
      (filterMaterial === 'all' || eqCI(i.material || '-', filterMaterial)) &&
      (filterMake === 'all' || eqCI(i.make || '-', filterMake)) &&
      (filterProcess === 'all' || eqCI(i.process || '-', filterProcess)) &&
      (filterCoating === 'all' || eqCI(i.coating || '-', filterCoating)) &&
      (filterGrade === 'all' || eqCI(i.grade || '-', filterGrade))
    );
  }, [items, filterMaterial, filterMake, filterProcess, filterCoating, filterGrade]);

  const [materialTab, setMaterialTab] = useState('all');

  const uniqueMaterials = useMemo(() => {
    return uniqueCaseInsensitive(items.map(i => i.material || '').filter(Boolean)).sort();
  }, [items]);

  const skuGroups = useMemo(() => {
    const map = new Map<string, SKUGroup & { totalOriginalQty: number }>();
    for (const item of filteredItems) {
      const key = [item.material || '', item.process || '', item.thickness ?? '', item.width ?? '', item.coating || '', item.grade || ''].map(v => String(v).toLowerCase()).join('|');
      if (!map.has(key)) {
        map.set(key, { key, material: item.material || '-', make: item.make || '-', process: item.process || '-', thickness: item.thickness, width: item.width, coating: item.coating || '-', grade: item.grade || '-', totalQty: 0, totalOriginalQty: 0, items: [] });
      }
      const g = map.get(key)!;
      g.totalQty += getAvailableQty(item);
      g.totalOriginalQty += item.qty || 0;
      g.items.push(item);
    }
    return Array.from(map.values());
  }, [filteredItems, defectiveByItem]);

  const displayedSkuGroups = useMemo(() => {
    if (materialTab === 'all') return skuGroups;
    return skuGroups.filter(g => eqCI(g.material || '', materialTab));
  }, [skuGroups, materialTab]);

  const displayedTotalQty = useMemo(() => displayedSkuGroups.reduce((s, g) => s + g.totalQty, 0), [displayedSkuGroups]);
  const displayedItemCount = useMemo(() => displayedSkuGroups.reduce((s, g) => s + g.items.length, 0), [displayedSkuGroups]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItems(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectedWIPItems = useMemo(() => {
    return items.filter(i => selectedItems.has(i.id));
  }, [items, selectedItems]);

  const formatDimensions = (item: any) => {
    const t = item.thickness ?? '-';
    const w = item.width ?? '-';
    const isSlit = (item.process || '').toLowerCase().includes('slit');
    return `${t} x ${w} x ${isSlit ? 'Coil' : (item.length ?? '-')}`;
  };

  const handleBulkMoveToFG = async () => {
    if (selectedWIPItems.length === 0) return;
    if (!confirm(`Move ${selectedWIPItems.length} WIP item(s) to Finished Goods?`)) return;
    try {
      for (const item of selectedWIPItems) {
        const availQty = getAvailableQty(item);
        if (availQty <= 0) continue;
        const { error: fgError } = await supabase.from('fg_items').insert({
          source_id: item.id,
          source_type: 'wip',
          processing_record_id: item.processing_record_id,
          material: item.material,
          make: item.make,
          process: item.process,
          thickness: item.thickness,
          width: item.width,
          length: item.length,
          coating: item.coating,
          grade: item.grade,
          qty: availQty,
          num_pcs: item.num_pcs,
          order_id: item.order_id,
        });
        if (fgError) throw fgError;
        const { error: delError } = await supabase.from('wip_items').delete().eq('id', item.id);
        if (delError) throw delError;
      }
      queryClient.invalidateQueries({ queryKey: ['wip_items'] });
      queryClient.invalidateQueries({ queryKey: ['fg_items'] });
      toast.success(`Moved ${selectedWIPItems.length} items to Finished Goods`);
      setSelectedItems(new Set());
      setBulkMoveOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to move items');
    }
  };

  const handleDefectSubmit = async () => {
    if (!defectDialog) return;
    const qty = Number(defectForm.quantity) || 0;
    const available = getAvailableQty(defectDialog);
    if (!defectForm.defect_type) { toast.error('Select a defect type'); return; }
    if (qty <= 0) { toast.error('Enter a valid quantity'); return; }
    if (qty > available + 0.01) { toast.error(`Quantity exceeds available (${available.toFixed(2)} Kg)`); return; }
    try {
      await insertWIPDefective.mutateAsync({
        wip_item_id: defectDialog.id,
        defect_type: defectForm.defect_type,
        quantity: qty,
      });
      toast.success('Defective recorded');
      setDefectDialog(null);
      setDefectForm({ defect_type: '', quantity: '' });
    } catch { toast.error('Failed to record defective'); }
  };

  const FilterSelect = ({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['wip_items'] }); queryClient.invalidateQueries({ queryKey: ['batches_lookup'] }); queryClient.invalidateQueries({ queryKey: ['wip_defectives'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <div className="flex items-center gap-3">
          {selectedItems.size > 0 && (
            <>
              {selectedWIPItems.some(i => i.process === 'Slit Coil') && (
                <Button size="sm" variant="outline" className="gap-2" onClick={() => setBulkProcessOpen(true)}>
                  Bulk Process CTL ({selectedWIPItems.filter(i => i.process === 'Slit Coil').length})
                </Button>
              )}
              <Button size="sm" className="gap-2" onClick={() => setBulkMoveOpen(true)}>
                <ArrowRightCircle className="h-4 w-4" /> Bulk Move to FG ({selectedItems.size})
              </Button>
            </>
          )}
          <div className="bg-primary/10 text-primary rounded-md px-3 py-1.5 text-sm font-semibold font-mono-num">
            Total: {fmtNum(displayedTotalQty)} Kg ({displayedItemCount} items)
          </div>
        </div>
      </div>

      {/* Material Tabs */}
      <div className="flex items-center gap-1 flex-wrap bg-muted/50 rounded-lg p-1">
        <Button
          size="sm"
          variant={materialTab === 'all' ? 'default' : 'ghost'}
          className="text-xs h-7 px-3"
          onClick={() => setMaterialTab('all')}
        >
          All
        </Button>
        {uniqueMaterials.map(mat => (
          <Button
            key={mat}
            size="sm"
            variant={materialTab === mat ? 'default' : 'ghost'}
            className="text-xs h-7 px-3"
            onClick={() => setMaterialTab(mat)}
          >
            {mat}
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold w-8" />
              <TableHead className="text-xs font-semibold w-8" />
              <TableHead className="text-xs font-semibold whitespace-nowrap">Material</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Process</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Dimensions</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Coating</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Grade</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Qty (Kg)</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Action</TableHead>
            </TableRow>
            <TableRow className="bg-muted/20">
              <TableHead />
              <TableHead />
              <TableHead><FilterSelect value={filterMaterial} onChange={setFilterMaterial} options={uniqueVals.material} placeholder="Material" /></TableHead>
              <TableHead><FilterSelect value={filterProcess} onChange={setFilterProcess} options={uniqueVals.process} placeholder="Process" /></TableHead>
              <TableHead />
              <TableHead><FilterSelect value={filterCoating} onChange={setFilterCoating} options={uniqueVals.coating} placeholder="Coating" /></TableHead>
              <TableHead><FilterSelect value={filterGrade} onChange={setFilterGrade} options={uniqueVals.grade} placeholder="Grade" /></TableHead>
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedSkuGroups.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No WIP items found.</TableCell></TableRow>
            )}
            {displayedSkuGroups.map(g => {
              const isOpen = expanded.has(g.key);
              return (
                <>
                  <TableRow key={g.key} className={`cursor-pointer font-medium ${g.totalQty < 150 && g.totalQty < 0.9 * (g as any).totalOriginalQty ? 'bg-destructive/5 hover:bg-destructive/5' : 'bg-success/5 hover:bg-success/5'}`} onClick={() => toggleExpand(g.key)}>
                    <TableCell className="w-8 px-2">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell />
                    <TableCell className="text-sm">{g.material}</TableCell>
                    <TableCell className="text-sm">{g.process}</TableCell>
                    <TableCell className="text-sm font-mono-num whitespace-nowrap">{g.thickness ?? '-'} x {g.width ?? '-'} x Coil</TableCell>
                    <TableCell className="text-sm">{g.coating}</TableCell>
                    <TableCell className="text-sm">{g.grade}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{fmtNum(g.totalQty)}</TableCell>
                    <TableCell><span className="text-xs text-muted-foreground">{g.items.length} item{g.items.length !== 1 ? 's' : ''}</span></TableCell>
                  </TableRow>
                  {isOpen && g.items.map((item: any) => {
                    const canProcess = item.process === 'Slit Coil';
                    const batchNum = batchMap.get(item.source_batch_id) || '-';
                    const availQty = getAvailableQty(item);
                    const handleMoveToFG = async () => {
                      if (!confirm(`Move this WIP item (${availQty.toFixed(2)} Kg) to Finished Goods?`)) return;
                      try {
                        const { error: fgError } = await supabase.from('fg_items').insert({
                          source_id: item.id,
                          source_type: 'wip',
                          processing_record_id: item.processing_record_id,
                          material: item.material,
                          make: item.make,
                          process: item.process,
                          thickness: item.thickness,
                          width: item.width,
                          length: item.length,
                          coating: item.coating,
                          grade: item.grade,
                          qty: availQty,
                          num_pcs: item.num_pcs,
                          order_id: item.order_id,
                        });
                        if (fgError) throw fgError;
                        const { error: delError } = await supabase.from('wip_items').delete().eq('id', item.id);
                        if (delError) throw delError;
                        queryClient.invalidateQueries({ queryKey: ['wip_items'] });
                        queryClient.invalidateQueries({ queryKey: ['fg_items'] });
                        toast.success('Moved to Finished Goods');
                      } catch (err: any) {
                        toast.error(err.message || 'Failed to move to FG');
                      }
                    };
                    return (
                      <TableRow key={item.id} className={`bg-background ${selectedItems.has(item.id) ? 'bg-primary/5' : ''}`}>
                        <TableCell />
                        <TableCell className="w-8 px-2" onClick={e => e.stopPropagation()}>
                          {availQty > 0 && (
                            <Checkbox checked={selectedItems.has(item.id)} onCheckedChange={() => toggleSelectItem(item.id)} />
                          )}
                        </TableCell>
                        <TableCell className="text-xs"><span className="text-muted-foreground">Batch: </span><span className="font-medium">{batchNum}</span> <span className="text-muted-foreground ml-2">Make: </span><span className="font-medium">{item.make || '-'}</span></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.process || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono-num whitespace-nowrap">{formatDimensions(item)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.coating || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.grade || '-'}</TableCell>
                        <TableCell className="text-xs font-mono-num">{availQty.toFixed(2)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {canProcess && (
                              <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setProcessingItem(item); }}>Process (CTL)</Button>
                            )}
                            <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={(e) => { e.stopPropagation(); handleMoveToFG(); }} title="Move to FG without processing">
                              <ArrowRightCircle className="h-3.5 w-3.5" /> Move to FG
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 px-2 text-destructive" onClick={(e) => { e.stopPropagation(); setDefectDialog(item); }} title="Mark as defective">
                              <AlertTriangle className="h-3.5 w-3.5" /> Defective
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-orange-600 hover:bg-orange-50" onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Request to move this WIP item (${availQty.toFixed(2)} Kg) back to Coil Inventory?`)) return;
                              try {
                                await submitApproval.mutateAsync({
                                  action_type: 'move_back',
                                  entity_type: 'wip_item',
                                  entity_id: item.id,
                                  description: `Move WIP item (${availQty.toFixed(2)} Kg, ${item.material || '-'} ${item.thickness ?? ''}x${item.width ?? ''}) back to Coil Inventory`,
                                  metadata: { source_batch_id: item.source_batch_id, qty: item.qty, processing_record_id: item.processing_record_id },
                                });
                                toast.success('Move-back request submitted for approval');
                              } catch { toast.error('Failed to submit request'); }
                            }} title="Move back to Coil Inventory" disabled={submitApproval.isPending}>
                              <Undo2 className="h-3.5 w-3.5" /> Move Back
                            </Button>
                            {isAdmin && (
                              <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-destructive hover:bg-destructive/10" onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Delete this WIP item (${item.qty?.toFixed(2)} Kg)? Quantity will be restored to the source coil.`)) return;
                                try {
                                  const procRecId = item.processing_record_id;
                                  // Delete related defectives first (FK constraint)
                                  await supabase.from('wip_defectives' as any).delete().eq('wip_item_id', item.id);
                                  const { error } = await supabase.from('wip_items').delete().eq('id', item.id);
                                  if (error) throw error;
                                  if (procRecId) {
                                    const { data: remainingWip } = await supabase.from('wip_items').select('id').eq('processing_record_id', procRecId);
                                    if (!remainingWip || remainingWip.length === 0) {
                                      await supabase.from('processing_output_items').delete().eq('processing_record_id', procRecId);
                                      const { data: procRec } = await supabase.from('processing_records').select('batch_id, created_at').eq('id', procRecId).single();
                                      await supabase.from('processing_records').delete().eq('id', procRecId);
                                      if (procRec) {
                                        const procTime = new Date((procRec as any).created_at).getTime();
                                        const { data: batchActions } = await supabase.from('inventory_actions').select('*').eq('batch_id', (procRec as any).batch_id).in('action_type', ['scrap', 'defective']);
                                        if (batchActions) {
                                          const idsToDelete = batchActions.filter((a: any) => Math.abs(new Date(a.created_at).getTime() - procTime) < 5000).map((a: any) => a.id);
                                          if (idsToDelete.length > 0) await supabase.from('inventory_actions').delete().in('id', idsToDelete);
                                        }
                                        const { data: otherProcs } = await supabase.from('processing_records').select('id').eq('batch_id', (procRec as any).batch_id);
                                        if (!otherProcs || otherProcs.length === 0) {
                                          await supabase.from('batches').update({ batch_status: null } as any).eq('id', (procRec as any).batch_id);
                                        }
                                      }
                                    }
                                  }
                                  queryClient.invalidateQueries({ queryKey: ['wip_items'] });
                                  queryClient.invalidateQueries({ queryKey: ['batches'] });
                                  queryClient.invalidateQueries({ queryKey: ['processing_records'] });
                                  toast.success('WIP item deleted & quantity restored to coil');
                                } catch (err: any) {
                                  toast.error(err.message || 'Failed to delete');
                                }
                              }} title="Delete WIP item">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {processingItem && (
        <WIPProcessingDialog wipItem={processingItem} open={!!processingItem} onClose={() => setProcessingItem(null)} />
      )}

      {/* Defective Dialog */}
      <Dialog open={!!defectDialog} onOpenChange={() => setDefectDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record WIP Defective</DialogTitle>
          </DialogHeader>
          {defectDialog && (
            <div className="space-y-1 text-xs text-muted-foreground bg-muted/50 rounded p-2 mb-2">
              <p>SKU: {[defectDialog.material, defectDialog.thickness ? `${defectDialog.thickness}mm` : null, defectDialog.width ? `${defectDialog.width}W` : null, defectDialog.coating, defectDialog.grade].filter(Boolean).join(' | ') || '-'}</p>
              <p>Available Qty: <span className="font-semibold font-mono-num">{getAvailableQty(defectDialog).toFixed(2)} Kg</span></p>
            </div>
          )}
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Defect Type</Label>
              <Select value={defectForm.defect_type} onValueChange={v => setDefectForm(f => ({ ...f, defect_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Select defect type" /></SelectTrigger>
                <SelectContent>
                  {DEFECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Quantity (Kg)</Label><Input type="number" value={defectForm.quantity} onChange={e => setDefectForm(v => ({ ...v, quantity: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDefectDialog(null)}>Cancel</Button>
            <Button onClick={handleDefectSubmit} disabled={insertWIPDefective.isPending} variant="destructive">
              {insertWIPDefective.isPending ? 'Saving...' : 'Record Defective'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Move to FG Dialog */}
      <Dialog open={bulkMoveOpen} onOpenChange={(o) => { if (!o) setBulkMoveOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Move to FG — {selectedWIPItems.length} Items</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto rounded-md border mt-2">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Batch</TableHead>
                  <TableHead className="text-xs text-right">Qty (Kg)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedWIPItems.map(item => {
                  const avail = getAvailableQty(item);
                  const skuLabel = [item.material, item.thickness ? `${item.thickness}mm` : null, item.width ? `${item.width}W` : null, item.coating, item.grade].filter(Boolean).join(' | ') || '-';
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">{skuLabel}</TableCell>
                      <TableCell className="text-xs">{batchMap.get(item.source_batch_id) || '-'}</TableCell>
                      <TableCell className="text-xs text-right font-mono-num">{avail.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkMoveOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkMoveToFG}>
              Move {selectedWIPItems.length} Items to FG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Process CTL Dialog */}
      {bulkProcessOpen && (
        <BulkWIPProcessingDialog
          wipItems={selectedWIPItems}
          open={bulkProcessOpen}
          onClose={() => { setBulkProcessOpen(false); setSelectedItems(new Set()); }}
          batchMap={batchMap}
          getAvailableQty={getAvailableQty}
        />
      )}
    </div>
  );
}
