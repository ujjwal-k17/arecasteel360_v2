import { useState, useMemo } from 'react';
import { useFGItems } from '@/hooks/useProcessing';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface SKUGroup {
  key: string;
  material: string;
  make: string;
  process: string;
  thickness: number | null;
  width: number | null;
  length: number | null;
  coating: string;
  grade: string;
  totalQty: number;
  totalPcs: number;
  items: any[];
}

export default function FGInventoryTab() {
  const { data: fgItems } = useFGItems();
  const queryClient = useQueryClient();
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

  const { data: wipItemsRaw } = useQuery({
    queryKey: ['wip_items_lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wip_items' as any).select('id, source_batch_id');
      if (error) throw error;
      return data as any[];
    },
  });

  const batchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of batches || []) map.set(b.id, b.batch_number);
    return map;
  }, [batches]);

  const wipBatchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of wipItemsRaw || []) {
      const bn = batchMap.get(w.source_batch_id);
      if (bn) map.set(w.id, bn);
    }
    return map;
  }, [wipItemsRaw, batchMap]);

  const items = fgItems || [];

  const uniqueVals = useMemo(() => ({
    material: [...new Set(items.map(i => i.material || '-'))].sort(),
    make: [...new Set(items.map(i => i.make || '-'))].sort(),
    process: [...new Set(items.map(i => i.process || '-'))].sort(),
    coating: [...new Set(items.map(i => i.coating || '-'))].sort(),
    grade: [...new Set(items.map(i => i.grade || '-'))].sort(),
  }), [items]);

  const filteredItems = useMemo(() => {
    return items.filter(i =>
      (filterMaterial === 'all' || (i.material || '-') === filterMaterial) &&
      (filterMake === 'all' || (i.make || '-') === filterMake) &&
      (filterProcess === 'all' || (i.process || '-') === filterProcess) &&
      (filterCoating === 'all' || (i.coating || '-') === filterCoating) &&
      (filterGrade === 'all' || (i.grade || '-') === filterGrade)
    );
  }, [items, filterMaterial, filterMake, filterProcess, filterCoating, filterGrade]);

  const grandTotalQty = useMemo(() => filteredItems.reduce((s, i) => s + (i.qty || 0), 0), [filteredItems]);
  const grandTotalPcs = useMemo(() => filteredItems.reduce((s, i) => s + (i.num_pcs || 0), 0), [filteredItems]);

  const skuGroups = useMemo(() => {
    const map = new Map<string, SKUGroup>();
    for (const item of filteredItems) {
      const key = [item.material || '', item.make || '', item.process || '', item.thickness ?? '', item.width ?? '', item.length ?? '', item.coating || '', item.grade || ''].join('|');
      if (!map.has(key)) {
        map.set(key, { key, material: item.material || '-', make: item.make || '-', process: item.process || '-', thickness: item.thickness, width: item.width, length: item.length, coating: item.coating || '-', grade: item.grade || '-', totalQty: 0, totalPcs: 0, items: [] });
      }
      const g = map.get(key)!;
      g.totalQty += item.qty || 0;
      g.totalPcs += item.num_pcs || 0;
      g.items.push(item);
    }
    return Array.from(map.values());
  }, [filteredItems]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  const formatDimensions = (t: any, w: any, l: any, process: string) => {
    const isSlit = (process || '').toLowerCase().includes('slit');
    return `${t ?? '-'} x ${w ?? '-'} x ${isSlit ? 'Coil' : (l ?? '-')}`;
  };

  const getBatchNumber = (item: any): string => {
    if (item.source_type === 'wip') return wipBatchMap.get(item.source_id) || '-';
    return batchMap.get(item.source_id) || '-';
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
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['fg_items'] }); queryClient.invalidateQueries({ queryKey: ['batches_lookup'] }); queryClient.invalidateQueries({ queryKey: ['wip_items_lookup'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <div className="bg-primary/10 text-primary rounded-md px-3 py-1.5 text-sm font-semibold font-mono-num">
          Total: {grandTotalQty.toFixed(2)} Kg · {grandTotalPcs} Pcs ({filteredItems.length} items)
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold w-8" />
              <TableHead className="text-xs font-semibold whitespace-nowrap">Material</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Make</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Process</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Dimensions</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Coating</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Grade</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Qty (Kg)</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap"># Pcs</TableHead>
            </TableRow>
            <TableRow className="bg-muted/20">
              <TableHead />
              <TableHead><FilterSelect value={filterMaterial} onChange={setFilterMaterial} options={uniqueVals.material} placeholder="Material" /></TableHead>
              <TableHead><FilterSelect value={filterMake} onChange={setFilterMake} options={uniqueVals.make} placeholder="Make" /></TableHead>
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
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No FG items found.</TableCell></TableRow>
            )}
            {skuGroups.map(g => {
              const isOpen = expanded.has(g.key);
              return (
                <>
                  <TableRow key={g.key} className="cursor-pointer hover:bg-muted/30 bg-muted/10 font-medium" onClick={() => toggleExpand(g.key)}>
                    <TableCell className="w-8 px-2">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="text-sm">{g.material}</TableCell>
                    <TableCell className="text-sm">{g.make}</TableCell>
                    <TableCell className="text-sm">{g.process}</TableCell>
                    <TableCell className="text-sm font-mono-num whitespace-nowrap">{formatDimensions(g.thickness, g.width, g.length, g.process)}</TableCell>
                    <TableCell className="text-sm">{g.coating}</TableCell>
                    <TableCell className="text-sm">{g.grade}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{g.totalQty.toFixed(2)}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{g.totalPcs}</TableCell>
                  </TableRow>
                  {isOpen && g.items.map((item: any) => (
                    <TableRow key={item.id} className="bg-background">
                      <TableCell />
                      <TableCell colSpan={2} className="text-xs"><span className="text-muted-foreground">Batch: </span><span className="font-medium">{getBatchNumber(item)}</span></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.process || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono-num whitespace-nowrap">{formatDimensions(item.thickness, item.width, item.length, item.process)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.coating || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.grade || '-'}</TableCell>
                      <TableCell className="text-xs font-mono-num">{item.qty ?? '-'}</TableCell>
                      <TableCell className="text-xs font-mono-num">{item.num_pcs ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
