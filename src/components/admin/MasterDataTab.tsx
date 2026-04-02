import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RefreshCw, Plus, Upload, Pencil, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

function CustomerSection() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<any>(null);
  const [editValues, setEditValues] = useState<any>({});

  const { data: customers, isLoading } = useQuery({
    queryKey: ['all_customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('*').order('customer_name');
      if (error) throw error;
      return data;
    },
  });

  const filtered = (customers || []).filter((c: any) =>
    c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.gst_number?.toLowerCase().includes(search.toLowerCase()) ||
    c.reference?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSaveEdit = async () => {
    if (!editItem) return;
    const { error } = await supabase.from('customers').update(editValues).eq('id', editItem.id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success('Customer updated');
    setEditItem(null);
    qc.invalidateQueries({ queryKey: ['all_customers'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete customer "${name}"?`)) return;
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Customer deleted');
    qc.invalidateQueries({ queryKey: ['all_customers'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      if (rows.length === 0) { toast.error('No rows found in file. Ensure headers like "Customer Name" exist.'); e.target.value = ''; return; }
      let count = 0;
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const name = r['Customer Name'] || r['customer_name'] || r['Name'];
        if (!name) { errors.push(`Row ${i + 2}: Missing customer name`); continue; }
        const { error } = await supabase.from('customers').insert({
          customer_name: String(name).trim(),
          gst_number: r['GST Number'] || r['gst_number'] || null,
          reference: r['Reference'] || r['reference'] || null,
          credit_terms: r['Credit Terms'] || r['credit_terms'] || null,
          customer_address: r['Address'] || r['customer_address'] || null,
          customer_type: r['Type'] || r['customer_type'] || 'Trade',
        });
        if (error) { errors.push(`Row ${i + 2} (${String(name).trim()}): ${error.message}`); } else { count++; }
      }
      if (errors.length > 0) {
        toast.error(`${errors.length} row(s) failed:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more` : ''}`, { duration: 10000 });
      }
      if (count > 0) toast.success(`${count} customer(s) imported`);
      qc.invalidateQueries({ queryKey: ['all_customers'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    } catch (err: any) { toast.error(`Upload failed: ${err?.message || 'Could not read the file.'}`, { duration: 8000 }); }
    e.target.value = '';
  };

  const handleDownload = () => {
    const rows = (customers || []).map((c: any) => ({
      'Customer Name': c.customer_name, 'GST Number': c.gst_number || '', 'Reference': c.reference || '',
      'Credit Terms': c.credit_terms || '', 'Address': c.customer_address || '', 'Type': c.customer_type || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    XLSX.writeFile(wb, 'customers.xlsx');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-64 text-xs" />
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelUpload} />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1"><Upload className="h-3.5 w-3.5" /> Import</Button>
        <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1"><Download className="h-3.5 w-3.5" /> Export</Button>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} customer(s)</span>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card max-h-[500px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs">Customer Name</TableHead>
              <TableHead className="text-xs">GST Number</TableHead>
              <TableHead className="text-xs">Reference</TableHead>
              <TableHead className="text-xs">Credit Terms</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No customers.</TableCell></TableRow>}
            {filtered.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">{c.customer_name}</TableCell>
                <TableCell className="text-xs">{c.gst_number || '-'}</TableCell>
                <TableCell className="text-xs">{c.reference || '-'}</TableCell>
                <TableCell className="text-xs">{c.credit_terms || '-'}</TableCell>
                <TableCell className="text-xs">{c.customer_type || '-'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditItem(c); setEditValues({ customer_name: c.customer_name, gst_number: c.gst_number || '', reference: c.reference || '', credit_terms: c.credit_terms || '', customer_address: c.customer_address || '', customer_type: c.customer_type || 'Trade' }); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(c.id, c.customer_name)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {['customer_name', 'gst_number', 'reference', 'credit_terms', 'customer_address', 'customer_type'].map(f => (
              <div key={f}>
                <Label className="text-xs capitalize">{f.replace(/_/g, ' ')}</Label>
                <Input value={editValues[f] || ''} onChange={e => setEditValues((v: any) => ({ ...v, [f]: e.target.value }))} className="h-8 text-xs" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransporterSection() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');

  const { data: transporters, isLoading } = useQuery({
    queryKey: ['all_transporters'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transporters').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const filtered = (transporters || []).filter((t: any) => t.name?.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('transporters').insert({ name: newName.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success('Transporter added');
    setNewName('');
    qc.invalidateQueries({ queryKey: ['all_transporters'] });
    qc.invalidateQueries({ queryKey: ['transporters'] });
  };

  const handleSaveEdit = async () => {
    if (!editItem || !editName.trim()) return;
    const { error } = await supabase.from('transporters').update({ name: editName.trim() }).eq('id', editItem.id);
    if (error) { toast.error('Failed'); return; }
    toast.success('Updated');
    setEditItem(null);
    qc.invalidateQueries({ queryKey: ['all_transporters'] });
    qc.invalidateQueries({ queryKey: ['transporters'] });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete transporter "${name}"?`)) return;
    const { error } = await supabase.from('transporters').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted');
    qc.invalidateQueries({ queryKey: ['all_transporters'] });
    qc.invalidateQueries({ queryKey: ['transporters'] });
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      if (rows.length === 0) { toast.error('No rows found. Ensure headers like "Name" or "Transporter Name" exist.'); e.target.value = ''; return; }
      let count = 0;
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const name = r['Name'] || r['Transporter Name'] || r['name'];
        if (!name) { errors.push(`Row ${i + 2}: Missing transporter name`); continue; }
        const { error } = await supabase.from('transporters').insert({ name: String(name).trim() });
        if (error) { errors.push(`Row ${i + 2} (${String(name).trim()}): ${error.message}`); } else { count++; }
      }
      if (errors.length > 0) {
        toast.error(`${errors.length} row(s) failed:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more` : ''}`, { duration: 10000 });
      }
      if (count > 0) toast.success(`${count} transporter(s) imported`);
      qc.invalidateQueries({ queryKey: ['all_transporters'] });
      qc.invalidateQueries({ queryKey: ['transporters'] });
    } catch (err: any) { toast.error(`Upload failed: ${err?.message || 'Could not read the file.'}`, { duration: 8000 }); }
    e.target.value = '';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-48 text-xs" />
        <Input placeholder="New transporter name" value={newName} onChange={e => setNewName(e.target.value)} className="h-8 w-48 text-xs" onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        <Button size="sm" onClick={handleAdd} className="gap-1 h-8"><Plus className="h-3.5 w-3.5" /> Add</Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelUpload} />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1 h-8"><Upload className="h-3.5 w-3.5" /> Import</Button>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} transporter(s)</span>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card max-h-[400px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs">Transporter Name</TableHead>
              <TableHead className="text-xs">Created</TableHead>
              <TableHead className="text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No transporters.</TableCell></TableRow>}
            {filtered.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs">
                  {editItem?.id === t.id ? (
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-xs w-48" onKeyDown={e => e.key === 'Enter' && handleSaveEdit()} />
                  ) : t.name}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {editItem?.id === t.id ? (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSaveEdit}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditItem(null)}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditItem(t); setEditName(t.name); }}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(t.id, t.name)}><Trash2 className="h-3 w-3" /></Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function MasterDataTab() {
  const qc = useQueryClient();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ['all_customers'] }); qc.invalidateQueries({ queryKey: ['all_transporters'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>
      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="transporters">Transporters</TabsTrigger>
        </TabsList>
        <TabsContent value="customers"><CustomerSection /></TabsContent>
        <TabsContent value="transporters"><TransporterSection /></TabsContent>
      </Tabs>
    </div>
  );
}
