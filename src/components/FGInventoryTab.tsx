import { useFGItems } from '@/hooks/useProcessing';
import { useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function FGInventoryTab() {
  const { data: fgItems } = useFGItems();
  const queryClient = useQueryClient();

  const items = fgItems || [];

  const cols = ['Material', 'Make', 'Process', 'Width', 'Length', 'Coating', 'Grade', 'Qty (Kg)', '# Pcs', 'Order ID'];

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
            {items.length === 0 && (
              <TableRow><TableCell colSpan={cols.length} className="text-center text-muted-foreground py-8">No FG items yet.</TableCell></TableRow>
            )}
            {items.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell className="text-sm">{item.material || '-'}</TableCell>
                <TableCell className="text-sm">{item.make || '-'}</TableCell>
                <TableCell className="text-sm">{item.process || '-'}</TableCell>
                <TableCell className="text-sm font-mono-num">{item.width ?? '-'}</TableCell>
                <TableCell className="text-sm font-mono-num">{item.length ?? '-'}</TableCell>
                <TableCell className="text-sm">{item.coating || '-'}</TableCell>
                <TableCell className="text-sm">{item.grade || '-'}</TableCell>
                <TableCell className="text-sm font-mono-num font-semibold">{item.qty ?? '-'}</TableCell>
                <TableCell className="text-sm font-mono-num">{item.num_pcs ?? '-'}</TableCell>
                <TableCell className="text-sm">{item.order_id || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
