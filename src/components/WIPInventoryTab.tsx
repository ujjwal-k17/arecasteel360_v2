import { useState, useMemo } from 'react';
import { uniqueCaseInsensitive, eqCI } from '@/lib/utils';
import { useWIPItems } from '@/hooks/useProcessing';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ChevronRight, ChevronDown, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { ArrowRightCircle } from 'lucide-react';
import WIPProcessingDialog from './WIPProcessingDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useSubmitApproval } from '@/hooks/useActionLog';

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

  const batchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of batches || []) map.set(b.id, b.batch_number);
    return map;
  }, [batches]);

  const items = wipItems || [];

  // Unique values for filters
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

  const grandTotalQty = useMemo(() => filteredItems.reduce((s, i) => s + (i.qty || 0), 0), [filteredItems]);

  const skuGroups = useMemo(() => {
    const map = new Map<string, SKUGroup>();
    for (const item of filteredItems) {
      const key = [item.material || '', item.process || '', item.thickness ?? '', item.width ?? '', item.coating || '', item.grade || ''].join('|');
      if (!map.has(key)) {
        map.set(key, { key, material: item.material || '-', make: item.make || '-', process: item.process || '-', thickness: item.thickness, width: item.width, coating: item.coating || '-', grade: item.grade || '-', totalQty: 0, items: [] });
      }
      const g = map.get(key)!;
      g.totalQty += item.qty || 0;
      g.items.push(item);
    }
    return Array.from(map.values());
  }, [filteredItems]);

  const displayedSkuGroups = useMemo(() => {
    if (materialTab === 'all') return skuGroups;
    return skuGroups.filter(g => eqCI(g.material || '', materialTab));
  }, [skuGroups, materialTab]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  const formatDimensions = (item: any) => {
    const t = item.thickness ?? '-';
    const w = item.width ?? '-';
    const isSlit = (item.process || '').toLowerCase().includes('slit');
    return `${t} x ${w} x ${isSlit ? 'Coil' : (item.length ?? '-')}`;
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
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['wip_items'] }); queryClient.invalidateQueries({ queryKey: ['batches_lookup'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <div className="bg-primary/10 text-primary rounded-md px-3 py-1.5 text-sm font-semibold font-mono-num">
          Total: {grandTotalQty.toFixed(2)} Kg ({filteredItems.length} items)
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
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
            {skuGroups.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No WIP items found.</TableCell></TableRow>
            )}
            {skuGroups.map(g => {
              const isOpen = expanded.has(g.key);
              return (
                <>
                  <TableRow key={g.key} className="cursor-pointer hover:bg-muted/30 bg-muted/10 font-medium" onClick={() => toggleExpand(g.key)}>
                    <TableCell className="w-8 px-2">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="text-sm">{g.material}</TableCell>
                    <TableCell className="text-sm">{g.process}</TableCell>
                    <TableCell className="text-sm font-mono-num whitespace-nowrap">{g.thickness ?? '-'} x {g.width ?? '-'} x Coil</TableCell>
                    <TableCell className="text-sm">{g.coating}</TableCell>
                    <TableCell className="text-sm">{g.grade}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{g.totalQty.toFixed(2)}</TableCell>
                    <TableCell><span className="text-xs text-muted-foreground">{g.items.length} item{g.items.length !== 1 ? 's' : ''}</span></TableCell>
                  </TableRow>
                  {isOpen && g.items.map((item: any) => {
                    const canProcess = item.process === 'Slit Coil';
                     const batchNum = batchMap.get(item.source_batch_id) || '-';
                     const handleMoveToFG = async () => {
                       if (!confirm(`Move this WIP item (${item.qty?.toFixed(2)} Kg) to Finished Goods?`)) return;
                       try {
                         const { error: fgError } = await supabase.from('fg_items').insert({
                           source_id: item.source_batch_id,
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
                           qty: item.qty,
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
                      <TableRow key={item.id} className="bg-background">
                         <TableCell />
                         <TableCell className="text-xs"><span className="text-muted-foreground">Batch: </span><span className="font-medium">{batchNum}</span> <span className="text-muted-foreground ml-2">Make: </span><span className="font-medium">{item.make || '-'}</span></TableCell>
                         <TableCell className="text-xs text-muted-foreground">{item.process || '-'}</TableCell>
                         <TableCell className="text-xs text-muted-foreground font-mono-num whitespace-nowrap">{formatDimensions(item)}</TableCell>
                         <TableCell className="text-xs text-muted-foreground">{item.coating || '-'}</TableCell>
                         <TableCell className="text-xs text-muted-foreground">{item.grade || '-'}</TableCell>
                         <TableCell className="text-xs font-mono-num">{item.qty ?? '-'}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {canProcess && (
                                <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setProcessingItem(item); }}>Process (CTL)</Button>
                              )}
                               <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={(e) => { e.stopPropagation(); handleMoveToFG(); }} title="Move to FG without processing">
                                 <ArrowRightCircle className="h-3.5 w-3.5" /> Move to FG
                               </Button>
                               <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-orange-600 hover:bg-orange-50" onClick={async (e) => {
                                 e.stopPropagation();
                                 if (!confirm(`Request to move this WIP item (${item.qty?.toFixed(2)} Kg) back to Coil Inventory?`)) return;
                                 try {
                                   await submitApproval.mutateAsync({
                                     action_type: 'move_back',
                                     entity_type: 'wip_item',
                                     entity_id: item.id,
                                     description: `Move WIP item (${item.qty?.toFixed(2)} Kg, ${item.material || '-'} ${item.thickness ?? ''}x${item.width ?? ''}) back to Coil Inventory`,
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
                                    // Delete associated processing output items & record to restore coil balance
                                    if (item.processing_record_id) {
                                      await supabase.from('processing_output_items').delete().eq('processing_record_id', item.processing_record_id);
                                      await supabase.from('processing_records').delete().eq('id', item.processing_record_id);
                                    }
                                    const { error } = await supabase.from('wip_items').delete().eq('id', item.id);
                                    if (error) throw error;
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
     </div>
   );
 }
