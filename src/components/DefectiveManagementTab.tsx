import { useState, useMemo } from 'react';
import { useAllBatches, useAllActions, type InventoryAction } from '@/hooks/useBatches';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useDefectiveSales, useInsertDefectiveSale } from '@/hooks/useScrapSales';
import { useOrders } from '@/hooks/useOrders';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import OrderIdCombobox from '@/components/OrderIdCombobox';

import { ChevronDown, ChevronRight, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import { fmtNum } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface DefectiveDetail {
  id: string;
  source: 'coil' | 'fg' | 'wip';
  sourceLabel: string;
  skuKey: string;
  defectType: string;
  netWeight: number;
  createdAt: string;
  batchId: string;
}

interface SKUDefectiveGroup {
  skuKey: string;
  totalWeight: number;
  details: DefectiveDetail[];
}

export default function DefectiveManagementTab() {
  const { data: batches } = useAllBatches();
  const queryClient = useQueryClient();
  const { data: actions } = useAllActions();
  const { data: defSales } = useDefectiveSales();
  const { data: orders } = useOrders();
  const insertDefSale = useInsertDefectiveSale();
  const [sellDialog, setSellDialog] = useState<DefectiveDetail | null>(null);
  const [saleForm, setSaleForm] = useState({ order_id: '', invoice_number: '', sales_date: '', quantity: '' });
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  // FG defectives
  const { data: fgDefectives } = useQuery({
    queryKey: ['fg_defectives'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fg_defectives' as any).select('*, fg_items(*)');
      if (error) throw error;
      return data as any[];
    },
  });

  // WIP defectives
  const { data: wipDefectives } = useQuery({
    queryKey: ['wip_defectives'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wip_defectives' as any).select('*, wip_items(*)');
      if (error) throw error;
      return data as any[];
    },
  });

  const allActions = (actions as InventoryAction[]) || [];
  const defectiveActions = allActions.filter(a => a.action_type === 'defective');

  // Group all defective entries by SKU
  const skuGroups = useMemo(() => {
    const map = new Map<string, SKUDefectiveGroup>();

    const addToGroup = (skuKey: string, detail: DefectiveDetail) => {
      if (!map.has(skuKey)) map.set(skuKey, { skuKey, totalWeight: 0, details: [] });
      const g = map.get(skuKey)!;
      g.totalWeight += detail.netWeight;
      g.details.push(detail);
    };

    // Coil defectives
    defectiveActions.forEach(a => {
      const batch = (batches || []).find(b => b.id === a.batch_id);
      if (!batch) return;
      const skuKey = `${batch.material || '-'} | ${batch.thickness ?? '-'}x${batch.width ?? '-'} | ${batch.coating || '-'} | ${batch.grade || '-'}`;
      addToGroup(skuKey, {
        id: a.id,
        source: 'coil',
        sourceLabel: `Coil: ${batch.batch_number}`,
        skuKey,
        defectType: a.defect_type || 'Unknown',
        netWeight: a.net_weight || 0,
        createdAt: a.created_at,
        batchId: a.batch_id,
      });
    });

    // FG defectives
    (fgDefectives || []).forEach((d: any) => {
      const fgItem = d.fg_items;
      const skuKey = fgItem
        ? `${fgItem.material || '-'} | ${fgItem.thickness ?? '-'}x${fgItem.width ?? '-'}${fgItem.length ? `x${fgItem.length}` : ''} | ${fgItem.coating || '-'} | ${fgItem.grade || '-'}`
        : '-';
      addToGroup(skuKey, {
        id: d.id,
        source: 'fg',
        sourceLabel: fgItem ? `FG: ${fgItem.process || '-'}` : 'FG Item',
        skuKey,
        defectType: d.defect_type || 'Unknown',
        netWeight: d.quantity || 0,
        createdAt: d.created_at,
        batchId: d.fg_item_id,
      });
    });

    // WIP defectives
    (wipDefectives || []).forEach((d: any) => {
      const wipItem = d.wip_items;
      const skuKey = wipItem
        ? `${wipItem.material || '-'} | ${wipItem.thickness ?? '-'}x${wipItem.width ?? '-'}${wipItem.length ? `x${wipItem.length}` : ''} | ${wipItem.coating || '-'} | ${wipItem.grade || '-'}`
        : '-';
      addToGroup(skuKey, {
        id: d.id,
        source: 'wip',
        sourceLabel: wipItem ? `WIP: ${wipItem.process || '-'}` : 'WIP Item',
        skuKey,
        defectType: d.defect_type || 'Unknown',
        netWeight: d.quantity || 0,
        createdAt: d.created_at,
        batchId: d.wip_item_id,
      });
    });

    // Subtract sold from totals (coil defective sales)
    (defSales || []).forEach((s: any) => {
      if (s.batch_id && s.batches) {
        const batch = s.batches;
        const skuKey = `${batch.material || '-'} | ${batch.thickness ?? '-'}x${batch.width ?? '-'} | ${batch.coating || '-'} | ${batch.grade || '-'}`;
        if (map.has(skuKey)) {
          map.get(skuKey)!.totalWeight -= s.quantity || 0;
        }
      }
    });

    return Array.from(map.values())
      .filter(r => r.totalWeight > 0.01)
      .sort((a, b) => b.totalWeight - a.totalWeight);
  }, [defectiveActions, batches, fgDefectives, wipDefectives, defSales]);

  const grandTotal = useMemo(() => skuGroups.reduce((s, g) => s + g.totalWeight, 0), [skuGroups]);

  const handleSell = async () => {
    if (!sellDialog) return;
    try {
      await insertDefSale.mutateAsync({
        batch_id: sellDialog.source === 'coil' ? sellDialog.batchId : null,
        order_id: saleForm.order_id || null,
        invoice_number: saleForm.invoice_number || null,
        sales_date: saleForm.sales_date || null,
        quantity: saleForm.quantity ? Number(saleForm.quantity) : 0,
      });
      toast.success('Defective sale recorded');
      setSellDialog(null);
      setSaleForm({ order_id: '', invoice_number: '', sales_date: '', quantity: '' });
    } catch { toast.error('Failed'); }
  };

  const handleDownloadExcel = () => {
    const rows: { SKU: string; Source: string; 'Defect Type': string; 'Net Weight (Kg)': string; Date: string }[] = [];
    skuGroups.forEach(g => {
      g.details.forEach(d => {
        rows.push({
          SKU: d.skuKey,
          Source: d.source === 'coil' ? 'Coil' : d.source === 'fg' ? 'FG' : 'WIP',
          'Defect Type': d.defectType,
          'Net Weight (Kg)': d.netWeight.toFixed(2),
          Date: d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '',
        });
      });
    });
    if (rows.length === 0) { toast.info('No data to download'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Defective Material');
    XLSX.writeFile(wb, `defective_material_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Downloaded');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['batches'] }); queryClient.invalidateQueries({ queryKey: ['inventory_actions'] }); queryClient.invalidateQueries({ queryKey: ['defective_sales'] }); queryClient.invalidateQueries({ queryKey: ['fg_defectives'] }); queryClient.invalidateQueries({ queryKey: ['wip_defectives'] }); toast.success('Refreshed'); }} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2">
            <Download className="h-4 w-4" /> Download Excel
          </Button>
        </div>
        <div className="bg-primary/10 text-primary rounded-md px-3 py-1.5 text-sm font-semibold font-mono-num">
          Total Defective: {fmtNum(grandTotal)} Kg
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8"></TableHead>
              <TableHead className="text-xs font-semibold">SKU</TableHead>
              <TableHead className="text-xs font-semibold">Items</TableHead>
              <TableHead className="text-xs font-semibold">Total Qty (Kg)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skuGroups.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No defective material recorded.</TableCell></TableRow>
            )}
            {skuGroups.map(g => {
              const isExpanded = expandedSku === g.skuKey;
              return (
                <>
                  <TableRow key={g.skuKey} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedSku(isExpanded ? null : g.skuKey)}>
                    <TableCell>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="text-sm font-medium">{g.skuKey}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{g.details.length}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{fmtNum(g.totalWeight)}</TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${g.skuKey}-detail`}>
                      <TableCell colSpan={4} className="p-0">
                        <div className="bg-muted/10 border-t px-6 py-2">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Source</TableHead>
                                <TableHead className="text-xs">Defect Type</TableHead>
                                <TableHead className="text-xs">Qty (Kg)</TableHead>
                                <TableHead className="text-xs">Date</TableHead>
                                <TableHead className="text-xs">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {g.details.map((d) => (
                                <TableRow key={d.id}>
                                  <TableCell className="text-xs">{d.sourceLabel}</TableCell>
                                  <TableCell className="text-xs">{d.defectType}</TableCell>
                                  <TableCell className="text-xs font-mono-num">{d.netWeight.toFixed(2)}</TableCell>
                                  <TableCell className="text-xs">{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '-'}</TableCell>
                                  <TableCell>
                                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setSellDialog(d); }}>
                                      Sell
                                    </Button>
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
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Defective Sales History */}
      {defSales && defSales.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground">Sales History</h3>
          <div className="overflow-x-auto rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">Order ID</TableHead>
                  <TableHead className="text-xs font-semibold">Invoice</TableHead>
                  <TableHead className="text-xs font-semibold">Date</TableHead>
                  <TableHead className="text-xs font-semibold">Qty (Kg)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defSales.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{s.order_id || '-'}</TableCell>
                    <TableCell className="text-sm">{s.invoice_number || '-'}</TableCell>
                    <TableCell className="text-sm">{s.sales_date || '-'}</TableCell>
                    <TableCell className="text-sm font-mono-num">{s.quantity ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Sell Dialog */}
      <Dialog open={!!sellDialog} onOpenChange={() => setSellDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sell Defective Material</DialogTitle>
            {sellDialog && <p className="text-xs text-muted-foreground mt-1">SKU: {sellDialog.skuKey} | {sellDialog.defectType} | {sellDialog.source.toUpperCase()}</p>}
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Order ID</Label>
              <OrderIdCombobox
                value={saleForm.order_id}
                onChange={v => setSaleForm(f => ({ ...f, order_id: v }))}
                orders={(orders || []) as any[]}
              />
            </div>
            <div><Label className="text-xs">Invoice Number</Label><Input value={saleForm.invoice_number} onChange={e => setSaleForm(v => ({ ...v, invoice_number: e.target.value }))} /></div>
            <div><Label className="text-xs">Date</Label><Input type="date" value={saleForm.sales_date} onChange={e => setSaleForm(v => ({ ...v, sales_date: e.target.value }))} /></div>
            <div><Label className="text-xs">Quantity (Kg)</Label><Input type="number" value={saleForm.quantity} onChange={e => setSaleForm(v => ({ ...v, quantity: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSellDialog(null)}>Cancel</Button>
            <Button onClick={handleSell}>Record Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
