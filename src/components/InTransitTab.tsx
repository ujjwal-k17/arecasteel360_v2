import { useState, useRef, useMemo } from 'react';
import { useBatches, useInsertBatches, useUpdateBatch, useDeleteBatch, useBulkDeleteBatches } from '@/hooks/useBatches';
import { useQueryClient } from '@tanstack/react-query';
import { parseExcelFile, generateTemplate } from '@/lib/excel-utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Download, Edit2, Check, X, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import InventoryFieldSelect from './InventoryFieldSelect';
import { isFieldValueValid } from '@/lib/field-validation';
import { MATERIALS, MAKES, COATING_BY_MATERIAL, GRADE_BY_MATERIAL, FORMS } from '@/lib/inventory-options';
import * as XLSX from 'xlsx';
import { differenceInDays, parseISO } from 'date-fns';

const DROPDOWN_FIELDS = ['material', 'make', 'coating', 'grade', 'form'];

export default function InTransitTab() {
  const [statusFilter, setStatusFilter] = useState<string>('in-transit');
  const { data: batches, isLoading } = useBatches(statusFilter);
  const insertBatches = useInsertBatches();
  const updateBatch = useUpdateBatch();
  const deleteBatch = useDeleteBatch();
  const bulkDelete = useBulkDeleteBatches();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const setFilter = (field: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value === '__all__' || !value) delete next[field];
      else next[field] = value;
      return next;
    });
  };

  const filteredBatches = useMemo(() => {
    if (!batches) return [];
    return batches.filter(b => {
      for (const [field, val] of Object.entries(filters)) {
        const bVal = String((b as any)[field] ?? '');
        if (bVal !== val) return false;
      }
      if (dateFrom && b.purchase_date && b.purchase_date < dateFrom) return false;
      if (dateTo && b.purchase_date && b.purchase_date > dateTo) return false;
      if ((dateFrom || dateTo) && !b.purchase_date) return false;
      return true;
    });
  }, [batches, filters, dateFrom, dateTo]);

  const totalNetWeight = useMemo(() => filteredBatches.reduce((s, b) => s + (b.net_weight || 0), 0), [filteredBatches]);

  const uniqueValues = useMemo(() => {
    if (!batches) return {} as Record<string, string[]>;
    const fields = ['material', 'make', 'form', 'coating', 'grade', 'purchase_from'];
    const result: Record<string, string[]> = {};
    fields.forEach(f => {
      const vals = [...new Set(batches.map(b => String((b as any)[f] ?? '')).filter(Boolean))].sort();
      result[f] = vals;
    });
    return result;
  }, [batches]);

  const isReceived = statusFilter === 'received';

  const calcTransitDays = (batch: any): number | null => {
    if (!batch.purchase_date) return null;
    try {
      if (isReceived && batch.updated_at) {
        // For received: updated_at (when moved to received) minus purchase_date
        return differenceInDays(new Date(batch.updated_at), parseISO(batch.purchase_date));
      }
      // For in-transit: today minus purchase_date
      return differenceInDays(new Date(), parseISO(batch.purchase_date));
    } catch { return null; }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredBatches.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBatches.map(b => b.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected batch(es)?`)) return;
    try {
      await bulkDelete.mutateAsync(Array.from(selectedIds));
      toast.success(`${selectedIds.size} batch(es) deleted`);
      setSelectedIds(new Set());
    } catch { toast.error('Failed to delete'); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) { toast.error('No valid rows found'); return; }
      const existingBatchNumbers = new Set((batches || []).map(b => b.batch_number));
      const newRows = rows.filter(r => !existingBatchNumbers.has(r.batch_number));
      const duplicateCount = rows.length - newRows.length;
      if (newRows.length === 0) { toast.info(`All ${rows.length} batches already exist — skipped`); return; }
      await insertBatches.mutateAsync(newRows.map(r => ({
        batch_number: r.batch_number, material: r.material || null, make: r.make || null,
        thickness: r.thickness || null, width: r.width || null,
        length: r.length != null ? String(r.length) : null,
        coating: r.coating || null, grade: r.grade || null, gsm: r.gsm || null,
        gross_weight: r.gross_weight || null, net_weight: r.net_weight || null,
        coil_number: r.coil_number || null, purchase_date: r.purchase_date || null, purchase_from: r.purchase_from || null,
      })));
      toast.success(`${newRows.length} batches imported${duplicateCount > 0 ? `, ${duplicateCount} duplicates skipped` : ''}`);
    } catch (err) {
      console.error('Import error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to parse file');
    }
    e.target.value = '';
  };

  const handleDownloadExcel = () => {
    if (filteredBatches.length === 0) { toast.info('No data to download'); return; }
    const rows = filteredBatches.map(b => ({
      'Batch No': b.batch_number, 'Material': b.material || '', 'Make': b.make || '',
      'Form': (b as any).form || '',
      'Thickness': b.thickness ?? '', 'Width': b.width ?? '', 'Length': b.length ?? '',
      'Coating': b.coating || '', 'Grade': b.grade || '',
      'Gross Wt (Kg)': b.gross_weight ?? '', 'Net Wt (Kg)': b.net_weight ?? '',
      'Coil No': b.coil_number || '', 'Purchase Date': b.purchase_date || '',
      'Purchase From': b.purchase_from || '',
      'Transit Days': calcTransitDays(b) ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'In-Transit');
    XLSX.writeFile(wb, `in_transit_${statusFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Downloaded');
  };

  const startEdit = (batch: any) => { setEditingId(batch.id); setEditValues({ ...batch }); };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const { id: _id, created_at: _ca, updated_at: _ua, ...updateFields } = editValues as any;
      await updateBatch.mutateAsync({ id: editingId, ...updateFields } as any);
      toast.success('Batch updated'); setEditingId(null);
    } catch { toast.error('Failed to update'); }
  };

  const toggleStatus = async (batch: any) => {
    const newStatus = batch.status === 'in-transit' ? 'received' : 'in-transit';
    await updateBatch.mutateAsync({ id: batch.id, status: newStatus });
    toast.success(`Status changed to ${newStatus}`);
  };

  const fields = ['batch_number', 'material', 'make', 'form', 'thickness', 'width', 'length', 'coating', 'grade', 'gross_weight', 'net_weight', 'coil_number', 'purchase_date', 'purchase_from'];
  const filterableFields = ['material', 'make', 'form', 'coating', 'grade', 'purchase_from'];

  const renderEditCell = (field: string) => {
    const val = String((editValues as any)[field] ?? '');
    const material = String((editValues as any).material ?? '');
    if (DROPDOWN_FIELDS.includes(field)) {
      return (
        <InventoryFieldSelect field={field} value={val} material={material}
          onChange={v => setEditValues(prev => {
            const next = { ...prev, [field]: v };
            if (field === 'material') { next.coating = ''; next.grade = ''; }
            return next;
          })}
          className="h-7 w-32 text-xs"
        />
      );
    }
    return (
      <Input className="h-7 w-24 text-xs" value={val}
        onChange={e => { if (isFieldValueValid(field, e.target.value)) setEditValues(v => ({ ...v, [field]: e.target.value })); }}
      />
    );
  };

  const renderColumnHeader = (field: string, label: string) => {
    if (filterableFields.includes(field)) {
      const options = uniqueValues[field] || [];
      return (
        <div className="space-y-1">
          <span className="text-xs font-semibold whitespace-nowrap">{label}</span>
          <Select value={filters[field] || '__all__'} onValueChange={v => setFilter(field, v)}>
            <SelectTrigger className="h-6 text-[10px] w-full min-w-[70px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    }
    return <span className="text-xs font-semibold whitespace-nowrap">{label}</span>;
  };

  const colDefs = [
    { field: 'batch_number', label: 'Batch No' },
    { field: 'material', label: 'Material' },
    { field: 'make', label: 'Make' },
    { field: 'form', label: 'Form' },
    { field: 'thickness', label: 'Thickness' },
    { field: 'width', label: 'Width' },
    { field: 'length', label: 'Length' },
    { field: 'coating', label: 'Coating' },
    { field: 'grade', label: 'Grade' },
    { field: 'gross_weight', label: 'Gross Wt (Kg)' },
    { field: 'net_weight', label: 'Net Wt (Kg)' },
    { field: 'coil_number', label: 'Coil No' },
    { field: 'purchase_date', label: 'Purchase Date' },
    { field: 'purchase_from', label: 'Purchase From' },
  ];

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 border rounded-md overflow-hidden">
          <Button variant={statusFilter === 'in-transit' ? 'default' : 'ghost'} size="sm" className="rounded-none text-xs"
            onClick={() => { setStatusFilter('in-transit'); setSelectedIds(new Set()); }}>In-Transit</Button>
          <Button variant={statusFilter === 'received' ? 'default' : 'ghost'} size="sm" className="rounded-none text-xs"
            onClick={() => { setStatusFilter('received'); setSelectedIds(new Set()); }}>Received</Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['batches'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        {!isReceived && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
            <Button onClick={() => fileRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" /> Import Excel</Button>
            <Button variant="outline" onClick={generateTemplate} className="gap-2"><Download className="h-4 w-4" /> Download Template</Button>
          </>
        )}
        {!isReceived && selectedIds.size > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-2">
            <Trash2 className="h-4 w-4" /> Delete Selected ({selectedIds.size})
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Input type="date" className="h-8 w-36 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-36 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2 h-8">
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm">
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Net Weight:</span>{' '}
          <span className="font-semibold font-mono-num">{totalNetWeight.toFixed(2)} Kg</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Batches:</span>{' '}
          <span className="font-semibold">{filteredBatches.length}</span>
        </div>
        {Object.keys(filters).length > 0 && (
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setFilters({})}>
            <X className="h-3 w-3 mr-1" /> Clear Filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {!isReceived && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredBatches.length > 0 && selectedIds.size === filteredBatches.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                )}
                {colDefs.map(c => (
                  <TableHead key={c.field}>{renderColumnHeader(c.field, c.label)}</TableHead>
                ))}
                <TableHead><span className="text-xs font-semibold whitespace-nowrap">Transit Days</span></TableHead>
                <TableHead><span className="text-xs font-semibold whitespace-nowrap">Status</span></TableHead>
                {isReceived && <TableHead><span className="text-xs font-semibold whitespace-nowrap">Received Date</span></TableHead>}
                {!isReceived && <TableHead><span className="text-xs font-semibold whitespace-nowrap">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBatches.length === 0 && (
                <TableRow><TableCell colSpan={colDefs.length + (isReceived ? 2 : 4)} className="text-center text-muted-foreground py-8">No batches found.</TableCell></TableRow>
              )}
              {filteredBatches.map(b => {
                const transitDays = calcTransitDays(b);
                return (
                  <TableRow key={b.id} className={selectedIds.has(b.id) ? 'bg-primary/5' : ''}>
                    {!isReceived && (
                      <TableCell>
                        <Checkbox checked={selectedIds.has(b.id)} onCheckedChange={() => toggleSelect(b.id)} />
                      </TableCell>
                    )}
                    {fields.map(f => (
                      <TableCell key={f} className="whitespace-nowrap text-sm">
                        {editingId === b.id ? renderEditCell(f) : (
                          <span className={['gross_weight', 'net_weight', 'thickness', 'width', 'length', 'gsm'].includes(f) ? 'font-mono-num' : ''}>
                            {(b as any)[f] ?? '-'}
                          </span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-sm font-mono-num">
                      {transitDays !== null ? (
                        <Badge variant={transitDays > 7 ? 'destructive' : transitDays > 3 ? 'secondary' : 'default'} className="text-xs">
                          {transitDays}d
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={b.status === 'received' ? 'default' : 'secondary'}
                        className={`${!isReceived ? 'cursor-pointer' : ''} ${b.status === 'received' ? 'bg-success hover:bg-success/90' : 'bg-warning hover:bg-warning/90 text-warning-foreground'}`}
                        onClick={() => !isReceived && toggleStatus(b)}
                      >
                        {b.status === 'received' ? 'Received' : 'In-Transit'}
                      </Badge>
                    </TableCell>
                    {isReceived && (
                      <TableCell className="whitespace-nowrap text-sm">
                        {b.updated_at ? new Date(b.updated_at).toLocaleDateString('en-IN') : '-'}
                      </TableCell>
                    )}
                      <TableCell>
                        {editingId === b.id ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={saveEdit}><Check className="h-3.5 w-3.5 text-success" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(b)}><Edit2 className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={async () => { if (confirm(`Delete batch ${b.batch_number}?`)) { try { await deleteBatch.mutateAsync(b.id); toast.success('Batch deleted'); } catch { toast.error('Failed to delete'); } } }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
