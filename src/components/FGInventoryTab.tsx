import { useState, useMemo } from 'react';
import { useFGItems } from '@/hooks/useProcessing';
import { useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
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

  const items = fgItems || [];

  const skuGroups = useMemo(() => {
    const map = new Map<string, SKUGroup>();
    for (const item of items) {
      const key = [
        item.material || '',
        item.make || '',
        item.process || '',
        item.thickness ?? '',
        item.width ?? '',
        item.length ?? '',
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
          length: item.length,
          coating: item.coating || '-',
          grade: item.grade || '-',
          totalQty: 0,
          totalPcs: 0,
          items: [],
        });
      }
      const g = map.get(key)!;
      g.totalQty += item.qty || 0;
      g.totalPcs += item.num_pcs || 0;
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

  const formatDimensions = (t: any, w: any, l: any, process: string) => {
    const isSlit = (process || '').toLowerCase().includes('slit');
    return `${t ?? '-'} x ${w ?? '-'} x ${isSlit ? 'Coil' : (l ?? '-')}`;
  };

  const cols = ['', 'Material', 'Make', 'Process', 'Dimensions', 'Coating', 'Grade', 'Qty (Kg)', '# Pcs'];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['fg_items'] }); toast.success('Refreshed'); }} className="gap-2">
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
              <TableRow><TableCell colSpan={cols.length} className="text-center text-muted-foreground py-8">No FG items yet.</TableCell></TableRow>
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
                      {formatDimensions(g.thickness, g.width, g.length, g.process)}
                    </TableCell>
                    <TableCell className="text-sm">{g.coating}</TableCell>
                    <TableCell className="text-sm">{g.grade}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{g.totalQty.toFixed(2)}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{g.totalPcs}</TableCell>
                  </TableRow>
                  {isOpen && g.items.map((item: any) => (
                    <TableRow key={item.id} className="bg-background">
                      <TableCell />
                      <TableCell className="text-xs text-muted-foreground">{item.material || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.make || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.process || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono-num whitespace-nowrap">
                        {formatDimensions(item.thickness, item.width, item.length, item.process)}
                      </TableCell>
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
