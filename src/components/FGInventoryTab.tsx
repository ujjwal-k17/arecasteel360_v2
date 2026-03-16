import { useState, useMemo } from 'react';
import { useFGItems } from '@/hooks/useProcessing';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, ChevronRight, ChevronDown, ShoppingCart, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomers, useOrders, useAllDispatches } from '@/hooks/useOrders';

const DEFECT_TYPES = ['End pcs', 'Scratch/ Dent', 'Waviness', 'Other'];

interface SKUGroup {
  key: string;
  material: string;
  make: string;
  process: string;
  thickness: number | null;
  width: number | null;
  length: number | null;
  coating: string;
  grade: string;
  totalQty: number;
  totalPcs: number;
  items: any[];
}

export default function FGInventoryTab() {
  const { data: fgItems } = useFGItems();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Filters
  const [filterMaterial, setFilterMaterial] = useState('all');
  const [filterMake, setFilterMake] = useState('all');
  const [filterProcess, setFilterProcess] = useState('all');
  const [filterCoating, setFilterCoating] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');

  // Dialogs
  const [saleDialog, setSaleDialog] = useState<any | null>(null);
  const [defectDialog, setDefectDialog] = useState<any | null>(null);
  const [saleCustomerId, setSaleCustomerId] = useState('');
  const [saleForm, setSaleForm] = useState({ invoice_number: '', order_id: '', quantity: '', sales_date: '' });
  const [defectForm, setDefectForm] = useState({ defect_type: '', quantity: '' });

  const { data: customers } = useCustomers();
  const { data: allOrders } = useOrders();

  const filteredSaleOrders = useMemo(() => {
    if (!allOrders || !saleCustomerId) return [];
    return allOrders.filter((o: any) => o.customer_id === saleCustomerId && o.status === 'open');
  }, [allOrders, saleCustomerId]);

  // Fetch FG sales & defectives
  const { data: fgSales } = useQuery({
    queryKey: ['fg_sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fg_sales' as any).select('*');
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: fgDefectives } = useQuery({
    queryKey: ['fg_defectives'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fg_defectives' as any).select('*');
      if (error) throw error;
      return data as any[];
    },
  });

  const insertFGSale = useMutation({
    mutationFn: async (sale: any) => {
      const { error } = await supabase.from('fg_sales' as any).insert(sale);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fg_sales'] }),
  });

  const insertFGDefective = useMutation({
    mutationFn: async (defective: any) => {
      const { error } = await supabase.from('fg_defectives' as any).insert(defective);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fg_defectives'] });
      queryClient.invalidateQueries({ queryKey: ['fg_sales'] });
    },
  });

  // Compute sold & defective qty per fg_item
  const soldByItem = useMemo(() => {
    const map = new Map<string, number>();
    (fgSales || []).forEach((s: any) => {
      map.set(s.fg_item_id, (map.get(s.fg_item_id) || 0) + (s.quantity || 0));
    });
    return map;
  }, [fgSales]);

  const defectiveByItem = useMemo(() => {
    const map = new Map<string, number>();
    (fgDefectives || []).forEach((d: any) => {
      map.set(d.fg_item_id, (map.get(d.fg_item_id) || 0) + (d.quantity || 0));
    });
    return map;
  }, [fgDefectives]);

  const getAvailableQty = (item: any) => {
    const original = item.qty || 0;
    const sold = soldByItem.get(item.id) || 0;
    const defective = defectiveByItem.get(item.id) || 0;
    return original - sold - defective;
  };

  const { data: batches } = useQuery({
    queryKey: ['batches_lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('batches').select('id, batch_number');
      if (error) throw error;
      return data;
    },
  });

  const { data: wipItemsRaw } = useQuery({
    queryKey: ['wip_items_lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wip_items' as any).select('id, source_batch_id');
      if (error) throw error;
      return data as any[];
    },
  });

  const batchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of batches || []) map.set(b.id, b.batch_number);
    return map;
  }, [batches]);

  const wipBatchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of wipItemsRaw || []) {
      const bn = batchMap.get(w.source_batch_id);
      if (bn) map.set(w.id, bn);
    }
    return map;
  }, [wipItemsRaw, batchMap]);

  const items = fgItems || [];

  const uniqueVals = useMemo(() => ({
    material: [...new Set(items.map(i => i.material || '-'))].sort(),
    make: [...new Set(items.map(i => i.make || '-'))].sort(),
    process: [...new Set(items.map(i => i.process || '-'))].sort(),
    coating: [...new Set(items.map(i => i.coating || '-'))].sort(),
    grade: [...new Set(items.map(i => i.grade || '-'))].sort(),
  }), [items]);

  const filteredItems = useMemo(() => {
    return items.filter(i =>
      (filterMaterial === 'all' || (i.material || '-') === filterMaterial) &&
      (filterMake === 'all' || (i.make || '-') === filterMake) &&
      (filterProcess === 'all' || (i.process || '-') === filterProcess) &&
      (filterCoating === 'all' || (i.coating || '-') === filterCoating) &&
      (filterGrade === 'all' || (i.grade || '-') === filterGrade)
    );
  }, [items, filterMaterial, filterMake, filterProcess, filterCoating, filterGrade]);

  const grandTotalQty = useMemo(() => filteredItems.reduce((s, i) => s + getAvailableQty(i), 0), [filteredItems, soldByItem, defectiveByItem]);
  const grandTotalPcs = useMemo(() => filteredItems.reduce((s, i) => s + (i.num_pcs || 0), 0), [filteredItems]);

  const skuGroups = useMemo(() => {
    const map = new Map<string, SKUGroup>();
    for (const item of filteredItems) {
      const key = [item.material || '', item.make || '', item.process || '', item.thickness ?? '', item.width ?? '', item.length ?? '', item.coating || '', item.grade || ''].join('|');
      if (!map.has(key)) {
        map.set(key, { key, material: item.material || '-', make: item.make || '-', process: item.process || '-', thickness: item.thickness, width: item.width, length: item.length, coating: item.coating || '-', grade: item.grade || '-', totalQty: 0, totalPcs: 0, items: [] });
      }
      const g = map.get(key)!;
      g.totalQty += getAvailableQty(item);
      g.totalPcs += item.num_pcs || 0;
      g.items.push(item);
    }
    return Array.from(map.values());
  }, [filteredItems, soldByItem, defectiveByItem]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  const formatDimensions = (t: any, w: any, l: any, process: string) => {
    const isSlit = (process || '').toLowerCase().includes('slit');
    return `${t ?? '-'} x ${w ?? '-'} x ${isSlit ? 'Coil' : (l ?? '-')}`;
  };

  const getBatchNumber = (item: any): string => {
    if (item.source_type === 'wip') return wipBatchMap.get(item.source_id) || '-';
    return batchMap.get(item.source_id) || '-';
  };

  const handleSaleSubmit = async () => {
    if (!saleDialog) return;
    const qty = Number(saleForm.quantity) || 0;
    const available = getAvailableQty(saleDialog);
    if (qty <= 0) { toast.error('Enter a valid quantity'); return; }
    if (qty > available + 0.01) { toast.error(`Quantity exceeds available (${available.toFixed(2)} Kg)`); return; }
    try {
      await insertFGSale.mutateAsync({
        fg_item_id: saleDialog.id,
        invoice_number: saleForm.invoice_number || null,
        order_id: saleForm.order_id || null,
        quantity: qty,
        sales_date: saleForm.sales_date || null,
      });
      toast.success('Sale recorded');
      setSaleDialog(null);
      setSaleCustomerId('');
      setSaleForm({ invoice_number: '', order_id: '', quantity: '', sales_date: '' });
    } catch { toast.error('Failed to record sale'); }
  };

  const handleDefectSubmit = async () => {
    if (!defectDialog) return;
    const qty = Number(defectForm.quantity) || 0;
    const available = getAvailableQty(defectDialog);
    if (!defectForm.defect_type) { toast.error('Select a defect type'); return; }
    if (qty <= 0) { toast.error('Enter a valid quantity'); return; }
    if (qty > available + 0.01) { toast.error(`Quantity exceeds available (${available.toFixed(2)} Kg)`); return; }
    try {
      await insertFGDefective.mutateAsync({
        fg_item_id: defectDialog.id,
        defect_type: defectForm.defect_type,
        quantity: qty,
      });
      toast.success('Defective recorded');
      setDefectDialog(null);
      setDefectForm({ defect_type: '', quantity: '' });
    } catch { toast.error('Failed to record defective'); }
  };

  const FilterSelect = ({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['fg_items'] });
    queryClient.invalidateQueries({ queryKey: ['fg_sales'] });
    queryClient.invalidateQueries({ queryKey: ['fg_defectives'] });
    queryClient.invalidateQueries({ queryKey: ['batches_lookup'] });
    queryClient.invalidateQueries({ queryKey: ['wip_items_lookup'] });
    toast.success('Refreshed');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={refreshAll} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <div className="bg-primary/10 text-primary rounded-md px-3 py-1.5 text-sm font-semibold font-mono-num">
          Total: {grandTotalQty.toFixed(2)} Kg · {grandTotalPcs} Pcs ({filteredItems.length} items)
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold w-8" />
              <TableHead className="text-xs font-semibold whitespace-nowrap">Material</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Make</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Process</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Dimensions</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Coating</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Grade</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Qty (Kg)</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap"># Pcs</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Actions</TableHead>
            </TableRow>
            <TableRow className="bg-muted/20">
              <TableHead />
              <TableHead><FilterSelect value={filterMaterial} onChange={setFilterMaterial} options={uniqueVals.material} placeholder="Material" /></TableHead>
              <TableHead><FilterSelect value={filterMake} onChange={setFilterMake} options={uniqueVals.make} placeholder="Make" /></TableHead>
              <TableHead><FilterSelect value={filterProcess} onChange={setFilterProcess} options={uniqueVals.process} placeholder="Process" /></TableHead>
              <TableHead />
              <TableHead><FilterSelect value={filterCoating} onChange={setFilterCoating} options={uniqueVals.coating} placeholder="Coating" /></TableHead>
              <TableHead><FilterSelect value={filterGrade} onChange={setFilterGrade} options={uniqueVals.grade} placeholder="Grade" /></TableHead>
              <TableHead />
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {skuGroups.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No FG items found.</TableCell></TableRow>
            )}
            {skuGroups.map(g => {
              const isOpen = expanded.has(g.key);
              return (
                <>
                  <TableRow key={g.key} className="cursor-pointer hover:bg-muted/30 bg-muted/10 font-medium" onClick={() => toggleExpand(g.key)}>
                    <TableCell className="w-8 px-2">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="text-sm">{g.material}</TableCell>
                    <TableCell className="text-sm">{g.make}</TableCell>
                    <TableCell className="text-sm">{g.process}</TableCell>
                    <TableCell className="text-sm font-mono-num whitespace-nowrap">{formatDimensions(g.thickness, g.width, g.length, g.process)}</TableCell>
                    <TableCell className="text-sm">{g.coating}</TableCell>
                    <TableCell className="text-sm">{g.grade}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{g.totalQty.toFixed(2)}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{g.totalPcs}</TableCell>
                    <TableCell />
                  </TableRow>
                  {isOpen && g.items.map((item: any) => {
                    const availQty = getAvailableQty(item);
                    return (
                      <TableRow key={item.id} className="bg-background">
                        <TableCell />
                        <TableCell colSpan={2} className="text-xs"><span className="text-muted-foreground">Batch: </span><span className="font-medium">{getBatchNumber(item)}</span></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.process || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono-num whitespace-nowrap">{formatDimensions(item.thickness, item.width, item.length, item.process)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.coating || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.grade || '-'}</TableCell>
                        <TableCell className="text-xs font-mono-num">{availQty.toFixed(2)}</TableCell>
                        <TableCell className="text-xs font-mono-num">{item.num_pcs ?? '-'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 px-2" onClick={(e) => { e.stopPropagation(); setSaleDialog(item); }}>
                              <ShoppingCart className="h-3 w-3" /> Sale
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 px-2 text-destructive" onClick={(e) => { e.stopPropagation(); setDefectDialog(item); }}>
                              <AlertTriangle className="h-3 w-3" /> Defective
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Sale Dialog */}
      <Dialog open={!!saleDialog} onOpenChange={() => setSaleDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record FG Sale</DialogTitle>
          </DialogHeader>
          {saleDialog && (
            <div className="space-y-1 text-xs text-muted-foreground bg-muted/50 rounded p-2 mb-2">
              <p>Available Qty: <span className="font-semibold font-mono-num">{getAvailableQty(saleDialog).toFixed(2)} Kg</span></p>
            </div>
          )}
          <div className="space-y-3">
            <div><Label className="text-xs">Quantity (Kg)</Label><Input type="number" value={saleForm.quantity} onChange={e => setSaleForm(v => ({ ...v, quantity: e.target.value }))} /></div>
            <div>
              <Label className="text-xs">Customer Name</Label>
              <Select value={saleCustomerId} onValueChange={(v) => { setSaleCustomerId(v); setSaleForm(f => ({ ...f, order_id: '' })); }}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {(customers || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Order Number</Label>
              <Select value={saleForm.order_id} onValueChange={v => setSaleForm(f => ({ ...f, order_id: v }))} disabled={!saleCustomerId}>
                <SelectTrigger><SelectValue placeholder={saleCustomerId ? 'Select order' : 'Select customer first'} /></SelectTrigger>
                <SelectContent>
                  {filteredSaleOrders.map((o: any) => (
                    <SelectItem key={o.id} value={o.order_number}>{o.order_number}{o.po_number ? ` (PO: ${o.po_number})` : ''}</SelectItem>
                  ))}
                  {filteredSaleOrders.length === 0 && saleCustomerId && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No open orders</div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Invoice Number</Label><Input value={saleForm.invoice_number} onChange={e => setSaleForm(v => ({ ...v, invoice_number: e.target.value }))} /></div>
            <div><Label className="text-xs">Date</Label><Input type="date" value={saleForm.sales_date} onChange={e => setSaleForm(v => ({ ...v, sales_date: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaleDialog(null)}>Cancel</Button>
            <Button onClick={handleSaleSubmit} disabled={insertFGSale.isPending}>
              {insertFGSale.isPending ? 'Saving...' : 'Record Sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Defective Dialog */}
      <Dialog open={!!defectDialog} onOpenChange={() => setDefectDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record FG Defective</DialogTitle>
          </DialogHeader>
          {defectDialog && (
            <div className="space-y-1 text-xs text-muted-foreground bg-muted/50 rounded p-2 mb-2">
              <p>Available Qty: <span className="font-semibold font-mono-num">{getAvailableQty(defectDialog).toFixed(2)} Kg</span></p>
            </div>
          )}
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Defect Type</Label>
              <Select value={defectForm.defect_type} onValueChange={v => setDefectForm(f => ({ ...f, defect_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Select defect type" /></SelectTrigger>
                <SelectContent>
                  {DEFECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Quantity (Kg)</Label><Input type="number" value={defectForm.quantity} onChange={e => setDefectForm(v => ({ ...v, quantity: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDefectDialog(null)}>Cancel</Button>
            <Button onClick={handleDefectSubmit} disabled={insertFGDefective.isPending} variant="destructive">
              {insertFGDefective.isPending ? 'Saving...' : 'Record Defective'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
