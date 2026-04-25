import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Plus, ShoppingCart, Upload, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface SteelPalletSKU {
  id: string;
  pallet_size: string;
  created_at: string;
}

interface SteelPalletPurchase {
  id: string;
  pallet_sku_id: string;
  purchase_date: string;
  weight_kg: number;
  num_pcs: number;
  rate_per_kg: number | null;
  created_at: string;
}

interface SteelPalletConsumption {
  id: string;
  pallet_sku_id: string;
  consumption_date: string;
  order_id: string | null;
  weight_kg: number;
  num_pcs: number;
  created_at: string;
}

export default function SteelPalletsTab() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sizeFilter, setSizeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showAddSKU, setShowAddSKU] = useState(false);
  const [newSKUWidth, setNewSKUWidth] = useState('');
  const [newSKULength, setNewSKULength] = useState('');
  const [showPurchase, setShowPurchase] = useState<SteelPalletSKU | null>(null);
  const [purchaseForm, setPurchaseForm] = useState({ date: '', weight: '', pcs: '', rate: '' });

  const { data: skus } = useQuery({
    queryKey: ['steel_pallet_skus'],
    queryFn: async () => {
      const { data, error } = await supabase.from('steel_pallet_skus' as any).select('*').order('pallet_size');
      if (error) throw error;
      return data as unknown as SteelPalletSKU[];
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ['steel_pallet_purchases'],
    queryFn: async () => {
      const { data, error } = await supabase.from('steel_pallet_purchases' as any).select('*').order('purchase_date', { ascending: false });
      if (error) throw error;
      return data as unknown as SteelPalletPurchase[];
    },
  });

  const { data: consumptions } = useQuery({
    queryKey: ['steel_pallet_consumptions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('steel_pallet_consumptions' as any).select('*').order('consumption_date', { ascending: false });
      if (error) throw error;
      return data as unknown as SteelPalletConsumption[];
    },
  });

  const insertSKU = useMutation({
    mutationFn: async (size: string) => {
      const { error } = await supabase.from('steel_pallet_skus' as any).insert({ pallet_size: size });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['steel_pallet_skus'] }),
  });

  const insertPurchase = useMutation({
    mutationFn: async (data: { pallet_sku_id: string; purchase_date: string; weight_kg: number; num_pcs: number; rate_per_kg: number | null }) => {
      const { error } = await supabase.from('steel_pallet_purchases' as any).insert(data);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['steel_pallet_purchases'] }),
  });


  const skuSummary = useMemo(() => {
    const map = new Map<string, { balanceWeight: number; balancePcs: number; lastPurchase: string | null; lastConsumption: string | null }>();
    (skus || []).forEach(sku => {
      const skuPurchases = (purchases || []).filter(p => p.pallet_sku_id === sku.id);
      const skuConsumptions = (consumptions || []).filter(c => c.pallet_sku_id === sku.id);
      const purchaseWeight = skuPurchases.reduce((s, p) => s + (p.weight_kg || 0), 0);
      const purchasePcs = skuPurchases.reduce((s, p) => s + (p.num_pcs || 0), 0);
      const consumptionWeight = skuConsumptions.reduce((s, c) => s + (c.weight_kg || 0), 0);
      const consumptionPcs = skuConsumptions.reduce((s, c) => s + (c.num_pcs || 0), 0);
      const lastPurchase = skuPurchases.length > 0 ? skuPurchases[0].purchase_date : null;
      const lastConsumption = skuConsumptions.length > 0 ? skuConsumptions[0].consumption_date : null;
      map.set(sku.id, { balanceWeight: purchaseWeight - consumptionWeight, balancePcs: purchasePcs - consumptionPcs, lastPurchase, lastConsumption });
    });
    return map;
  }, [skus, purchases, consumptions]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const handleAddSKU = async () => {
    const w = Number(newSKUWidth);
    const l = Number(newSKULength);
    if (!w || w <= 0 || !l || l <= 0) { toast.error('Enter valid Width and Length'); return; }
    const palletSize = `${w} x ${l}`;
    if ((skus || []).some(s => s.pallet_size === palletSize)) { toast.error('This pallet size already exists'); return; }
    try {
      await insertSKU.mutateAsync(palletSize);
      toast.success('SKU added');
      setShowAddSKU(false);
      setNewSKUWidth('');
      setNewSKULength('');
    } catch (e: any) {
      toast.error(e.message?.includes('duplicate') ? 'SKU already exists' : 'Failed to add SKU');
    }
  };

  const handlePurchaseSubmit = async () => {
    if (!showPurchase) return;
    if (!purchaseForm.date) { toast.error('Date is required'); return; }
    if (!purchaseForm.weight || Number(purchaseForm.weight) <= 0) { toast.error('Weight is required'); return; }
    if (!purchaseForm.pcs || Number(purchaseForm.pcs) <= 0) { toast.error('Number of Pcs is required'); return; }
    try {
      await insertPurchase.mutateAsync({
        pallet_sku_id: showPurchase.id,
        purchase_date: purchaseForm.date,
        weight_kg: Number(purchaseForm.weight),
        num_pcs: Number(purchaseForm.pcs),
        rate_per_kg: purchaseForm.rate ? Number(purchaseForm.rate) : null,
      });
      toast.success('Purchase recorded');
      setShowPurchase(null);
      setPurchaseForm({ date: '', weight: '', pcs: '', rate: '' });
    } catch { toast.error('Failed to record purchase'); }
  };


  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet);
      for (const row of rows) {
        const size = String(row['Pallet Size'] || row['pallet_size'] || '').trim();
        const weight = Number(row['Weight (Kg)'] || row['weight_kg'] || 0);
        const pcs = Number(row['# of Pcs'] || row['num_pcs'] || 0);
        if (!size) continue;
        let sku = (skus || []).find(s => s.pallet_size === size);
        if (!sku) {
          const { data: newSku, error: skuErr } = await supabase.from('steel_pallet_skus' as any).insert({ pallet_size: size }).select().single();
          if (skuErr) throw skuErr;
          sku = newSku as unknown as SteelPalletSKU;
        }
        if (weight > 0 || pcs > 0) {
          await supabase.from('steel_pallet_purchases' as any).insert({
            pallet_sku_id: sku.id,
            purchase_date: new Date().toISOString().slice(0, 10),
            weight_kg: weight,
            num_pcs: pcs,
            rate_per_kg: null,
          });
        }
      }
      toast.success('Inventory uploaded');
      queryClient.invalidateQueries({ queryKey: ['steel_pallet_skus'] });
      queryClient.invalidateQueries({ queryKey: ['steel_pallet_purchases'] });
    } catch (err: any) {
      console.error(err);
      toast.error(`Upload failed: ${err?.message || 'Could not read the file. Ensure it is a valid .xlsx or .csv file with columns: Pallet Size, Weight (Kg), # of Pcs.'}`, { duration: 8000 });
    }
    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Pallet Size', 'Weight (Kg)', '# of Pcs']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'steel_pallet_inventory_template.xlsx');
    toast.success('Template downloaded');
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['steel_pallet_skus'] });
    queryClient.invalidateQueries({ queryKey: ['steel_pallet_purchases'] });
    queryClient.invalidateQueries({ queryKey: ['steel_pallet_consumptions'] });
    toast.success('Refreshed');
  };

  const filteredSkus = useMemo(() => {
    if (!skus) return [];
    if (sizeFilter === 'all') return skus;
    return skus.filter(s => s.pallet_size === sizeFilter);
  }, [skus, sizeFilter]);

  const grandTotalWeight = useMemo(() => {
    let total = 0;
    filteredSkus.forEach(s => { total += skuSummary.get(s.id)?.balanceWeight || 0; });
    return total;
  }, [filteredSkus, skuSummary]);

  const grandTotalPcs = useMemo(() => {
    let total = 0;
    filteredSkus.forEach(s => { total += skuSummary.get(s.id)?.balancePcs || 0; });
    return total;
  }, [filteredSkus, skuSummary]);

  const handleDownloadExcel = () => {
    const skusToExport = filteredSkus;
    if (skusToExport.length === 0) { toast.info('No data to download'); return; }
    const filterPurchase = (p: SteelPalletPurchase) => {
      if (dateFrom && p.purchase_date < dateFrom) return false;
      if (dateTo && p.purchase_date > dateTo) return false;
      return true;
    };
    const filterConsumption = (c: SteelPalletConsumption) => {
      if (dateFrom && c.consumption_date < dateFrom) return false;
      if (dateTo && c.consumption_date > dateTo) return false;
      return true;
    };
    const purchaseRows = (purchases || [])
      .filter(p => skusToExport.some(s => s.id === p.pallet_sku_id) && filterPurchase(p))
      .map(p => {
        const sku = skusToExport.find(s => s.id === p.pallet_sku_id);
        return { 'Type': 'Purchase', 'Pallet Size': sku?.pallet_size || '', 'Date': p.purchase_date, 'Order ID': '', 'Weight (Kg)': p.weight_kg, '# Pcs': p.num_pcs, 'Rate per Kg': p.rate_per_kg ?? '' };
      });
    const consumptionRows = (consumptions || [])
      .filter(c => skusToExport.some(s => s.id === c.pallet_sku_id) && filterConsumption(c))
      .map(c => {
        const sku = skusToExport.find(s => s.id === c.pallet_sku_id);
        return { 'Type': 'Consumption', 'Pallet Size': sku?.pallet_size || '', 'Date': c.consumption_date, 'Order ID': c.order_id || '', 'Weight (Kg)': c.weight_kg, '# Pcs': c.num_pcs, 'Rate per Kg': '' };
      });
    const allRows = [...purchaseRows, ...consumptionRows].sort((a, b) => a['Date'].localeCompare(b['Date']));
    if (allRows.length === 0) { toast.info('No transactions in selected date range'); return; }
    const ws = XLSX.utils.json_to_sheet(allRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Steel Pallet Transactions');
    XLSX.writeFile(wb, `steel_pallets_${dateFrom || 'all'}_to_${dateTo || 'all'}.xlsx`);
    toast.success('Downloaded');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={refreshAll} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button onClick={() => setShowAddSKU(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add New SKU
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
          <Upload className="h-4 w-4" /> Upload Inventory
        </Button>
        <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
          <Download className="h-4 w-4" /> Download Template
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Input type="date" className="h-8 w-36 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-36 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2 h-8">
            <Download className="h-3.5 w-3.5" /> Download Excel
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Weight:</span>{' '}
          <span className="font-semibold font-mono-num">{grandTotalWeight.toFixed(2)} Kg</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Pcs:</span>{' '}
          <span className="font-semibold font-mono-num">{grandTotalPcs}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8" />
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                <div className="space-y-1">
                  <span>Pallet Size</span>
                  <Select value={sizeFilter} onValueChange={setSizeFilter}>
                    <SelectTrigger className="h-6 text-[10px] w-full min-w-[100px]">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {(skus || []).map(s => (
                        <SelectItem key={s.id} value={s.pallet_size}>{s.pallet_size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Balance Weight (Kg)</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Balance # of Pcs</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Last Purchase Date</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Last Consumed Date</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSkus.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {(!skus || skus.length === 0) ? 'No SKUs found. Add a new SKU or upload inventory.' : 'No SKUs match the selected filter.'}
                </TableCell>
              </TableRow>
            )}
            {filteredSkus.map(sku => {
              const summary = skuSummary.get(sku.id) || { balanceWeight: 0, balancePcs: 0, lastPurchase: null, lastConsumption: null };
              const isOpen = expanded.has(sku.id);
              const skuPurchases = (purchases || []).filter(p => p.pallet_sku_id === sku.id);
              const skuConsumptions = (consumptions || []).filter(c => c.pallet_sku_id === sku.id);
              return (
                <>
                  <TableRow key={sku.id} className="cursor-pointer hover:bg-muted/30" onClick={() => toggleExpand(sku.id)}>
                    <TableCell className="w-8">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{sku.pallet_size}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{summary.balanceWeight.toFixed(2)}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{summary.balancePcs}</TableCell>
                    <TableCell className="text-sm">{summary.lastPurchase ? new Date(summary.lastPurchase).toLocaleDateString('en-IN') : '-'}</TableCell>
                    <TableCell className="text-sm">{summary.lastConsumption ? new Date(summary.lastConsumption).toLocaleDateString('en-IN') : '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setShowPurchase(sku)}>
                          <ShoppingCart className="h-3 w-3" /> Purchase
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow key={`${sku.id}-details`}>
                      <TableCell colSpan={7} className="p-0">
                        <div className="bg-muted/10 p-4 space-y-4">
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Purchase History</h4>
                            {skuPurchases.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No purchases recorded.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Date</TableHead>
                                    <TableHead className="text-xs">Weight (Kg)</TableHead>
                                    <TableHead className="text-xs"># Pcs</TableHead>
                                    <TableHead className="text-xs">Rate/Kg</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {skuPurchases.map(p => (
                                    <TableRow key={p.id}>
                                      <TableCell className="text-xs">{new Date(p.purchase_date).toLocaleDateString('en-IN')}</TableCell>
                                      <TableCell className="text-xs font-mono-num">{p.weight_kg}</TableCell>
                                      <TableCell className="text-xs font-mono-num">{p.num_pcs}</TableCell>
                                      <TableCell className="text-xs font-mono-num">{p.rate_per_kg ?? '-'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Consumption History</h4>
                            {skuConsumptions.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No consumptions recorded.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Date</TableHead>
                                    <TableHead className="text-xs">Order ID</TableHead>
                                    <TableHead className="text-xs">Weight (Kg)</TableHead>
                                    <TableHead className="text-xs"># Pcs</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {skuConsumptions.map(c => (
                                    <TableRow key={c.id}>
                                      <TableCell className="text-xs">{new Date(c.consumption_date).toLocaleDateString('en-IN')}</TableCell>
                                      <TableCell className="text-xs">{c.order_id || '-'}</TableCell>
                                      <TableCell className="text-xs font-mono-num">{c.weight_kg}</TableCell>
                                      <TableCell className="text-xs font-mono-num">{c.num_pcs}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
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

      {/* Add SKU Dialog */}
      <Dialog open={showAddSKU} onOpenChange={setShowAddSKU}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add New Steel Pallet SKU</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Width (mm) *</Label>
                <Input type="number" value={newSKUWidth} onChange={e => setNewSKUWidth(e.target.value)} placeholder="e.g. 1200" />
              </div>
              <div>
                <Label className="text-xs">Length (mm) *</Label>
                <Input type="number" value={newSKULength} onChange={e => setNewSKULength(e.target.value)} placeholder="e.g. 800" />
              </div>
            </div>
            {newSKUWidth && newSKULength && (
              <p className="text-xs text-muted-foreground">Pallet Size: <span className="font-semibold">{newSKUWidth} x {newSKULength}</span></p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddSKU(false)}>Cancel</Button>
            <Button onClick={handleAddSKU} disabled={insertSKU.isPending}>{insertSKU.isPending ? 'Adding...' : 'Add SKU'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase Dialog */}
      <Dialog open={!!showPurchase} onOpenChange={() => setShowPurchase(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Purchase - {showPurchase?.pallet_size}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={purchaseForm.date} onChange={e => setPurchaseForm(v => ({ ...v, date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Weight (Kg) *</Label>
              <Input type="number" value={purchaseForm.weight} onChange={e => setPurchaseForm(v => ({ ...v, weight: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs"># of Pcs *</Label>
              <Input type="number" value={purchaseForm.pcs} onChange={e => setPurchaseForm(v => ({ ...v, pcs: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Rate per Kg</Label>
              <Input type="number" value={purchaseForm.rate} onChange={e => setPurchaseForm(v => ({ ...v, rate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPurchase(null)}>Cancel</Button>
            <Button onClick={handlePurchaseSubmit} disabled={insertPurchase.isPending}>{insertPurchase.isPending ? 'Saving...' : 'Record Purchase'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
