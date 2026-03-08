import { useState, useMemo } from 'react';
import { useAllBatches, useAllActions, useUpdateBatch, getSKUKey, calcBalanceQty, calcUsableBalanceQty, useInsertBatches, type Batch, type InventoryAction } from '@/hooks/useBatches';
import { useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Eye, Plus, RefreshCw, Undo2, Download } from 'lucide-react';
import { toast } from 'sonner';
import BatchActionDialog from './BatchActionDialog';
import InventoryFieldSelect from './InventoryFieldSelect';
import { isFieldValueValid } from '@/lib/field-validation';
import * as XLSX from 'xlsx';

interface SKUGroup {
  key: string;
  batches: Batch[];
  material: string | null;
  make: string | null;
  thickness: number | null;
  width: number | null;
  length: string | null;
  coating: string | null;
  grade: string | null;
  totalNetWeight: number;
  totalBalanceQty: number;
  totalUsableQty: number;
}

const DROPDOWN_FIELDS = ['material', 'make', 'coating', 'grade', 'form'];
const NUMERIC_FIELDS = ['thickness', 'width', 'length', 'gross_weight', 'net_weight'];

const REQUIRED_IMPORT_FIELDS: (keyof Batch)[] = [
  'batch_number', 'material', 'make', 'thickness', 'width',
  'coating', 'grade', 'gross_weight', 'net_weight', 'coil_number',
  'purchase_date', 'purchase_from',
];

