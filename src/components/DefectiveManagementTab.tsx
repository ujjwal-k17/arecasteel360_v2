import { useState } from 'react';
import { useAllBatches, useAllActions, getSKUKey, type Batch, type InventoryAction } from '@/hooks/useBatches';
import { useQueryClient } from '@tanstack/react-query';
import { useDefectiveSales, useInsertDefectiveSale } from '@/hooks/useScrapSales';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface DefectiveBatchDetail {
  batchNumber: string;
  batchId: string;
  netWeight: number;
  defectType: string;
  createdAt: string;
}

export default function DefectiveManagementTab() {
  const { data: batches } = useAllBatches();
  const queryClient = useQueryClient();
  const { data: actions } = useAllActions();
  const { data: defSales } = useDefectiveSales();
  const insertDefSale = useInsertDefectiveSale();
  const [sellDialog, setSellDialog] = useState<{ skuKey: string; batchIds: string[] } | null>(null);
  const [saleForm, setSaleForm] = useState({ order_id: '', invoice_number: '', sales_date: '', quantity: '' });
  const [expandedSKU, setExpandedSKU] = useState<string | null>(null);

  const allActions = (actions as InventoryAction[]) || [];
  const defectiveActions = allActions.filter(a => a.action_type === 'defective');

  // Aggregate defective by SKU with batch details
  const skuDefMap = new Map<string, { skuKey: string; totalWeight: number; batchIds: string[]; batchDetails: DefectiveBatchDetail[] }>();
  defectiveActions.forEach(a => {
    const batch = (batches || []).find(b => b.id === a.batch_id);
    if (!batch) return;
    const key = getSKUKey(batch);
    if (!skuDefMap.has(key)) skuDefMap.set(key, { skuKey: key, totalWeight: 0, batchIds: [], batchDetails: [] });
    const entry = skuDefMap.get(key)!;
    entry.totalWeight += a.net_weight || 0;
    if (!entry.batchIds.includes(a.batch_id)) entry.batchIds.push(a.batch_id);
    entry.batchDetails.push({
      batchNumber: batch.batch_number,
      batchId: a.batch_id,
      netWeight: a.net_weight || 0,
      defectType: a.defect_type || '-',
      createdAt: a.created_at,
    });
  });

  // Subtract sold
  (defSales || []).forEach((s: any) => {
    if (s.batch_id && s.batches) {
      const key = getSKUKey(s.batches);
      if (skuDefMap.has(key)) {
        skuDefMap.get(key)!.totalWeight -= s.quantity || 0;
      }
    }
  });

  const defRows = Array.from(skuDefMap.values()).filter(r => r.totalWeight > 0);

  const handleSell = async () => {
    if (!sellDialog) return;
    try {
      await insertDefSale.mutateAsync({
        batch_id: sellDialog.batchIds[0] || null,
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
    const rows: { SKU: string; 'Batch Number': string; 'Defect Type': string; 'Net Weight (Kg)': string; Date: string }[] = [];
    defRows.forEach(r => {
      r.batchDetails.forEach(bd => {
        rows.push({
          SKU: r.skuKey,
          'Batch Number': bd.batchNumber,
          'Defect Type': bd.defectType,
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
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['batches'] }); queryClient.invalidateQueries({ queryKey: ['inventory_actions'] }); queryClient.invalidateQueries({ queryKey: ['defective_sales'] }); toast.success('Refreshed'); }} className="gap-2">
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
              <TableHead className="text-xs font-semibold">SKU</TableHead>
              <TableHead className="text-xs font-semibold">Defective Qty (Kg)</TableHead>
              <TableHead className="text-xs font-semibold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {defRows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No defective material recorded.</TableCell></TableRow>
            )}
            {defRows.map(r => {
              const isExpanded = expandedSKU === r.skuKey;
              return (
                <>
                  <TableRow key={r.skuKey} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedSKU(isExpanded ? null : r.skuKey)}>
                    <TableCell>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="text-sm font-medium">{r.skuKey}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold">{r.totalWeight.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setSellDialog(r); }}>
                        Sell
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${r.skuKey}-detail`}>
                      <TableCell colSpan={4} className="p-0">
                        <div className="bg-muted/10 border-t px-6 py-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Batch-wise details</p>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Batch No</TableHead>
                                <TableHead className="text-xs">Defect Type</TableHead>
                                <TableHead className="text-xs">Net Wt (Kg)</TableHead>
                                <TableHead className="text-xs">Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {r.batchDetails.map((bd, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-xs">{bd.batchNumber}</TableCell>
                                  <TableCell className="text-xs">{bd.defectType}</TableCell>
                                  <TableCell className="text-xs font-mono-num">{bd.netWeight.toFixed(2)}</TableCell>
                                  <TableCell className="text-xs">{bd.createdAt ? new Date(bd.createdAt).toLocaleDateString() : '-'}</TableCell>
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
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Order ID</Label><Input value={saleForm.order_id} onChange={e => setSaleForm(v => ({ ...v, order_id: e.target.value }))} /></div>
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
