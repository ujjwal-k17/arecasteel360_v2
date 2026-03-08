import { useState, useRef } from 'react';
import { useBatches, useInsertBatches, useUpdateBatch, useDeleteBatch } from '@/hooks/useBatches';
import { useQueryClient } from '@tanstack/react-query';
import { parseExcelFile, generateTemplate } from '@/lib/excel-utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Upload, Download, Edit2, Check, X, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import InventoryFieldSelect from './InventoryFieldSelect';

const DROPDOWN_FIELDS = ['material', 'make', 'coating', 'grade'];

export default function InTransitTab() {
  const { data: batches, isLoading } = useBatches();
  const insertBatches = useInsertBatches();
  const updateBatch = useUpdateBatch();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) { toast.error('No valid rows found'); return; }
      await insertBatches.mutateAsync(rows.map(r => ({
        batch_number: r.batch_number,
        material: r.material || null,
        make: r.make || null,
        thickness: r.thickness || null,
        width: r.width || null,
        length: r.length || null,
        coating: r.coating || null,
        grade: r.grade || null,
        gsm: r.gsm || null,
        colour: r.colour || null,
        gross_weight: r.gross_weight || null,
        net_weight: r.net_weight || null,
        coil_number: r.coil_number || null,
        purchase_date: r.purchase_date || null,
        purchase_from: r.purchase_from || null,
      })));
      toast.success(`${rows.length} batches imported`);
    } catch (err) {
      console.error('Import error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to parse file');
    }
    e.target.value = '';
  };

  const startEdit = (batch: any) => {
    setEditingId(batch.id);
    setEditValues({ ...batch });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await updateBatch.mutateAsync({ id: editingId, ...editValues } as any);
      toast.success('Batch updated');
      setEditingId(null);
    } catch { toast.error('Failed to update'); }
  };

  const toggleStatus = async (batch: any) => {
    const newStatus = batch.status === 'in-transit' ? 'received' : 'in-transit';
    await updateBatch.mutateAsync({ id: batch.id, status: newStatus });
    toast.success(`Status changed to ${newStatus}`);
  };

  const cols = ['Batch No', 'Material', 'Make', 'Thickness', 'Width', 'Length', 'Coating', 'Grade', 'GSM', 'Colour', 'Gross Wt (Kg)', 'Net Wt (Kg)', 'Coil No', 'Purchase Date', 'Purchase From', 'Status', 'Actions'];
  const fields = ['batch_number', 'material', 'make', 'thickness', 'width', 'length', 'coating', 'grade', 'gsm', 'colour', 'gross_weight', 'net_weight', 'coil_number', 'purchase_date', 'purchase_from'];

  const renderEditCell = (field: string) => {
    const val = String((editValues as any)[field] ?? '');
    const material = String((editValues as any).material ?? '');

    if (DROPDOWN_FIELDS.includes(field)) {
      return (
        <InventoryFieldSelect
          field={field}
          value={val}
          material={material}
          onChange={v => setEditValues(prev => {
            const next = { ...prev, [field]: v };
            // Reset dependent fields when material changes
            if (field === 'material') {
              next.coating = '';
              next.grade = '';
            }
            return next;
          })}
          className="h-7 w-32 text-xs"
        />
      );
    }

    return (
      <Input
        className="h-7 w-24 text-xs"
        value={val}
        onChange={e => setEditValues(v => ({ ...v, [field]: e.target.value }))}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['batches'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
        <Button onClick={() => fileRef.current?.click()} className="gap-2">
          <Upload className="h-4 w-4" /> Import Excel
        </Button>
        <Button variant="outline" onClick={generateTemplate} className="gap-2">
          <Download className="h-4 w-4" /> Download Template
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {cols.map(c => <TableHead key={c} className="text-xs font-semibold whitespace-nowrap">{c}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches?.length === 0 && (
                <TableRow><TableCell colSpan={cols.length} className="text-center text-muted-foreground py-8">No batches yet. Import an Excel file to get started.</TableCell></TableRow>
              )}
              {batches?.map(b => (
                <TableRow key={b.id}>
                  {fields.map(f => (
                    <TableCell key={f} className="whitespace-nowrap text-sm">
                      {editingId === b.id ? (
                        renderEditCell(f)
                      ) : (
                        <span className={['gross_weight', 'net_weight', 'thickness', 'width', 'length', 'gsm'].includes(f) ? 'font-mono-num' : ''}>
                          {(b as any)[f] ?? '-'}
                        </span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Badge
                      variant={b.status === 'received' ? 'default' : 'secondary'}
                      className={`cursor-pointer ${b.status === 'received' ? 'bg-success hover:bg-success/90' : 'bg-warning hover:bg-warning/90 text-warning-foreground'}`}
                      onClick={() => toggleStatus(b)}
                    >
                      {b.status === 'received' ? 'Received' : 'In-Transit'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {editingId === b.id ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={saveEdit}><Check className="h-3.5 w-3.5 text-success" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => startEdit(b)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