function isBatchComplete(b: Batch): boolean {
  return REQUIRED_IMPORT_FIELDS.every(f => {
    const v = b[f]; return v !== null && v !== undefined && v !== '' && v !== 0;
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
  const updateBatch = useUpdateBatch();
  const [expandedSKU, setExpandedSKU] = useState<string | null>(null);
  const [expandedBatchActions, setExpandedBatchActions] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMode, setAddMode] = useState<'new' | 'import' | null>(null);
  const [actionBatch, setActionBatch] = useState<Batch | null>(null);
  const [actionType, setActionType] = useState<'sales' | 'defective' | 'scrap' | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [importSearch, setImportSearch] = useState('');
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());

  const [filters, setFilters] = useState<Record<string, string>>({});

  const setFilter = (field: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value === '__all__' || !value) delete next[field];
      else next[field] = value;
      return next;
    });
  };

  const [newBatch, setNewBatch] = useState({
    batch_number: '', material: '', make: '', form: '', thickness: '', width: '', length: '',
    coating: '', grade: '', gross_weight: '', net_weight: '',
    coil_number: '', purchase_date: '', purchase_from: '',
  });

  const allActions = (actions as InventoryAction[]) || [];
  const receivedBatches = (batches || []).filter(b => b.status === 'received');
  const inTransitBatches = (batches || []).filter(b => b.status === 'in-transit');

  const uniqueValues = useMemo(() => {
    const fields = ['material', 'make', 'form', 'thickness', 'width', 'coating', 'grade'];
    const result: Record<string, string[]> = {};
    fields.forEach(f => {
      const vals = [...new Set(receivedBatches.map(b => String((b as any)[f] ?? '')).filter(Boolean))].sort();
      result[f] = vals;
    });
    return result;
  }, [receivedBatches]);

  const filteredBatches = useMemo(() => {
    return receivedBatches.filter(b => {
      for (const [field, val] of Object.entries(filters)) {
        if (String((b as any)[field] ?? '') !== val) return false;
      }
      return true;
    });
  }, [receivedBatches, filters]);

  const skuGroups: SKUGroup[] = useMemo(() => {
    const skuMap = new Map<string, Batch[]>();
    filteredBatches.forEach(b => {
      const key = getSKUKey(b);
      if (!skuMap.has(key)) skuMap.set(key, []);
      skuMap.get(key)!.push(b);
    });
    const groups: SKUGroup[] = [];
    skuMap.forEach((batchList, key) => {
      const first = batchList[0];
      const totalNetWeight = batchList.reduce((s, b) => s + (b.net_weight || 0), 0);
      const totalBalanceQty = batchList.reduce((s, b) => s + calcBalanceQty(b, allActions), 0);
      const totalUsableQty = batchList.reduce((s, b) => s + calcUsableBalanceQty(b, allActions), 0);
      groups.push({
        key, batches: batchList, material: first.material, make: first.make,
        thickness: first.thickness, width: first.width, length: first.length,
        coating: first.coating, grade: first.grade,
        totalNetWeight, totalBalanceQty, totalUsableQty,
      });
    });
    return groups;
  }, [filteredBatches, allActions]);

  const grandTotalBalanceQty = useMemo(() => filteredBatches.reduce((s, b) => s + calcBalanceQty(b, allActions), 0), [filteredBatches, allActions]);
  const grandTotalUsableQty = useMemo(() => filteredBatches.reduce((s, b) => s + calcUsableBalanceQty(b, allActions), 0), [filteredBatches, allActions]);

  const toggleBatchSelect = (id: string) => {
    setSelectedBatchIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleSelectAllInSKU = (group: SKUGroup) => {
    const allSelected = group.batches.every(b => selectedBatchIds.has(b.id));
    setSelectedBatchIds(prev => {
      const next = new Set(prev);
      group.batches.forEach(b => { if (allSelected) next.delete(b.id); else next.add(b.id); });
      return next;
    });
  };

  const handleRevertToTransit = async (id: string, batchNumber: string) => {
    if (!confirm(`Move batch ${batchNumber} back to In-Transit?`)) return;
    try {
      await updateBatch.mutateAsync({ id, status: 'in-transit' });
      toast.success(`Batch ${batchNumber} moved back to In-Transit`);
      setSelectedBatchIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    } catch { toast.error('Failed to move batch'); }
  };

  const handleBulkRevert = async () => {
    if (selectedBatchIds.size === 0) return;
    const idsWithActions = Array.from(selectedBatchIds).filter(id => allActions.some(a => a.batch_id === id));
    if (idsWithActions.length > 0) { toast.error('Cannot move batches with recorded actions back to In-Transit'); return; }
    if (!confirm(`Move ${selectedBatchIds.size} selected batch(es) back to In-Transit?`)) return;
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase.from('batches').update({ status: 'in-transit' }).in('id', Array.from(selectedBatchIds));
      if (error) throw error;
      toast.success(`${selectedBatchIds.size} batch(es) moved back to In-Transit`);
      setSelectedBatchIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    } catch { toast.error('Failed to move batches'); }
  };

  const existingBatchNumbers = new Set((batches || []).filter(b => b.status === 'received').map(b => b.batch_number));

  const handleAddNew = async () => {
    if (existingBatchNumbers.has(newBatch.batch_number)) { toast.error(`Batch number "${newBatch.batch_number}" already exists`); return; }
    try {
      await insertBatches.mutateAsync([{
        batch_number: newBatch.batch_number, material: newBatch.material || null, make: newBatch.make || null,
        thickness: newBatch.thickness ? Number(newBatch.thickness) : null, width: newBatch.width ? Number(newBatch.width) : null,
        length: newBatch.length || null, coating: newBatch.coating || null, grade: newBatch.grade || null,
        gross_weight: newBatch.gross_weight ? Number(newBatch.gross_weight) : null,
        net_weight: newBatch.net_weight ? Number(newBatch.net_weight) : null,
        coil_number: newBatch.coil_number || null, purchase_date: newBatch.purchase_date || null,
        purchase_from: newBatch.purchase_from || null, status: 'received',
      }]);
      toast.success('Batch added'); setShowAddDialog(false); setAddMode(null);
      setNewBatch({ batch_number: '', material: '', make: '', thickness: '', width: '', length: '', coating: '', grade: '', gross_weight: '', net_weight: '', coil_number: '', purchase_date: '', purchase_from: '' });
    } catch { toast.error('Failed to add batch'); }
  };

  const handleImportFromTransit = async (ids: string[]) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase.from('batches').update({ status: 'received' }).in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} batch(es) moved to physical inventory`);
      setShowAddDialog(false); setAddMode(null); setSelectedImportIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    } catch { toast.error('Failed'); }
  };

  const toggleImportSelection = (id: string) => {
    setSelectedImportIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const updateNewBatch = (key: string, value: string) => {
    setNewBatch(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'material') { next.coating = ''; next.grade = ''; }
      return next;
    });
  };

  const renderNewBatchField = (key: string, val: string) => {
    if (DROPDOWN_FIELDS.includes(key)) {
      return <InventoryFieldSelect field={key} value={val} material={newBatch.material} onChange={v => updateNewBatch(key, v)} className="col-span-2 h-8 text-sm" placeholder={`Select ${key.replace(/_/g, ' ')}`} />;
    }
    return <Input className="col-span-2 h-8 text-sm" value={val} onChange={e => { if (isFieldValueValid(key, e.target.value)) updateNewBatch(key, e.target.value); }} type={key === 'purchase_date' ? 'date' : 'text'} />;
  };

  const handleDownloadPhysicalExcel = () => {
    if (filteredBatches.length === 0) { toast.info('No data to download'); return; }
    const rows = filteredBatches.map(b => {
      const batchActions = allActions.filter(a => a.batch_id === b.id);
      const salesWt = batchActions.filter(a => a.action_type === 'sales').reduce((s, a) => s + (a.net_weight || 0), 0);
      const defectiveWt = batchActions.filter(a => a.action_type === 'defective').reduce((s, a) => s + (a.net_weight || 0), 0);
      const scrapWt = batchActions.filter(a => a.action_type === 'scrap').reduce((s, a) => s + (a.net_weight || 0), 0);
      return {
        'Batch No': b.batch_number, 'Material': b.material || '', 'Make': b.make || '',
        'Thickness': b.thickness ?? '', 'Width': b.width ?? '', 'Length': b.length ?? '',
        'Coating': b.coating || '', 'Grade': b.grade || '',
        'Gross Wt (Kg)': b.gross_weight ?? '', 'Net Wt (Kg)': b.net_weight ?? '',
        'Coil No': b.coil_number || '', 'Purchase Date': b.purchase_date || '', 'Purchase From': b.purchase_from || '',
        'Sales (Kg)': salesWt || '', 'Defective (Kg)': defectiveWt || '', 'Scrap (Kg)': scrapWt || '',
        'Balance Qty': calcBalanceQty(b, allActions).toFixed(2),
        'Usable Qty': calcUsableBalanceQty(b, allActions).toFixed(2),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Physical Inventory');
    XLSX.writeFile(wb, `physical_inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Downloaded');
  };

  const filterFields = ['material', 'make', 'thickness', 'width', 'coating', 'grade'];
  const skuCols = ['', 'Material', 'Make', 'Thickness', 'Width', 'Length', 'Coating', 'Grade', 'Physical Inv (Kg)', 'Usable Qty (Kg)', 'Total Inv (Kg)'];
  const batchCols = ['', 'Material', 'Make', 'Batch No', 'Thickness', 'Width', 'Coating', 'Grade', 'Gross Wt', 'Net Wt', 'Coil No', 'Purchase Date', 'Purchase From', 'Balance Qty', 'Usable Bal Qty', 'Action'];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['batches'] }); queryClient.invalidateQueries({ queryKey: ['inventory_actions'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button onClick={() => { setShowAddDialog(true); setAddMode(null); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add New Item
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownloadPhysicalExcel} className="gap-2">
          <Download className="h-4 w-4" /> Download Excel
        </Button>
        {selectedBatchIds.size > 0 && (
          <Button variant="secondary" size="sm" onClick={handleBulkRevert} className="gap-2">
            <Undo2 className="h-4 w-4" /> Move to In-Transit ({selectedBatchIds.size})
          </Button>
        )}
      </div>

      {/* Totals */}
      <div className="flex items-center gap-4 text-sm">
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Balance Qty:</span>{' '}
          <span className="font-semibold font-mono-num">{grandTotalBalanceQty.toFixed(2)} Kg</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Usable Qty:</span>{' '}
          <span className="font-semibold font-mono-num">{grandTotalUsableQty.toFixed(2)} Kg</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {filterFields.map(f => (
          <Select key={f} value={filters[f] || '__all__'} onValueChange={v => setFilter(f, v)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder={f.charAt(0).toUpperCase() + f.slice(1)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All {f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>
              {(uniqueValues[f] || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {Object.keys(filters).length > 0 && (
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => setFilters({})}>Clear Filters</Button>
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
                  <TableCell className="text-sm font-mono-num font-semibold">{g.totalUsableQty.toFixed(2)}</TableCell>
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
                                <Checkbox checked={g.batches.length > 0 && g.batches.every(b => selectedBatchIds.has(b.id))} onCheckedChange={() => toggleSelectAllInSKU(g)} />
                              </TableHead>
                              {batchCols.slice(1).map(c => <TableHead key={c} className="text-xs font-semibold whitespace-nowrap">{c}</TableHead>)}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {g.batches.map(b => {
                              const batchActions = allActions.filter(a => a.batch_id === b.id);
                              const isExpanded = expandedBatchActions === b.id;
                              return (
                                <>
                                  <TableRow key={b.id} className={selectedBatchIds.has(b.id) ? 'bg-primary/5' : ''}>
                                    <TableCell><Checkbox checked={selectedBatchIds.has(b.id)} onCheckedChange={() => toggleBatchSelect(b.id)} /></TableCell>
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
                                        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setExpandedBatchActions(isExpanded ? null : b.id); }}><Eye className="h-3.5 w-3.5" /></Button>
                                        {batchActions.length === 0 && (
                                          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); handleRevertToTransit(b.id, b.batch_number); }}><Undo2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                  {isExpanded && batchActions.length > 0 && (
                                    <TableRow key={`${b.id}-actions`}>
                                      <TableCell colSpan={batchCols.length} className="p-0">
                                        <div className="bg-muted/10 border-t border-b px-8 py-2">
                                          <p className="text-xs font-semibold text-muted-foreground mb-1">Actions for {b.batch_number}</p>
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead className="text-xs">Type</TableHead>
                                                <TableHead className="text-xs">Net Wt (Kg)</TableHead>
                                                <TableHead className="text-xs">Gross Wt (Kg)</TableHead>
                                                <TableHead className="text-xs">Order ID</TableHead>
                                                <TableHead className="text-xs">Invoice</TableHead>
                                                <TableHead className="text-xs">Date</TableHead>
                                                <TableHead className="text-xs">Detail</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {batchActions.map(a => (
                                                <TableRow key={a.id}>
                                                  <TableCell className="text-xs capitalize">{a.action_type}</TableCell>
                                                  <TableCell className="text-xs font-mono-num">{a.net_weight ?? '-'}</TableCell>
                                                  <TableCell className="text-xs font-mono-num">{a.gross_weight ?? '-'}</TableCell>
                                                  <TableCell className="text-xs">{a.order_id || '-'}</TableCell>
                                                  <TableCell className="text-xs">{a.invoice_number || '-'}</TableCell>
                                                  <TableCell className="text-xs">{a.sales_date || '-'}</TableCell>
                                                  <TableCell className="text-xs">{a.defect_type || a.scrap_type || '-'}</TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                  {isExpanded && batchActions.length === 0 && (
                                    <TableRow key={`${b.id}-no-actions`}>
                                      <TableCell colSpan={batchCols.length} className="text-center text-xs text-muted-foreground py-2">No actions recorded for this batch.</TableCell>
                                    </TableRow>
                                  )}
                                </>
                              );
                            })}
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
          <DialogHeader><DialogTitle>Add New Item</DialogTitle></DialogHeader>
          {!addMode ? (
            <div className="flex flex-col gap-3">
              <Button variant="outline" onClick={() => setAddMode('import')}>Import from In-Transit Material</Button>
              <Button variant="outline" onClick={() => setAddMode('new')}>Input New Batch</Button>
            </div>
          ) : addMode === 'import' ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Select batches to move to physical inventory.</p>
              <Input placeholder="Search batch number..." value={importSearch} onChange={e => setImportSearch(e.target.value)} className="h-8 text-sm" />
              {inTransitBatches.length === 0 && <p className="text-sm text-muted-foreground">No in-transit batches available.</p>}
              <div className="max-h-60 overflow-y-auto space-y-1">
                {inTransitBatches.filter(b => !importSearch || b.batch_number.toLowerCase().includes(importSearch.toLowerCase())).map(b => {
                  const complete = isBatchComplete(b);
                  const missing = getMissingFields(b);
                  const isDuplicate = existingBatchNumbers.has(b.batch_number);
                  return (
                    <div key={b.id}
                      className={`flex items-center gap-2 p-2 border rounded ${isDuplicate ? 'opacity-50 cursor-not-allowed border-destructive/30' : !complete ? 'opacity-70 cursor-not-allowed border-warning/30' : selectedImportIds.has(b.id) ? 'bg-primary/10 border-primary cursor-pointer' : 'hover:bg-muted/30 cursor-pointer'}`}
                      onClick={() => { if (complete && !isDuplicate) toggleImportSelection(b.id); }}>
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
                <Button disabled={selectedImportIds.size === 0} onClick={() => handleImportFromTransit(Array.from(selectedImportIds))}>Import {selectedImportIds.size > 0 ? `(${selectedImportIds.size})` : ''}</Button>
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

      {actionBatch && actionType && (
        <BatchActionDialog batch={actionBatch} actionType={actionType} open={!!actionBatch} onClose={() => { setActionBatch(null); setActionType(null); }} />
      )}
    </div>
  );
}
