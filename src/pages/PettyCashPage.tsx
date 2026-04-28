import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Check, ArrowDownCircle, ArrowUpCircle, Wallet, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCashEntries, useInsertCashEntry, useUpdateCashEntry, useDeleteCashEntry, useCashCategories, type CashEntry } from '@/hooks/useCashBook';
import { useAuth } from '@/contexts/AuthContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type Direction = 'in' | 'out';

const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PettyCashPage() {
  const { data: entries = [] } = useCashEntries();
  const insertEntry = useInsertCashEntry();
  const updateEntry = useUpdateCashEntry();
  const deleteEntry = useDeleteCashEntry();
  const { isAdmin } = useAuth();
  const { data: catIn } = useCashCategories('in');
  const { data: catOut } = useCashCategories('out');

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; entry: CashEntry | null }>({ open: false, entry: null });

  const [addDialog, setAddDialog] = useState<{ open: boolean; direction: Direction }>({ open: false, direction: 'in' });
  const [form, setForm] = useState({ entry_date: new Date().toISOString().slice(0, 10), amount: '', category: '', sub_category: '', comments: '' });
  const [receiveDialog, setReceiveDialog] = useState<{ open: boolean; entry: CashEntry | null; received_date: string }>({ open: false, entry: null, received_date: new Date().toISOString().slice(0, 10) });

  const activeCat = addDialog.direction === 'in' ? catIn : catOut;
  const categories = activeCat?.categories || [];
  const subByParent = activeCat?.subByParent || {};

  const receivable = useMemo(() => entries.filter(e => e.direction === 'in' && e.status === 'receivable'), [entries]);
  const received = useMemo(() => entries.filter(e => e.direction === 'in' && e.status === 'received'), [entries]);
  const cashOut = useMemo(() => entries.filter(e => e.direction === 'out'), [entries]);

  const totalReceivable = receivable.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalReceived = received.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalOut = cashOut.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netBalance = totalReceived - totalOut;

  const openAdd = (direction: Direction) => {
    setForm({ entry_date: new Date().toISOString().slice(0, 10), amount: '', category: '', sub_category: '', comments: '' });
    setAddDialog({ open: true, direction });
  };

  const handleAdd = async () => {
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Amount required'); return; }
    if (!form.category) { toast.error('Category required'); return; }
    await insertEntry.mutateAsync({
      direction: addDialog.direction,
      status: 'received',
      entry_date: form.entry_date,
      amount: Number(form.amount),
      category: form.category,
      sub_category: form.sub_category || null,
      comments: form.comments || null,
    });
    toast.success('Entry added');
    setAddDialog({ open: false, direction: addDialog.direction });
  };

  const handleMarkReceived = async () => {
    if (!receiveDialog.entry) return;
    await updateEntry.mutateAsync({
      id: receiveDialog.entry.id,
      status: 'received',
      received_date: receiveDialog.received_date,
      entry_date: receiveDialog.received_date,
    });
    toast.success('Marked as received');
    setReceiveDialog({ open: false, entry: null, received_date: new Date().toISOString().slice(0, 10) });
  };

  const subOptions = form.category ? (subByParent[form.category] || subByParent['_'] || []) : [];

  return (
    <div className="container py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Wallet className="h-6 w-6" /> Cash Book</h1>
      </div>

      <Tabs defaultValue="cash-in">
        <TabsList>
          <TabsTrigger value="cash-in" className="gap-1"><ArrowDownCircle className="h-4 w-4" /> Cash In</TabsTrigger>
          <TabsTrigger value="cash-out" className="gap-1"><ArrowUpCircle className="h-4 w-4" /> Cash Out</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        {/* CASH IN */}
        <TabsContent value="cash-in" className="mt-4">
          <Tabs defaultValue="receivable">
            <TabsList>
              <TabsTrigger value="receivable">Receivable ({receivable.length})</TabsTrigger>
              <TabsTrigger value="received">Received ({received.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="receivable" className="mt-3">
              <div className="rounded-md border bg-card overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50">
                    <TableHead className="text-xs font-semibold">Date</TableHead>
                    <TableHead className="text-xs font-semibold">Debtor</TableHead>
                    <TableHead className="text-xs font-semibold">Source</TableHead>
                    <TableHead className="text-xs font-semibold">Comments</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Amount (₹)</TableHead>
                    <TableHead className="text-xs font-semibold w-32">Action</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {receivable.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No receivables.</TableCell></TableRow>}
                    {receivable.map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{e.entry_date}</TableCell>
                        <TableCell className="text-xs">{e.debtor_name || '-'}</TableCell>
                        <TableCell className="text-xs">{e.category || '-'}{e.sub_category ? ` · ${e.sub_category}` : ''}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.comments || '-'}</TableCell>
                        <TableCell className="text-xs font-mono-num text-right">{fmt(Number(e.amount))}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setReceiveDialog({ open: true, entry: e, received_date: new Date().toISOString().slice(0, 10) })}>
                            <Check className="h-3 w-3" /> Received
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="received" className="mt-3">
              <div className="flex justify-end mb-3">
                <Button size="sm" className="gap-2" onClick={() => openAdd('in')}><Plus className="h-4 w-4" /> Add Cash In</Button>
              </div>
              <div className="rounded-md border bg-card overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50">
                    <TableHead className="text-xs font-semibold">Date</TableHead>
                    <TableHead className="text-xs font-semibold">Category</TableHead>
                    <TableHead className="text-xs font-semibold">Sub Category</TableHead>
                    <TableHead className="text-xs font-semibold">Comments</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Amount (₹)</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {received.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No entries.</TableCell></TableRow>}
                    {received.map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{e.entry_date}</TableCell>
                        <TableCell className="text-xs">{e.category || '-'}</TableCell>
                        <TableCell className="text-xs">{e.sub_category || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.comments || '-'}{e.debtor_name ? ` (${e.debtor_name})` : ''}</TableCell>
                        <TableCell className="text-xs font-mono-num text-right text-emerald-600 font-semibold">{fmt(Number(e.amount))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* CASH OUT */}
        <TabsContent value="cash-out" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" className="gap-2" onClick={() => openAdd('out')}><Plus className="h-4 w-4" /> Add Cash Out</Button>
          </div>
          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Date</TableHead>
                <TableHead className="text-xs font-semibold">Category</TableHead>
                <TableHead className="text-xs font-semibold">Sub Category</TableHead>
                <TableHead className="text-xs font-semibold">Comments</TableHead>
                <TableHead className="text-xs font-semibold">Source</TableHead>
                <TableHead className="text-xs font-semibold text-right">Amount (₹)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {cashOut.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No entries.</TableCell></TableRow>}
                {cashOut.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{e.entry_date}</TableCell>
                    <TableCell className="text-xs">{e.category || '-'}</TableCell>
                    <TableCell className="text-xs">{e.sub_category || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.comments || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.source_type || 'manual'}</TableCell>
                    <TableCell className="text-xs font-mono-num text-right text-destructive font-semibold">{fmt(Number(e.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* SUMMARY */}
        <TabsContent value="summary" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Receivable</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold font-mono-num">₹{fmt(totalReceivable)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Received</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold font-mono-num text-emerald-600">₹{fmt(totalReceived)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Cash Out</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold font-mono-num text-destructive">₹{fmt(totalOut)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Net Balance</CardTitle></CardHeader><CardContent><p className={`text-2xl font-semibold font-mono-num ${netBalance >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>₹{fmt(netBalance)}</p></CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Cash In/Out Dialog */}
      <Dialog open={addDialog.open} onOpenChange={o => setAddDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Cash {addDialog.direction === 'in' ? 'In' : 'Out'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Date</Label><Input type="date" value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} /></div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v, sub_category: '' }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Sub Category</Label>
              <Select value={form.sub_category} onValueChange={v => setForm(f => ({ ...f, sub_category: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select sub category" /></SelectTrigger>
                <SelectContent>{subOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Amount (₹)</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div><Label className="text-xs">Comments</Label><Textarea rows={2} value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddDialog(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={handleAdd} disabled={insertEntry.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Received Dialog */}
      <Dialog open={receiveDialog.open} onOpenChange={o => setReceiveDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mark as Received</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">From {receiveDialog.entry?.debtor_name || '-'} · ₹{receiveDialog.entry ? fmt(Number(receiveDialog.entry.amount)) : '-'}</p>
            <div><Label className="text-xs">Received Date</Label><Input type="date" value={receiveDialog.received_date} onChange={e => setReceiveDialog(p => ({ ...p, received_date: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReceiveDialog({ open: false, entry: null, received_date: new Date().toISOString().slice(0, 10) })}>Cancel</Button>
            <Button onClick={handleMarkReceived} disabled={updateEntry.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
