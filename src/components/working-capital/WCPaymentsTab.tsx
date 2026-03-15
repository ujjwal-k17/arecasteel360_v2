import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, RefreshCw } from 'lucide-react';
import { useCustomers } from '@/hooks/useOrders';
import { useInwardPayments, useInsertInwardPayment } from '@/hooks/useWorkingCapital';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function WCPaymentsTab() {
  const queryClient = useQueryClient();
  const { data: customers } = useCustomers();
  const { data: payments } = useInwardPayments();
  const insertPayment = useInsertInwardPayment();

  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

  const handleSave = async () => {
    if (!customerId) { toast.error('Select a customer'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (!paymentDate) { toast.error('Enter a date'); return; }

    await insertPayment.mutateAsync({ customer_id: customerId, amount: amt, payment_date: paymentDate });
    setOpen(false);
    setCustomerId('');
    setAmount('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['inward_payments'] });
    toast.success('Refreshed');
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-2 ml-auto">
          <Plus className="h-4 w-4" /> Add Inward Payment
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold">Date</TableHead>
              <TableHead className="text-xs font-semibold">Customer Name</TableHead>
              <TableHead className="text-xs font-semibold">Amount (₹)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!payments || payments.length === 0) && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  No payments recorded yet.
                </TableCell>
              </TableRow>
            )}
            {(payments || []).map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="text-sm">{p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                <TableCell className="text-sm">{p.customers?.customer_name || '-'}</TableCell>
                <TableCell className="text-sm font-mono">₹{(p.amount || 0).toLocaleString('en-IN')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Inward Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Customer</label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {(customers || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Amount Received (₹)</label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Payment Date</label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={insertPayment.isPending}>
              {insertPayment.isPending ? 'Saving...' : 'Save Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
