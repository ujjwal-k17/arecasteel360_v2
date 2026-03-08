import { useState, useMemo } from 'react';
import { useWIPItems } from '@/hooks/useProcessing';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RefreshCw, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import WIPProcessingDialog from './WIPProcessingDialog';

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
  const [processingItem, setProcessingItem] = useState<any | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Fetch batch numbers for source_batch_id lookup
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
    for (const b of batches || []) {
      map.set(b.id, b.batch_number);
    }
    return map;
  }, [batches]);

  const items = wipItems || [];

  const skuGroups = useMemo(() => {
    const map = new Map<string, SKUGroup>();
    for (const item of items) {
      const key = [
        item.material || '',
        item.make || '',
        item.process || '',
        item.thickness ?? '',
        item.width ?? '',
        item.coating || '',
        item.grade || '',
      ].join('|');

      if (!map.has(key)) {
        map.set(key, {
          key,
          material: item.material || '-',
          make: item.make || '-',
          process: item.process || '-',
          thickness: item.thickness,
          width: item.width,
          coating: item.coating || '-',
          grade: item.grade || '-',
          totalQty: 0,
          items: [],
        });
      }
      const g = map.get(key)!;
      g.totalQty += item.qty || 0;
      g.items.push(item);
    }
    return Array.from(map.values());
  }, [items]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const formatDimensions = (item: any) => {
    const t = item.thickness ?? '-';
    const w = item.width ?? '-';
    const isSlit = (item.process || '').toLowerCase().includes('slit');
    const l = isSlit ? 'Coil' : (item.length ?? '-');
    return `${t} x ${w} x ${l}`;
  };

  const cols = ['', 'Material', 'Make', 'Process', 'Dimensions', 'Coating', 'Grade', 'Qty (Kg)', 'Action'];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['wip_items'] }); queryClient.invalidateQueries({ queryKey: ['batches_lookup'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {cols.map(c => <TableHead key={c} className="text-xs font-semibold whitespace-nowrap">{c}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {skuGroups.length === 0 && (
              <TableRow><TableCell colSpan={cols.length} className="text-center text-muted-foreground py-8">No WIP items yet.</TableCell></TableRow>
            )}
            {skuGroups.map(g => {
              const isOpen = expanded.has(g.key);
              return (
                <>
                  <TableRow
                    key={g.key}
                    className="cursor-pointer hover:bg-muted/30 bg-muted/10 font-medium"
                    onClick={() => toggleExpand(g.key)}
                  >
                    <TableCell className="w-8 px-2">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="text-sm">{g.material}</TableCell>
                    <TableCell className="text-sm">{g.make}</TableCell>
                    <TableCell className="text-sm">{g.process}</TableCell>
                    <TableCell className="text-sm font-mono-num whitespace-nowrap">
                      {g.thickness ?? '-'} x {g.width ?? '-'} x Coil
                    </TableCell>
                    <TableCell className="text-sm">{g.coating}</TableCell>
                    <TableCell className="text-sm">{g.grade}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{g.totalQty.toFixed(2)}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{g.items.length} item{g.items.length !== 1 ? 's' : ''}</span>
                    </TableCell>
                  </TableRow>
                  {isOpen && g.items.map((item: any) => {
                    const canProcess = item.process === 'Slit Coil';
                    const batchNum = batchMap.get(item.source_batch_id) || '-';
                    return (
                      <TableRow key={item.id} className="bg-background">
                        <TableCell />
                        <TableCell colSpan={2} className="text-xs">
                          <span className="text-muted-foreground">Batch: </span>
                          <span className="font-medium">{batchNum}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.process || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono-num whitespace-nowrap">{formatDimensions(item)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.coating || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.grade || '-'}</TableCell>
                        <TableCell className="text-xs font-mono-num">{item.qty ?? '-'}</TableCell>
                        <TableCell>
                          {canProcess ? (
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setProcessingItem(item); }}>
                              Process (CTL)
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
