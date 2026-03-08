import { useState } from 'react';
import { useAllBatches, useAllActions, getSKUKey, calcBalanceQty, calcUsableBalanceQty, useInsertBatches, useDeleteBatch, useBulkDeleteBatches, type Batch, type InventoryAction } from '@/hooks/useBatches';
import { useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import BatchActionDialog from './BatchActionDialog';
import InventoryFieldSelect from './InventoryFieldSelect';
import { isFieldValueValid } from '@/lib/field-validation';

interface SKUGroup {
  key: string;
  batches: Batch[];
  material: string | null;
  make: string | null;
  thickness: number | null;
  width: number | null;
  length: string | null;
  length: number | null;
  coating: string | null;
  grade: string | null;
  totalNetWeight: number;
  totalBalanceQty: number;
}

const DROPDOWN_FIELDS = ['material', 'make', 'coating', 'grade'];
const NUMERIC_FIELDS = ['thickness', 'width', 'length', 'gross_weight', 'net_weight', 'gsm'];

const REQUIRED_IMPORT_FIELDS: (keyof Batch)[] = [
  'batch_number', 'material', 'make', 'thickness', 'width', 'length',
  'coating', 'grade', 'gross_weight', 'net_weight', 'coil_number',
  'purchase_date', 'purchase_from',
];

function isBatchComplete(b: Batch): boolean {
  return REQUIRED_IMPORT_FIELDS.every(f => {
    const v = b[f];
    return v !== null && v !== undefined && v !== '' && v !== 0;
  });
}

function getMissingFields(b: Batch): string[] {
  return REQUIRED_IMPORT_FIELDS
    .filter(f => { const v = b[f]; return v === null || v === undefined || v === '' || v === 0; })
    .map(f => String(f).replace(/_/g, ' '));
}

export default function PhysicalInventoryTab() {
  const { data: batches } = useAllBatches();
  const { data: actions } = useAllActions();
  const queryClient = useQueryClient();
  const insertBatches = useInsertBatches();
  const deleteBatch = useDeleteBatch();
  const bulkDelete = useBulkDeleteBatches();
  const [expandedSKU, setExpandedSKU] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMode, setAddMode] = useState<'new' | 'import' | null>(null);
  const [actionBatch, setActionBatch] = useState<Batch | null>(null);
  const [actionType, setActionType] = useState<'sales' | 'defective' | 'scrap' | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [importSearch, setImportSearch] = useState('');
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());

  const [newBatch, setNewBatch] = useState({
    batch_number: '', material: '', make: '', thickness: '', width: '', length: '',
    coating: '', grade: '', gross_weight: '', net_weight: '', gsm: '', colour: '',
    coil_number: '', purchase_date: '', purchase_from: '',
  });

  const allActions = (actions as InventoryAction[]) || [];
  const receivedBatches = (batches || []).filter(b => b.status === 'received');
  const inTransitBatches = (batches || []).filter(b => b.status === 'in-transit');

  // Group by SKU
  const skuGroups: SKUGroup[] = [];
  const skuMap = new Map<string, Batch[]>();
  receivedBatches.forEach(b => {
    const key = getSKUKey(b);
    if (!skuMap.has(key)) skuMap.set(key, []);
    skuMap.get(key)!.push(b);
  });

  skuMap.forEach((batchList, key) => {
    const first = batchList[0];
    const totalNetWeight = batchList.reduce((s, b) => s + (b.net_weight || 0), 0);
    const totalBalanceQty = batchList.reduce((s, b) => s + calcBalanceQty(b, allActions), 0);
    skuGroups.push({
      key, batches: batchList, material: first.material, make: first.make,
      thickness: first.thickness, width: first.width, length: first.length,
      coating: first.coating, grade: first.grade, totalNetWeight, totalBalanceQty,
    });
  });

  const toggleBatchSelect = (id: string) => {
    setSelectedBatchIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllInSKU = (group: SKUGroup) => {
    const allSelected = group.batches.every(b => selectedBatchIds.has(b.id));
    setSelectedBatchIds(prev => {
      const next = new Set(prev);
      group.batches.forEach(b => {
        if (allSelected) next.delete(b.id); else next.add(b.id);
      });
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedBatchIds.size === 0) return;
    if (!confirm(`Delete ${selectedBatchIds.size} selected batch(es)?`)) return;
    try {
      await bulkDelete.mutateAsync(Array.from(selectedBatchIds));
      toast.success(`${selectedBatchIds.size} batch(es) deleted`);
      setSelectedBatchIds(new Set());
    } catch { toast.error('Failed to delete'); }
  };

  const existingBatchNumbers = new Set((batches || []).filter(b => b.status === 'received').map(b => b.batch_number));

  const handleAddNew = async () => {
    if (existingBatchNumbers.has(newBatch.batch_number)) {
      toast.error(`Batch number "${newBatch.batch_number}" already exists`);
      return;
    }
    try {
      await insertBatches.mutateAsync([{
        batch_number: newBatch.batch_number,
        material: newBatch.material || null,
        make: newBatch.make || null,
        thickness: newBatch.thickness ? Number(newBatch.thickness) : null,
        width: newBatch.width ? Number(newBatch.width) : null,
        length: newBatch.length ? Number(newBatch.length) : null,
        coating: newBatch.coating || null,
        grade: newBatch.grade || null,
        gsm: newBatch.gsm ? Number(newBatch.gsm) : null,
        colour: newBatch.colour || null,
        gross_weight: newBatch.gross_weight ? Number(newBatch.gross_weight) : null,
        net_weight: newBatch.net_weight ? Number(newBatch.net_weight) : null,
        coil_number: newBatch.coil_number || null,
        purchase_date: newBatch.purchase_date || null,
        purchase_from: newBatch.purchase_from || null,
        status: 'received',
      }]);
      toast.success('Batch added');
      setShowAddDialog(false);
      setAddMode(null);
      setNewBatch({ batch_number: '', material: '', make: '', thickness: '', width: '', length: '', coating: '', grade: '', gross_weight: '', net_weight: '', gsm: '', colour: '', coil_number: '', purchase_date: '', purchase_from: '' });
    } catch { toast.error('Failed to add batch'); }
  };

  const handleImportFromTransit = async (ids: string[]) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase
        .from('batches').update({ status: 'received' }).in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} batch(es) moved to physical inventory`);
      setShowAddDialog(false);
      setAddMode(null);
      setSelectedImportIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    } catch { toast.error('Failed'); }
  };

  const toggleImportSelection = (id: string) => {
    setSelectedImportIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const updateNewBatch = (key: string, value: string) => {
    setNewBatch(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'material') {
        next.coating = '';
        next.grade = '';
      }
      return next;
    });
  };

  const renderNewBatchField = (key: string, val: string) => {
    if (DROPDOWN_FIELDS.includes(key)) {
      return (
        <InventoryFieldSelect
          field={key}
          value={val}
          material={newBatch.material}
          onChange={v => updateNewBatch(key, v)}
          className="col-span-2 h-8 text-sm"
          placeholder={`Select ${key.replace(/_/g, ' ')}`}
        />
      );
    }

    return (
      <Input
        className="col-span-2 h-8 text-sm"
        value={val}
        onChange={e => {
          const newVal = e.target.value;
          if (isFieldValueValid(key, newVal)) {
            updateNewBatch(key, newVal);
          }
        }}
        type={key === 'purchase_date' ? 'date' : 'text'}
      />
    );
  };

  const skuCols = ['', 'Material', 'Make', 'Thickness', 'Width', 'Length', 'Coating', 'Grade', 'Physical Inv (Kg)', 'Total Inv (Kg)'];
  const batchCols = ['', 'Material', 'Make', 'Batch No', 'Thickness', 'Width', 'Coating', 'Grade', 'Gross Wt', 'Net Wt', 'Coil No', 'Purchase Date', 'Purchase From', 'Balance Qty', 'Usable Bal Qty', 'Action'];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['batches'] }); queryClient.invalidateQueries({ queryKey: ['inventory_actions'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button onClick={() => { setShowAddDialog(true); setAddMode(null); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add New Item
        </Button>
        {selectedBatchIds.size > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-2">
            <Trash2 className="h-4 w-4" /> Delete Selected ({selectedBatchIds.size})
          </Button>
        )}
      </div>

      {/* SKU Summary */}
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {skuCols.map(c => <TableHead key={c} className="text-xs font-semibold whitespace-nowrap">{c}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {skuGroups.length === 0 && (
              <TableRow><TableCell colSpan={skuCols.length} className="text-center text-muted-foreground py-8">No inventory items. Add batches to get started.</TableCell></TableRow>
            )}
            {skuGroups.map(g => (
              <>
                <TableRow key={g.key} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedSKU(expandedSKU === g.key ? null : g.key)}>
                  <TableCell>{expandedSKU === g.key ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                  <TableCell className="text-sm">{g.material || '-'}</TableCell>
                  <TableCell className="text-sm">{g.make || '-'}</TableCell>
                  <TableCell className="text-sm font-mono-num">{g.thickness ?? '-'}</TableCell>
                  <TableCell className="text-sm font-mono-num">{g.width ?? '-'}</TableCell>
                  <TableCell className="text-sm font-mono-num">{g.length ?? '-'}</TableCell>
                  <TableCell className="text-sm">{g.coating || '-'}</TableCell>
                  <TableCell className="text-sm">{g.grade || '-'}</TableCell>
                  <TableCell className="text-sm font-mono-num font-semibold">{g.totalNetWeight.toFixed(2)}</TableCell>
                  <TableCell className="text-sm font-mono-num font-semibold">{g.totalBalanceQty.toFixed(2)}</TableCell>
                </TableRow>
                {expandedSKU === g.key && (
                  <TableRow key={`${g.key}-detail`}>
                    <TableCell colSpan={skuCols.length} className="p-0">
                      <div className="bg-muted/20 p-3">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">
                                <Checkbox
                                  checked={g.batches.length > 0 && g.batches.every(b => selectedBatchIds.has(b.id))}
                                  onCheckedChange={() => toggleSelectAllInSKU(g)}
                                />
                              </TableHead>
                              {batchCols.slice(1).map(c => <TableHead key={c} className="text-xs font-semibold whitespace-nowrap">{c}</TableHead>)}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {g.batches.map(b => (
                              <TableRow key={b.id} className={selectedBatchIds.has(b.id) ? 'bg-primary/5' : ''}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedBatchIds.has(b.id)}
                                    onCheckedChange={() => toggleBatchSelect(b.id)}
                                  />
                                </TableCell>
                                <TableCell className="text-sm">{b.material || '-'}</TableCell>
                                <TableCell className="text-sm">{b.make || '-'}</TableCell>
                                <TableCell className="text-sm font-semibold">{b.batch_number}</TableCell>
                                <TableCell className="text-sm font-mono-num">{b.thickness ?? '-'}</TableCell>
                                <TableCell className="text-sm font-mono-num">{b.width ?? '-'}</TableCell>
                                <TableCell className="text-sm">{b.coating || '-'}</TableCell>
                                <TableCell className="text-sm">{b.grade || '-'}</TableCell>
                                <TableCell className="text-sm font-mono-num">{b.gross_weight ?? '-'}</TableCell>
                                <TableCell className="text-sm font-mono-num">{b.net_weight ?? '-'}</TableCell>
                                <TableCell className="text-sm">{b.coil_number || '-'}</TableCell>
                                <TableCell className="text-sm">{b.purchase_date || '-'}</TableCell>
                                <TableCell className="text-sm">{b.purchase_from || '-'}</TableCell>
                                <TableCell className="text-sm font-mono-num font-semibold">{calcBalanceQty(b, allActions).toFixed(2)}</TableCell>
                                <TableCell className="text-sm font-mono-num font-semibold">{calcUsableBalanceQty(b, allActions).toFixed(2)}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setActionBatch(b); setActionType('sales'); }}>Sales</Button>
                                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setActionBatch(b); setActionType('defective'); }}>Defective</Button>
                                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setActionBatch(b); setActionType('scrap'); }}>Scrap</Button>
                                    <Button size="sm" variant="ghost" className="text-xs h-7" onClick={async (e) => { e.stopPropagation(); if (confirm(`Delete batch ${b.batch_number}?`)) { try { await deleteBatch.mutateAsync(b.id); toast.success('Batch deleted'); } catch { toast.error('Failed to delete'); } } }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Item</DialogTitle>
          </DialogHeader>
          {!addMode ? (
            <div className="flex flex-col gap-3">
              <Button variant="outline" onClick={() => setAddMode('import')}>Import from In-Transit Material</Button>
              <Button variant="outline" onClick={() => setAddMode('new')}>Input New Batch</Button>
            </div>
          ) : addMode === 'import' ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Select batches to move to physical inventory. Only batches with all required fields filled can be imported.</p>
              <Input placeholder="Search batch number..." value={importSearch} onChange={e => setImportSearch(e.target.value)} className="h-8 text-sm" />
              {inTransitBatches.length === 0 && <p className="text-sm text-muted-foreground">No in-transit batches available.</p>}
              <div className="max-h-60 overflow-y-auto space-y-1">
              {inTransitBatches.filter(b => !importSearch || b.batch_number.toLowerCase().includes(importSearch.toLowerCase())).map(b => {
                const complete = isBatchComplete(b);
                const missing = getMissingFields(b);
                const isDuplicate = existingBatchNumbers.has(b.batch_number);
                return (
                  <div
                    key={b.id}
                    className={`flex items-center gap-2 p-2 border rounded ${
                      isDuplicate ? 'opacity-50 cursor-not-allowed border-destructive/30' :
                      !complete ? 'opacity-70 cursor-not-allowed border-warning/30' :
                      selectedImportIds.has(b.id) ? 'bg-primary/10 border-primary cursor-pointer' : 'hover:bg-muted/30 cursor-pointer'
                    }`}
                    onClick={() => { if (complete && !isDuplicate) toggleImportSelection(b.id); }}
                  >
                    <input type="checkbox" checked={selectedImportIds.has(b.id)} readOnly className="accent-primary" disabled={!complete || isDuplicate} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{b.batch_number} — {b.material} {b.make}</span>
                      {isDuplicate && <p className="text-xs text-destructive">Duplicate — already in inventory</p>}
                      {!complete && !isDuplicate && <p className="text-xs text-warning">Missing: {missing.join(', ')}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono-num">{b.net_weight} Kg</span>
                  </div>
                );
              })}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Button variant="ghost" onClick={() => { setAddMode(null); setSelectedImportIds(new Set()); setImportSearch(''); }}>← Back</Button>
                <Button disabled={selectedImportIds.size === 0} onClick={() => handleImportFromTransit(Array.from(selectedImportIds))}>
                  Import {selectedImportIds.size > 0 ? `(${selectedImportIds.size})` : ''}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(newBatch).map(([key, val]) => (
                <div key={key} className="grid grid-cols-3 items-center gap-2">
                  <Label className="text-xs capitalize">{key.replace(/_/g, ' ')}</Label>
                  {renderNewBatchField(key, val)}
                </div>
              ))}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAddMode(null)}>← Back</Button>
                <Button onClick={handleAddNew} disabled={!newBatch.batch_number}>Add Batch</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      {actionBatch && actionType && (
        <BatchActionDialog
          batch={actionBatch}
          actionType={actionType}
          open={!!actionBatch}
          onClose={() => { setActionBatch(null); setActionType(null); }}
        />
      )}
    </div>
  );
}
