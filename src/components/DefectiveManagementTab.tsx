import { useState, useMemo } from 'react';
import { useAllBatches, useAllActions, getSKUKey, type Batch, type InventoryAction } from '@/hooks/useBatches';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface DefectiveBatchDetail {
  batchNumber: string;
  batchId: string;
  netWeight: number;
  defectType: string;
  createdAt: string;
  source: 'coil' | 'fg';
  skuKey: string;
}

export default function DefectiveManagementTab() {
  const { data: batches } = useAllBatches();
  const queryClient = useQueryClient();
  const { data: actions } = useAllActions();
  const { data: defSales } = useDefectiveSales();
  const { data: orders } = useOrders();
  const insertDefSale = useInsertDefectiveSale();
  const [sellDialog, setSellDialog] = useState<DefectiveBatchDetail | null>(null);
  const [saleForm, setSaleForm] = useState({ order_id: '', invoice_number: '', sales_date: '', quantity: '' });
  const [expandedType, setExpandedType] = useState<string | null>(null);

  // FG defectives
  const { data: fgDefectives } = useQuery({
    queryKey: ['fg_defectives'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fg_defectives' as any).select('*, fg_items(*)');
      if (error) throw error;
      return data as any[];
    },
  });

  const allActions = (actions as InventoryAction[]) || [];
  const defectiveActions = allActions.filter(a => a.action_type === 'defective');

  // Group all defective entries by defect type
  const defectTypeMap = useMemo(() => {
    const map = new Map<string, { defectType: string; totalWeight: number; batchIds: string[]; details: DefectiveBatchDetail[] }>();

    // Coil defectives
    defectiveActions.forEach(a => {
      const batch = (batches || []).find(b => b.id === a.batch_id);
      if (!batch) return;
      const defType = a.defect_type || 'Unknown';
      if (!map.has(defType)) map.set(defType, { defectType: defType, totalWeight: 0, batchIds: [], details: [] });
      const entry = map.get(defType)!;
      entry.totalWeight += a.net_weight || 0;
      if (!entry.batchIds.includes(a.batch_id)) entry.batchIds.push(a.batch_id);
      entry.details.push({
        batchNumber: batch.batch_number,
        batchId: a.batch_id,
        netWeight: a.net_weight || 0,
        defectType: defType,
        createdAt: a.created_at,
        source: 'coil',
        skuKey: getSKUKey(batch),
      });
    });

    // FG defectives
    (fgDefectives || []).forEach((d: any) => {
      const defType = d.defect_type || 'Unknown';
      if (!map.has(defType)) map.set(defType, { defectType: defType, totalWeight: 0, batchIds: [], details: [] });
      const entry = map.get(defType)!;
      entry.totalWeight += d.quantity || 0;
      const fgItem = d.fg_items;
      entry.details.push({
        batchNumber: fgItem ? `FG-${fgItem.process || ''}` : 'FG Item',
        batchId: d.fg_item_id,
        netWeight: d.quantity || 0,
        defectType: defType,
        createdAt: d.created_at,
        source: 'fg',
        skuKey: fgItem ? `${fgItem.material || '-'} | ${fgItem.thickness ?? '-'}x${fgItem.width ?? '-'}` : '-',
      });
    });

    // Subtract sold from coil defectives
    (defSales || []).forEach((s: any) => {
      if (s.batch_id && s.batches) {
        // Try to find defect type from the batch's defective actions
        const batchDefActions = defectiveActions.filter(a => a.batch_id === s.batch_id);
        if (batchDefActions.length > 0) {
          const defType = batchDefActions[0].defect_type || 'Unknown';
          if (map.has(defType)) {
            map.get(defType)!.totalWeight -= s.quantity || 0;
          }
        }
      }
    });

    return Array.from(map.values()).filter(r => r.totalWeight > 0.01);
  }, [defectiveActions, batches, fgDefectives, defSales]);

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
    const rows: { 'Defect Type': string; Source: string; SKU: string; 'Batch/Item': string; 'Net Weight (Kg)': string; Date: string }[] = [];
    defectTypeMap.forEach(r => {
      r.details.forEach(bd => {
        rows.push({
          'Defect Type': bd.defectType,
          Source: bd.source === 'coil' ? 'Coil' : 'FG',
          SKU: bd.skuKey,
          'Batch/Item': bd.batchNumber,
          'Net Weight (Kg)': bd.netWeight.toFixed(2),
          Date: bd.createdAt ? new Date(bd.createdAt).toLocaleDateString() : '',
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
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['batches'] }); queryClient.invalidateQueries({ queryKey: ['inventory_actions'] }); queryClient.invalidateQueries({ queryKey: ['defective_sales'] }); queryClient.invalidateQueries({ queryKey: ['fg_defectives'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2">
          <Download className="h-4 w-4" /> Download Excel
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8"></TableHead>
              <TableHead className="text-xs font-semibold">Defect Type</TableHead>
              <TableHead className="text-xs font-semibold">Total Qty (Kg)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {defectTypeMap.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No defective material recorded.</TableCell></TableRow>
            )}
            {defectTypeMap.map(r => {
              const isExpanded = expandedType === r.defectType;
              return (
                <>
                  <TableRow key={r.defectType} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedType(isExpanded ? null : r.defectType)}>
                    <TableCell>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="text-sm font-medium">{r.defectType}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{r.totalWeight.toFixed(2)}</TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${r.defectType}-detail`}>
                      <TableCell colSpan={3} className="p-0">
                        <div className="bg-muted/10 border-t px-6 py-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Details</p>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Source</TableHead>
                                <TableHead className="text-xs">Batch / Item</TableHead>
                                <TableHead className="text-xs">SKU</TableHead>
                                <TableHead className="text-xs">Net Wt (Kg)</TableHead>
                                <TableHead className="text-xs">Date</TableHead>
                                <TableHead className="text-xs">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {r.details.map((bd, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-xs">{bd.source === 'coil' ? 'Coil' : 'FG'}</TableCell>
                                  <TableCell className="text-xs">{bd.batchNumber}</TableCell>
                                  <TableCell className="text-xs">{bd.skuKey}</TableCell>
                                  <TableCell className="text-xs font-mono-num">{bd.netWeight.toFixed(2)}</TableCell>
                                  <TableCell className="text-xs">{bd.createdAt ? new Date(bd.createdAt).toLocaleDateString() : '-'}</TableCell>
                                  <TableCell>
                                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setSellDialog(bd); }}>
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
            {sellDialog && <p className="text-xs text-muted-foreground mt-1">SKU: {sellDialog.skuKey} | {sellDialog.defectType}</p>}
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
