import { useState, useMemo } from 'react';
import { uniqueCaseInsensitive, eqCI, fmtNum } from '@/lib/utils';
import { useAllBatches, useAllActions, getSKUKey, calcBalanceQty, calcUsableBalanceQty, useInsertBatches, type Batch, type InventoryAction } from '@/hooks/useBatches';
import { useAllProcessingRecords } from '@/hooks/useProcessing';
import { useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Eye, Plus, RefreshCw, Download, Trash2, Undo2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActionLog, useSubmitApproval } from '@/hooks/useActionLog';
import { useDeleteBatch, useBulkDeleteBatches, useUpdateBatch } from '@/hooks/useBatches';
import { useUndoAction } from '@/hooks/useUndoAction';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import InventoryFieldSelect from './InventoryFieldSelect';
import { COATING_BY_MATERIAL, GRADE_BY_MATERIAL } from '@/lib/inventory-options';
import ProcessingDialog from './ProcessingDialog';
import PackCoilSaleDialog from './PackCoilSaleDialog';
import { isFieldValueValid } from '@/lib/field-validation';
import { useOrders } from '@/hooks/useOrders';
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
  'coating', 'grade', 'gross_weight', 'net_weight',
  'purchase_date', 'purchase_from',
];

function isBatchComplete(b: Batch): boolean {
  const mat = b.material || '';
  const coatingOptions = mat ? (COATING_BY_MATERIAL[mat] || []) : [];
  const gradeOptions = mat ? (GRADE_BY_MATERIAL[mat] || []) : [];
  return REQUIRED_IMPORT_FIELDS.every(f => {
    if (f === 'coating' && coatingOptions.length === 0) return true;
    if (f === 'grade' && gradeOptions.length === 0) return true;
    const v = b[f]; return v !== null && v !== undefined && v !== '' && v !== 0;
  });
}

function getMissingFields(b: Batch): string[] {
  const mat = b.material || '';
  const coatingOptions = mat ? (COATING_BY_MATERIAL[mat] || []) : [];
  const gradeOptions = mat ? (GRADE_BY_MATERIAL[mat] || []) : [];
  return REQUIRED_IMPORT_FIELDS
    .filter(f => {
      if (f === 'coating' && coatingOptions.length === 0) return false;
      if (f === 'grade' && gradeOptions.length === 0) return false;
      const v = b[f]; return v === null || v === undefined || v === '' || v === 0;
    })
    .map(f => String(f).replace(/_/g, ' '));
}

