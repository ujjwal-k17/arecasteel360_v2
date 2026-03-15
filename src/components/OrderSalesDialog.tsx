import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useInsertDispatches, useOrderDispatches } from '@/hooks/useOrders';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSkuLabel } from '@/lib/sku-utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  order: any;
}

export default function OrderSalesDialog({ open, onOpenChange, order }: Props) {
  const items = order?.order_items || [];
  const itemIds = items.map((i: any) => i.id);
  const { data: dispatches } = useOrderDispatches(itemIds);
  const insertDispatches = useInsertDispatches();

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [dispatchDate, setDispatchDate] = useState<Date | undefined>(new Date());

  const getDispatchedQty = (itemId: string) => {
    if (!dispatches) return 0;
    return dispatches
      .filter(d => d.order_item_id === itemId)
      .reduce((s, d) => s + (Number(d.dispatch_qty) || 0), 0);
  };

  const handleSave = async () => {
    const toDispatch = items
      .filter((i: any) => quantities[i.id] && Number(quantities[i.id]) > 0)
      .map((i: any) => ({
        order_item_id: i.id,
        dispatch_qty: Number(quantities[i.id]),
        dispatch_date: dispatchDate ? format(dispatchDate, 'yyyy-MM-dd') : undefined,
        invoice_number: invoiceNumber || undefined,
      }));

    if (toDispatch.length === 0) {
      toast.error('Enter dispatch quantity for at least one item');
      return;
    }

    // Validate no over-dispatch
    for (const d of toDispatch) {
      const item = items.find((i: any) => i.id === d.order_item_id);
      const already = getDispatchedQty(d.order_item_id);
      const balance = (Number(item?.net_weight) || 0) - already;
      if (d.dispatch_qty > balance) {
        toast.error(`Dispatch qty exceeds balance for ${getSkuLabel(item)}`);
        return;
      }
    }

    try {
      await insertDispatches.mutateAsync(toDispatch);
      toast.success('Dispatch recorded');
      setQuantities({});
      setInvoiceNumber('');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to record dispatch');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sales / Dispatch — {order?.order_number}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-1">
            <Label>Invoice Number</Label>
            <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Invoice #" />
          </div>
          <div className="space-y-1">
            <Label>Dispatch Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dispatchDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dispatchDate ? format(dispatchDate, 'dd/MM/yyyy') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dispatchDate} onSelect={setDispatchDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Order Qty</TableHead>
              <TableHead className="text-right">Dispatched</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Dispatch Now (Kg)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item: any) => {
              const dispatched = getDispatchedQty(item.id);
              const orderQty = Number(item.net_weight) || 0;
              const balance = orderQty - dispatched;
              return (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">{getSKULabel(item)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{orderQty.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{dispatched.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{balance.toFixed(2)}</TableCell>
                  <TableCell className="text-right w-32">
                    <Input
                      type="number"
                      className="h-8 text-xs text-right"
                      placeholder="0"
                      value={quantities[item.id] || ''}
                      onChange={e => setQuantities(prev => ({ ...prev, [item.id]: e.target.value }))}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={insertDispatches.isPending}>
            {insertDispatches.isPending ? 'Saving…' : 'Record Dispatch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
