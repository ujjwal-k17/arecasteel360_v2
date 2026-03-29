import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Download, Plus, RefreshCw, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export function TransporterFreightTab() {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [commentDialog, setCommentDialog] = useState<{ open: boolean; id: string; comments: string }>({ open: false, id: '', comments: '' });
  const [addTransporterDialog, setAddTransporterDialog] = useState(false);
  const [newTransporterName, setNewTransporterName] = useState('');

  const { data: freightRecords, isLoading } = useQuery({
    queryKey: ['transporter_freight_records'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transporter_freight')
        .select('*, transporters(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: invoiceDetails } = useQuery({
    queryKey: ['freight_invoice_details_for_tpt'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_details')
        .select('invoice_number, invoice_amount')
        .not('dispatch_type', 'is', null)
        .eq('dispatch_type', 'Transporter');
      if (error) throw error;
      return data;
    },
  });

  const { data: transporters } = useQuery({
    queryKey: ['transporters_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transporters').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const addTransporter = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('transporters').insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transporters_list'] });
      toast.success('Transporter added');
      setAddTransporterDialog(false);
      setNewTransporterName('');
    },
    onError: () => toast.error('Failed to add transporter'),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('transporter_freight').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_records'] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const updateComments = useMutation({
    mutationFn: async ({ id, comments }: { id: string; comments: string }) => {
      const { error } = await supabase.from('transporter_freight').update({ comments }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_records'] });
      toast.success('Comments saved');
      setCommentDialog({ open: false, id: '', comments: '' });
    },
    onError: () => toast.error('Failed to save comments'),
  });

  const filtered = (freightRecords || []).filter((r: any) => {
    const date = r.created_at?.slice(0, 10);
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;
    return true;
  });

  const totalFreight = filtered.reduce((s: number, r: any) => s + (r.total_freight || 0), 0);

  const handleDownload = () => {
    if (filtered.length === 0) { toast.info('No data'); return; }
    const rows = filtered.map((r: any, i: number) => ({
      '#': i + 1,
      'Invoice Number': r.invoice_number,
      'Transporter': (r as any).transporters?.name || '-',
      'Total Freight (₹)': r.total_freight || 0,
      'Status': r.status,
      'Comments': r.comments || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TPT Freight');
    XLSX.writeFile(wb, `TPT_Freight_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => {
          queryClient.invalidateQueries({ queryKey: ['transporter_freight_records'] });
          queryClient.invalidateQueries({ queryKey: ['transporters_list'] });
        }}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setAddTransporterDialog(true)}>
          <Plus className="h-4 w-4" /> Add Transporter
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Input type="date" className="h-8 w-36 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-36 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Records:</span>{' '}
          <span className="font-semibold">{filtered.length}</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Freight:</span>{' '}
          <span className="font-semibold font-mono-num">₹{totalFreight.toLocaleString('en-IN')}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload} className="ml-auto gap-2 h-8">
          <Download className="h-3.5 w-3.5" /> Download Excel
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold">#</TableHead>
              <TableHead className="text-xs font-semibold">Invoice Number</TableHead>
              <TableHead className="text-xs font-semibold">Transporter</TableHead>
              <TableHead className="text-xs font-semibold">Total Freight (₹)</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold">Comments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No transporter freight records found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r: any, idx: number) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                <TableCell className="text-sm font-medium">{r.invoice_number}</TableCell>
                <TableCell className="text-sm">{r.transporters?.name || '-'}</TableCell>
                <TableCell className="text-sm font-mono-num">₹{(r.total_freight || 0).toLocaleString('en-IN')}</TableCell>
                <TableCell className="text-sm">
                  <Select value={r.status} onValueChange={v => updateStatus.mutate({ id: r.id, status: v })}>
                    <SelectTrigger className="h-7 text-xs w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="hold">Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setCommentDialog({ open: true, id: r.id, comments: r.comments || '' })}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {r.comments ? 'Edit' : 'Add'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add Transporter Dialog */}
      <Dialog open={addTransporterDialog} onOpenChange={setAddTransporterDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Transporter</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Transporter Name</Label>
            <Input value={newTransporterName} onChange={e => setNewTransporterName(e.target.value)} placeholder="Enter name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTransporterDialog(false)}>Cancel</Button>
            <Button onClick={() => addTransporter.mutate(newTransporterName)} disabled={!newTransporterName.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comments Dialog */}
      <Dialog open={commentDialog.open} onOpenChange={o => setCommentDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Comments</DialogTitle></DialogHeader>
          <Textarea
            value={commentDialog.comments}
            onChange={e => setCommentDialog(p => ({ ...p, comments: e.target.value }))}
            placeholder="Add comments..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommentDialog({ open: false, id: '', comments: '' })}>Cancel</Button>
            <Button onClick={() => updateComments.mutate({ id: commentDialog.id, comments: commentDialog.comments })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