export default function CoilsInventoryTab() {
  const { data: batches } = useAllBatches();
  const { data: actions } = useAllActions();
  const { data: processingRecords } = useAllProcessingRecords();
  const { data: orders } = useOrders();
  const deleteBatch = useDeleteBatch();
  const bulkDeleteBatches = useBulkDeleteBatches();
  const { isAdmin } = useAuth();
  const logAction = useActionLog();
  const submitApproval = useSubmitApproval();
  const { performAction } = useUndoAction();
  const queryClient = useQueryClient();
  const insertBatches = useInsertBatches();
  const updateBatch = useUpdateBatch();
  
  const [expandedSKU, setExpandedSKU] = useState<string | null>(null);
  const [materialTab, setMaterialTab] = useState<string>('all');
  const [expandedBatchActions, setExpandedBatchActions] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMode, setAddMode] = useState<'new' | 'import' | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [importSearch, setImportSearch] = useState('');
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [editingCoilNumber, setEditingCoilNumber] = useState<string | null>(null);
  const [editCoilNumberValue, setEditCoilNumberValue] = useState('');

  // Action dialogs
  const [processingBatch, setProcessingBatch] = useState<Batch | null>(null);
  const [packCoilBatch, setPackCoilBatch] = useState<Batch | null>(null);
  const [coilSaleMode, setCoilSaleMode] = useState<'pack' | 'loose'>('pack');
  const [batchView, setBatchView] = useState<'open' | 'closed' | 'all'>('open');
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
  const allProcRecords = processingRecords || [];
  const receivedBatches = (batches || []).filter(b => b.status === 'received');
  const inTransitBatches = (batches || []).filter(b => b.status === 'in-transit');

  const uniqueValues = useMemo(() => {
    const fields = ['material', 'make', 'thickness', 'width', 'coating', 'grade'];
    const result: Record<string, string[]> = {};
    fields.forEach(f => {
      const vals = uniqueCaseInsensitive(receivedBatches.map(b => String((b as any)[f] ?? '')).filter(Boolean));
      result[f] = vals;
    });
    return result;
  }, [receivedBatches]);

  const filteredBatches = useMemo(() => {
    return receivedBatches.filter(b => {
      // Open/Closed/All filter
      if (batchView === 'open') {
        const balance = calcBalanceQty(b, allActions, allProcRecords);
        if (balance <= 0) return false;
      } else if (batchView === 'closed') {
        const balance = calcBalanceQty(b, allActions, allProcRecords);
        if (balance > 0) return false;
      }
      for (const [field, val] of Object.entries(filters)) {
        if (!eqCI(String((b as any)[field] ?? ''), val)) return false;
      }
      return true;
    });
  }, [receivedBatches, filters, batchView, allActions, allProcRecords]);

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
      const totalBalanceQty = batchList.reduce((s, b) => s + calcBalanceQty(b, allActions, allProcRecords), 0);
      const totalUsableQty = batchList.reduce((s, b) => s + calcUsableBalanceQty(b, allActions, allProcRecords), 0);
      groups.push({
        key, batches: batchList, material: first.material, make: first.make,
        thickness: first.thickness, width: first.width, length: first.length,
        coating: first.coating, grade: first.grade,
        totalNetWeight, totalBalanceQty, totalUsableQty,
      });
    });
    return groups;
  }, [filteredBatches, allActions, allProcRecords]);

  const uniqueMaterials = useMemo(() => {
    const mats = [...new Set(receivedBatches.map(b => b.material || 'Unknown'))].sort();
    return mats;
  }, [receivedBatches]);

  const displayedSkuGroups = useMemo(() => {
    if (materialTab === 'all') return skuGroups;
    return skuGroups.filter(g => (g.material || 'Unknown') === materialTab);
  }, [skuGroups, materialTab]);

  const grandTotalBalanceQty = useMemo(() => displayedSkuGroups.reduce((s, g) => s + g.totalBalanceQty, 0), [displayedSkuGroups]);
  const grandTotalUsableQty = useMemo(() => displayedSkuGroups.reduce((s, g) => s + g.totalUsableQty, 0), [displayedSkuGroups]);

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

  const handleDeleteBatch = async (batch: Batch) => {
    if (isAdmin) {
      // Admin can delete directly with undo
      const batchData = { ...batch };
      await performAction({
        execute: async () => {
          await deleteBatch.mutateAsync(batch.id);
          logAction.mutate({ action_type: 'delete', entity_type: 'batch', entity_id: batch.id, description: `Deleted batch ${batch.batch_number}` });
        },
        undo: async () => {
          await insertBatches.mutateAsync([batchData as any]);
          queryClient.invalidateQueries({ queryKey: ['batches'] });
        },
        successMessage: `Batch ${batch.batch_number} deleted`,
        undoMessage: `Batch ${batch.batch_number} restored`,
      });
      setSelectedBatchIds(prev => { const next = new Set(prev); next.delete(batch.id); return next; });
    } else {
      // Non-admin: submit for approval
      await submitApproval.mutateAsync({
        action_type: 'delete',
        entity_type: 'batch',
        entity_id: batch.id,
        description: `Delete batch ${batch.batch_number}`,
      });
      toast.success('Deletion request submitted for admin approval');
    }
  };

  const handleBulkDeleteBatches = async () => {
    if (selectedBatchIds.size === 0) return;
    if (!confirm(`Delete ${selectedBatchIds.size} selected batch(es)?`)) return;
    if (isAdmin) {
      try {
        const ids = Array.from(selectedBatchIds);
        await bulkDeleteBatches.mutateAsync(ids);
        logAction.mutate({ action_type: 'bulk_delete', entity_type: 'batch', description: `Bulk deleted ${ids.length} batches` });
        toast.success(`${ids.length} batch(es) deleted`);
        setSelectedBatchIds(new Set());
      } catch { toast.error('Failed to delete batches'); }
    } else {
      for (const id of selectedBatchIds) {
        const batch = filteredBatches.find(b => b.id === id);
        if (batch) {
          await submitApproval.mutateAsync({
            action_type: 'delete',
            entity_type: 'batch',
            entity_id: id,
            description: `Delete batch ${batch.batch_number}`,
          });
        }
      }
      toast.success('Deletion requests submitted for admin approval');
      setSelectedBatchIds(new Set());
    }
  };

  const existingBatchNumbers = new Set((batches || []).filter(b => b.status === 'received').map(b => b.batch_number));

  const isNewBatchValid = () => {
    const mat = newBatch.material;
    const coatingOptions = mat ? (COATING_BY_MATERIAL[mat] || []) : [];
    const gradeOptions = mat ? (GRADE_BY_MATERIAL[mat] || []) : [];
    return Object.entries(newBatch).every(([key, v]) => {
      if (key === 'coating' && coatingOptions.length === 0) return true;
      if (key === 'grade' && gradeOptions.length === 0) return true;
      return v !== '';
    });
  };

  const handleAddNew = async () => {
    if (!isNewBatchValid()) { toast.error('All fields are mandatory'); return; }
    if (existingBatchNumbers.has(newBatch.batch_number)) { toast.error(`Batch number "${newBatch.batch_number}" already exists`); return; }
    try {
      await insertBatches.mutateAsync([{
        batch_number: newBatch.batch_number, material: newBatch.material || null, make: newBatch.make || null,
        form: newBatch.form || null,
        thickness: newBatch.thickness ? Number(newBatch.thickness) : null, width: newBatch.width ? Number(newBatch.width) : null,
        length: newBatch.length || null, coating: newBatch.coating || null, grade: newBatch.grade || null,
        gross_weight: newBatch.gross_weight ? Number(newBatch.gross_weight) : null,
        net_weight: newBatch.net_weight ? Number(newBatch.net_weight) : null,
        coil_number: newBatch.coil_number || null, purchase_date: newBatch.purchase_date || null,
        purchase_from: newBatch.purchase_from || null, status: 'received',
        batch_status: newBatch.form || null,
      } as any]);
      toast.success('Batch added'); setShowAddDialog(false); setAddMode(null);
      setNewBatch({ batch_number: '', material: '', make: '', form: '', thickness: '', width: '', length: '', coating: '', grade: '', gross_weight: '', net_weight: '', coil_number: '', purchase_date: '', purchase_from: '' });
    } catch { toast.error('Failed to add batch'); }
  };

  const handleImportFromTransit = async (ids: string[]) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      // For each batch, set status=received and batch_status=form
      for (const id of ids) {
        const batch = inTransitBatches.find(b => b.id === id);
        await supabase.from('batches').update({
          status: 'received',
          batch_status: (batch as any)?.form || 'Pack coil',
        } as any).eq('id', id);
      }
      toast.success(`${ids.length} batch(es) moved to coils inventory`);
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

  const handleDownloadExcel = () => {
    if (filteredBatches.length === 0) { toast.info('No data to download'); return; }
    const rows = filteredBatches.map(b => ({
      'Batch No': b.batch_number, 'Material': b.material || '', 'Make': b.make || '',
      'Thickness': b.thickness ?? '', 'Width': b.width ?? '', 'Length': b.length ?? '',
      'Coating': b.coating || '', 'Grade': b.grade || '',
      'Gross Wt (Kg)': b.gross_weight ?? '', 'Net Wt (Kg)': b.net_weight ?? '',
      'Status': (b as any).batch_status || (b as any).form || '-',
      'Balance Qty': calcBalanceQty(b, allActions, allProcRecords).toFixed(2),
      'Usable Qty': calcUsableBalanceQty(b, allActions, allProcRecords).toFixed(2),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Coils Inventory');
    XLSX.writeFile(wb, `coils_inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Downloaded');
  };

  const getBatchStatus = (b: Batch): string => {
    return (b as any).batch_status || (b as any).form || 'Pack coil';
  };

  const filterFields = ['material', 'make', 'thickness', 'width', 'coating', 'grade'];
  // SKU summary: removed Form column
  const skuCols = ['', 'Material', 'Make', 'Thickness', 'Width', 'Length', 'Coating', 'Grade', 'Usable Qty (Kg)', 'Total Inv (Kg)'];
  const batchCols = ['', 'Material', 'Make', 'Status', 'Batch No', 'Thickness', 'Width', 'Coating', 'Grade', 'Gross Wt', 'Net Wt', 'Coil No', 'Purchase Date', 'Purchase From', 'Balance Qty', 'Usable Bal Qty', 'Action'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            queryClient.invalidateQueries({ queryKey: ['inventory_actions'] });
            queryClient.invalidateQueries({ queryKey: ['processing_records'] });
            toast.success('Refreshed');
          }} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        <Button onClick={() => { setShowAddDialog(true); setAddMode(null); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add New Item
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2">
          <Download className="h-4 w-4" /> Download Excel
        </Button>
          {selectedBatchIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkDeleteBatches} className="gap-2">
              <Trash2 className="h-4 w-4" /> Delete Selected ({selectedBatchIds.size})
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {(['open', 'closed', 'all'] as const).map(v => (
            <Button
              key={v}
              size="sm"
              variant={batchView === v ? 'default' : 'ghost'}
              className="text-xs h-7 px-3 capitalize"
              onClick={() => setBatchView(v)}
            >
              {v}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Balance Qty:</span>{' '}
          <span className="font-semibold font-mono-num">{fmtNum(grandTotalBalanceQty)} Kg</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Usable Qty:</span>{' '}
          <span className="font-semibold font-mono-num">{grandTotalUsableQty.toFixed(2)} Kg</span>
        </div>
      </div>

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

      {/* Material Tabs */}
      <div className="flex items-center gap-1 flex-wrap bg-muted/50 rounded-lg p-1">
        <Button
          size="sm"
          variant={materialTab === 'all' ? 'default' : 'ghost'}
          className="text-xs h-7 px-3"
          onClick={() => setMaterialTab('all')}
        >
          All
        </Button>
        {uniqueMaterials.map(mat => (
          <Button
            key={mat}
            size="sm"
            variant={materialTab === mat ? 'default' : 'ghost'}
            className="text-xs h-7 px-3"
            onClick={() => setMaterialTab(mat)}
          >
            {mat}
          </Button>
        ))}
      </div>

      {/* SKU Summary */}
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-[hsl(var(--sku-row))]">
              {skuCols.map(c => <TableHead key={c} className="text-xs font-semibold whitespace-nowrap">{c}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedSkuGroups.length === 0 && (
              <TableRow><TableCell colSpan={skuCols.length} className="text-center text-muted-foreground py-8">No inventory items for this material.</TableCell></TableRow>
            )}
            {displayedSkuGroups.map(g => (
              <>
                <TableRow key={g.key} className="cursor-pointer bg-[hsl(var(--sku-row))] hover:bg-[hsl(var(--sku-row))/0.7] font-medium" onClick={() => setExpandedSKU(expandedSKU === g.key ? null : g.key)}>
                  <TableCell>{expandedSKU === g.key ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                  <TableCell className="text-sm">{g.material || '-'}</TableCell>
                  <TableCell className="text-sm">{g.make || '-'}</TableCell>
                  <TableCell className="text-sm font-mono-num">{g.thickness ?? '-'}</TableCell>
                  <TableCell className="text-sm font-mono-num">{g.width ?? '-'}</TableCell>
                  <TableCell className="text-sm font-mono-num">{g.length ?? '-'}</TableCell>
                  <TableCell className="text-sm">{g.coating || '-'}</TableCell>
                  <TableCell className="text-sm">{g.grade || '-'}</TableCell>
                  <TableCell className="text-sm font-mono-num font-semibold">{g.totalUsableQty.toFixed(2)}</TableCell>
                  <TableCell className="text-sm font-mono-num font-semibold">{g.totalBalanceQty.toFixed(2)}</TableCell>
                </TableRow>
                {expandedSKU === g.key && (
                  <TableRow key={`${g.key}-detail`}>
                    <TableCell colSpan={skuCols.length} className="p-0">
                      <div className="bg-[hsl(var(--batch-row))] p-3">
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
                              const status = getBatchStatus(b);
                              const isSold = status === 'sold';
                              const balanceQty = calcBalanceQty(b, allActions, allProcRecords);
                              const usableQty = calcUsableBalanceQty(b, allActions, allProcRecords);

                              return (
                                <>
                                  <TableRow key={b.id} className={selectedBatchIds.has(b.id) ? 'bg-primary/5' : ''}>
                                    <TableCell><Checkbox checked={selectedBatchIds.has(b.id)} onCheckedChange={() => toggleBatchSelect(b.id)} /></TableCell>
                                    <TableCell className="text-sm">{b.material || '-'}</TableCell>
                                    <TableCell className="text-sm">{b.make || '-'}</TableCell>
                                    <TableCell className="text-sm">
                                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                                        isSold ? 'bg-destructive/10 text-destructive' :
                                        status === 'loose' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-primary/10 text-primary'
                                      }`}>
                                        {status}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-sm font-semibold">{b.batch_number}</TableCell>
                                    <TableCell className="text-sm font-mono-num">{b.thickness ?? '-'}</TableCell>
                                    <TableCell className="text-sm font-mono-num">{b.width ?? '-'}</TableCell>
                                    <TableCell className="text-sm">{b.coating || '-'}</TableCell>
                                    <TableCell className="text-sm">{b.grade || '-'}</TableCell>
                                    <TableCell className="text-sm font-mono-num">{b.gross_weight ?? '-'}</TableCell>
                                    <TableCell className="text-sm font-mono-num">{b.net_weight ?? '-'}</TableCell>
                                    <TableCell className="text-sm">
                                      {editingCoilNumber === b.id ? (
                                        <Input
                                          autoFocus
                                          value={editCoilNumberValue}
                                          onChange={(e) => setEditCoilNumberValue(e.target.value)}
                                          onBlur={async () => {
                                            if (editCoilNumberValue !== (b.coil_number || '')) {
                                              try {
                                                await updateBatch.mutateAsync({ id: b.id, coil_number: editCoilNumberValue || null });
                                                toast.success('Coil number updated');
                                              } catch { toast.error('Failed to update'); }
                                            }
                                            setEditingCoilNumber(null);
                                          }}
                                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingCoilNumber(null); }}
                                          className="h-7 text-sm w-28"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      ) : (
                                        <span
                                          className="cursor-pointer hover:underline hover:text-primary"
                                          onClick={(e) => { e.stopPropagation(); setEditingCoilNumber(b.id); setEditCoilNumberValue(b.coil_number || ''); }}
                                          title="Click to edit"
                                        >
                                          {b.coil_number || '-'}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-sm">{b.purchase_date || '-'}</TableCell>
                                    <TableCell className="text-sm">{b.purchase_from || '-'}</TableCell>
                                    <TableCell className="text-sm font-mono-num font-semibold">{balanceQty.toFixed(2)}</TableCell>
                                    <TableCell className="text-sm font-mono-num font-semibold">{usableQty.toFixed(2)}</TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button
                                              size="sm" variant="outline" className="text-xs h-7 gap-1"
                                              disabled={isSold}
                                              title={isSold ? 'Already sold' : ''}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              Coil Sale <ChevronDown className="h-3 w-3" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="start">
                                            <DropdownMenuItem
                                              disabled={status === 'loose' || batchActions.some(a => a.action_type === 'loose_coil_sale')}
                                              onClick={(e) => { e.stopPropagation(); setCoilSaleMode('pack'); setPackCoilBatch(b); }}
                                            >
                                              Pack Coil Sale
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              onClick={(e) => { e.stopPropagation(); setCoilSaleMode('loose'); setPackCoilBatch(b); }}
                                            >
                                              Loose Coil Sale
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                        <Button
                                          size="sm" variant="outline" className="text-xs h-7"
                                          disabled={isSold}
                                          title={isSold ? 'Already sold' : ''}
                                          onClick={(e) => { e.stopPropagation(); setProcessingBatch(b); }}
                                        >
                                          Processing
                                        </Button>
                                        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setExpandedBatchActions(isExpanded ? null : b.id); }}>
                                          <Eye className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteBatch(b); }} title="Delete Batch">
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="text-xs h-7 text-warning" onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!confirm(`Move batch ${b.batch_number} back to In-Transit?`)) return;
                                          try {
                                            await updateBatch.mutateAsync({ id: b.id, status: 'in-transit' } as any);
                                            toast.success(`Batch ${b.batch_number} moved to In-Transit`);
                                            queryClient.invalidateQueries({ queryKey: ['batches'] });
                                          } catch { toast.error('Failed to move batch'); }
                                        }} title="Move to In-Transit">
                                          <Undo2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                  {isExpanded && (
                                    <TableRow key={`${b.id}-details`}>
                                      <TableCell colSpan={batchCols.length} className="p-0">
                                        <div className="bg-muted/10 border-t border-b px-8 py-3 space-y-4">
                                          {(() => {
                                            const scrapActions = batchActions.filter(a => a.action_type === 'scrap');
                                            const defectiveActions = batchActions.filter(a => a.action_type === 'defective');
                                            const packCoilSales = batchActions.filter(a => a.action_type === 'pack_coil_sale');
                                            const looseCoilSales = batchActions.filter(a => a.action_type === 'loose_coil_sale');
                                            const batchProcRecords = allProcRecords.filter((p: any) => p.batch_id === b.id);
                                            const hasCoilSales = packCoilSales.length > 0 || looseCoilSales.length > 0;
                                            const hasNothing = scrapActions.length === 0 && defectiveActions.length === 0 && !hasCoilSales && batchProcRecords.length === 0;

                                            if (hasNothing) {
                                              return <p className="text-xs text-muted-foreground text-center py-1">No actions or processing recorded for this batch.</p>;
                                            }

                                            return (
                                              <>
                                                {/* Coil Sales Section */}
                                                {hasCoilSales && (
                                                  <div>
                                                    <p className="text-xs font-semibold text-muted-foreground mb-1">Coil Sales</p>
                                                    {packCoilSales.length > 0 && (
                                                       <div className="mb-2">
                                                        <p className="text-[11px] font-medium text-muted-foreground ml-2 mb-0.5">Pack Coil Sale</p>
                                                        <Table>
                                                          <TableHeader>
                                                            <TableRow>
                                                              <TableHead className="text-xs">Customer</TableHead>
                                                              <TableHead className="text-xs">Weight (Kg)</TableHead>
                                                              <TableHead className="text-xs">Invoice</TableHead>
                                                              <TableHead className="text-xs">Order ID</TableHead>
                                                              <TableHead className="text-xs">Date</TableHead>
                                                            </TableRow>
                                                          </TableHeader>
                                                          <TableBody>
                                                            {packCoilSales.map(a => {
                                                              const matchedOrder = orders?.find((o: any) => o.order_number === a.order_id);
                                                              const customerName = matchedOrder?.customers?.customer_name || '-';
                                                              return (
                                                              <TableRow key={a.id}>
                                                                <TableCell className="text-xs">{customerName}</TableCell>
                                                                <TableCell className="text-xs font-mono-num">{a.net_weight ?? '-'}</TableCell>
                                                                <TableCell className="text-xs">{a.invoice_number || '-'}</TableCell>
                                                                <TableCell className="text-xs">{a.order_id || '-'}</TableCell>
                                                                <TableCell className="text-xs">{a.sales_date || '-'}</TableCell>
                                                              </TableRow>
                                                              );
                                                            })}
                                                          </TableBody>
                                                        </Table>
                                                      </div>
                                                    )}
                                                    {looseCoilSales.length > 0 && (
                                                      <div className="mb-2">
                                                        <p className="text-[11px] font-medium text-muted-foreground ml-2 mb-0.5">Loose Coil Sale</p>
                                                        <Table>
                                                          <TableHeader>
                                                            <TableRow>
                                                              <TableHead className="text-xs">Customer</TableHead>
                                                              <TableHead className="text-xs">Weight (Kg)</TableHead>
                                                              <TableHead className="text-xs">Invoice</TableHead>
                                                              <TableHead className="text-xs">Order ID</TableHead>
                                                              <TableHead className="text-xs">Date</TableHead>
                                                            </TableRow>
                                                          </TableHeader>
                                                          <TableBody>
                                                            {looseCoilSales.map(a => {
                                                              const matchedOrder = orders?.find((o: any) => o.order_number === a.order_id);
                                                              const customerName = matchedOrder?.customers?.customer_name || '-';
                                                              return (
                                                              <TableRow key={a.id}>
                                                                <TableCell className="text-xs">{customerName}</TableCell>
                                                                <TableCell className="text-xs font-mono-num">{a.net_weight ?? '-'}</TableCell>
                                                                <TableCell className="text-xs">{a.invoice_number || '-'}</TableCell>
                                                                <TableCell className="text-xs">{a.order_id || '-'}</TableCell>
                                                                <TableCell className="text-xs">{a.sales_date || '-'}</TableCell>
                                                              </TableRow>
                                                              );
                                                            })}
                                                          </TableBody>
                                                        </Table>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}

                                                {/* Processing Section */}
                                                {batchProcRecords.length > 0 && (
                                                  <div>
                                                    <p className="text-xs font-semibold text-muted-foreground mb-1">Processing</p>
                                                    {batchProcRecords.map((pr: any) => {
                                                      const outputItems = pr.processing_output_items || [];
                                                      const totalProcessedQty = outputItems.reduce((s: number, item: any) => s + (item.qty_kg || 0), 0);
                                                      return (
                                                        <div key={pr.id} className="mb-2 border rounded p-2 bg-background">
                                                          <div className="flex gap-4 text-xs text-muted-foreground mb-1">
                                                            <span><strong>Process:</strong> {pr.process_type}</span>
                                                            <span><strong>Output:</strong> {pr.output_type}</span>
                                                            <span><strong>Order:</strong> {pr.order_id || '-'}</span>
                                                            <span><strong>Date:</strong> {pr.created_at ? new Date(pr.created_at).toLocaleDateString() : '-'}</span>
                                                            <span className="font-semibold"><strong>Total Processed Qty:</strong> <span className="font-mono-num">{totalProcessedQty.toFixed(2)} Kg</span></span>
                                                          </div>
                                                          {outputItems.length > 0 && (
                                                            <Table>
                                                              <TableHeader>
                                                                <TableRow>
                                                                  <TableHead className="text-xs">Width (mm)</TableHead>
                                                                  <TableHead className="text-xs">Length (mm)</TableHead>
                                                                  <TableHead className="text-xs">Pcs</TableHead>
                                                                  <TableHead className="text-xs">Processed Qty (Kg)</TableHead>
                                                                </TableRow>
                                                              </TableHeader>
                                                              <TableBody>
                                                                {outputItems.map((item: any) => (
                                                                  <TableRow key={item.id}>
                                                                    <TableCell className="text-xs font-mono-num">{item.width ?? '-'}</TableCell>
                                                                    <TableCell className="text-xs font-mono-num">{item.length ?? '-'}</TableCell>
                                                                    <TableCell className="text-xs font-mono-num">{item.num_pcs ?? '-'}</TableCell>
                                                                    <TableCell className="text-xs font-mono-num">{item.qty_kg != null ? Number(item.qty_kg).toFixed(2) : '-'}</TableCell>
                                                                  </TableRow>
                                                                ))}
                                                              </TableBody>
                                                            </Table>
                                                          )}
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                )}

                                                {/* Scrap Section */}
                                                {scrapActions.length > 0 && (
                                                  <div>
                                                    <p className="text-xs font-semibold text-muted-foreground mb-1">Scrap</p>
                                                    <div className="flex flex-wrap gap-2">
                                                      {scrapActions.map(a => (
                                                        <div key={a.id} className="border rounded-md px-3 py-1.5 bg-background text-xs flex flex-col items-center min-w-[80px]">
                                                          <span className="text-muted-foreground">{a.scrap_type === 'Trimming' ? 'Trim' : (a.scrap_type || '-')}</span>
                                                          <span className="font-semibold font-mono-num">{a.net_weight != null ? Number(a.net_weight).toFixed(2) : '-'} Kg</span>
                                                        </div>
                                                      ))}
                                                      <div className="border rounded-md px-3 py-1.5 bg-muted/40 text-xs flex flex-col items-center min-w-[80px] font-semibold">
                                                        <span className="text-muted-foreground">Total</span>
                                                        <span className="font-mono-num">{scrapActions.reduce((s, a) => s + (a.net_weight || 0), 0).toFixed(2)} Kg</span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Defective Section */}
                                                {defectiveActions.length > 0 && (
                                                  <div>
                                                    <p className="text-xs font-semibold text-muted-foreground mb-1">Defective</p>
                                                    <div className="flex flex-wrap gap-2">
                                                      {defectiveActions.map(a => (
                                                        <div key={a.id} className="border rounded-md px-3 py-1.5 bg-background text-xs flex flex-col items-center min-w-[80px]">
                                                          <span className="text-muted-foreground">{a.defect_type || '-'}</span>
                                                          <span className="font-semibold font-mono-num">{a.net_weight != null ? Number(a.net_weight).toFixed(2) : '-'} Kg</span>
                                                        </div>
                                                      ))}
                                                      <div className="border rounded-md px-3 py-1.5 bg-muted/40 text-xs flex flex-col items-center min-w-[80px] font-semibold">
                                                        <span className="text-muted-foreground">Total</span>
                                                        <span className="font-mono-num">{defectiveActions.reduce((s, a) => s + (a.net_weight || 0), 0).toFixed(2)} Kg</span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                )}
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </TableCell>
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
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add New Item</DialogTitle></DialogHeader>
          {!addMode ? (
            <div className="flex flex-col gap-3">
              <Button variant="outline" onClick={() => setAddMode('import')}>Import from In-Transit Material</Button>
              <Button variant="outline" onClick={() => setAddMode('new')}>Input New Batch</Button>
            </div>
          ) : addMode === 'import' ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Select batches to move to coils inventory.</p>
              <Input placeholder="Search batch number..." value={importSearch} onChange={e => setImportSearch(e.target.value)} className="h-8 text-sm" />
              {inTransitBatches.length === 0 && <p className="text-sm text-muted-foreground">No in-transit batches available.</p>}
              <div className="max-h-60 overflow-y-auto space-y-1">
                {inTransitBatches.filter(b => !importSearch || b.batch_number.toLowerCase().includes(importSearch.toLowerCase())).map(b => {
                  const complete = isBatchComplete(b);
                  const missing = getMissingFields(b);
                  const isDuplicate = existingBatchNumbers.has(b.batch_number);
                  return (
                    <div key={b.id}
                      className={`flex flex-col gap-1 p-2.5 border rounded ${isDuplicate ? 'opacity-50 cursor-not-allowed border-destructive/30' : !complete ? 'opacity-70 cursor-not-allowed border-warning/30' : selectedImportIds.has(b.id) ? 'bg-primary/10 border-primary cursor-pointer' : 'hover:bg-muted/30 cursor-pointer'}`}
                      onClick={() => { if (complete && !isDuplicate) toggleImportSelection(b.id); }}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedImportIds.has(b.id)} readOnly className="accent-primary" disabled={!complete || isDuplicate} />
                        <span className="text-sm font-semibold">{b.batch_number}</span>
                        <span className="ml-auto text-xs text-muted-foreground font-mono-num">{b.net_weight} Kg</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-xs text-muted-foreground">
                        {b.material && <span><strong>Material:</strong> {b.material}</span>}
                        {b.make && <span><strong>Make:</strong> {b.make}</span>}
                        {(b as any).form && <span><strong>Form:</strong> {(b as any).form}</span>}
                        {b.thickness && <span><strong>Thickness:</strong> {b.thickness}mm</span>}
                        {b.width && <span><strong>Width:</strong> {b.width}</span>}
                        {b.length && <span><strong>Length:</strong> {b.length}</span>}
                        {b.coating && <span><strong>Coating:</strong> {b.coating}</span>}
                        {b.grade && <span><strong>Grade:</strong> {b.grade}</span>}
                        {b.gross_weight && <span><strong>Gross Wt:</strong> {b.gross_weight} Kg</span>}
                        {b.purchase_date && <span><strong>Purchase Date:</strong> {b.purchase_date}</span>}
                        {b.purchase_from && <span><strong>From:</strong> {b.purchase_from}</span>}
                      </div>
                      {isDuplicate && <p className="text-xs text-destructive pl-6">Duplicate — already in inventory</p>}
                      {!complete && !isDuplicate && <p className="text-xs text-warning pl-6">Missing: {missing.join(', ')}</p>}
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
                <Button onClick={handleAddNew} disabled={!isNewBatchValid() || insertBatches.isPending}>Add Batch</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Processing Dialog */}
      {processingBatch && (
        <ProcessingDialog
          batch={processingBatch}
          allActions={allActions}
          processingRecords={allProcRecords}
          open={!!processingBatch}
          onClose={() => setProcessingBatch(null)}
        />
      )}

      {/* Coil Sale Dialog */}
      {packCoilBatch && (
        <PackCoilSaleDialog
          key={`${packCoilBatch.id}-${coilSaleMode}`}
          batch={packCoilBatch}
          allActions={allActions}
          processingRecords={allProcRecords}
          open={!!packCoilBatch}
          onClose={() => setPackCoilBatch(null)}
          mode={coilSaleMode}
        />
      )}
    </div>
  );
}
