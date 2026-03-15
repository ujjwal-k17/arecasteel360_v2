import { useState } from 'react';
import { useOrders } from '@/hooks/useOrders';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import NewOrderDialog from '@/components/NewOrderDialog';

export default function OrderBookPage() {
  const { data: orders, isLoading } = useOrders();
  const [showNew, setShowNew] = useState(false);
  const qc = useQueryClient();

  const getSKUDescription = (items: any[]) => {
    if (!items || items.length === 0) return '-';
    return items.map(i => {
      const parts = [i.material, i.form, i.thickness ? `${i.thickness}mm` : null, i.width ? `${i.width}W` : null, i.length ? `${i.length}L` : null, i.coating, i.grade].filter(Boolean);
      return parts.join(' | ');
    }).join('; ');
  };

  const getTotalQty = (items: any[]) => {
    if (!items || items.length === 0) return 0;
    return items.reduce((s: number, i: any) => s + (Number(i.net_weight) || 0), 0);
  };

  return (
    <div className="container py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Order Book</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ['orders'] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Order
          </Button>
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer Name</TableHead>
              <TableHead>Material Description</TableHead>
              <TableHead className="text-right">Total Qty (Kg)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !orders || orders.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No orders yet</TableCell></TableRow>
            ) : orders.map((o: any) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                <TableCell>{(o.customers as any)?.customer_name || '-'}</TableCell>
                <TableCell className="text-xs max-w-[400px] truncate">{getSKUDescription(o.order_items)}</TableCell>
                <TableCell className="text-right font-mono">{getTotalQty(o.order_items).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NewOrderDialog open={showNew} onOpenChange={setShowNew} />
    </div>
  );
}
