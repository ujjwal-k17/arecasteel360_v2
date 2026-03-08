import { useState } from 'react';
import { useAllBatches, useAllActions, getSKUKey, type Batch, type InventoryAction } from '@/hooks/useBatches';
import { useQueryClient } from '@tanstack/react-query';
import { useDefectiveSales, useInsertDefectiveSale } from '@/hooks/useScrapSales';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function DefectiveManagementTab() {
  const { data: batches } = useAllBatches();
  const { data: actions } = useAllActions();
  const { data: defSales } = useDefectiveSales();
  const insertDefSale = useInsertDefectiveSale();
  const [sellDialog, setSellDialog] = useState<{ skuKey: string; batchIds: string[] } | null>(null);
  const [saleForm, setSaleForm] = useState({ order_id: '', invoice_number: '', sales_date: '', quantity: '' });

  const allActions = (actions as InventoryAction[]) || [];
  const defectiveActions = allActions.filter(a => a.action_type === 'defective');

  // Aggregate defective by SKU
  const skuDefMap = new Map<string, { skuKey: string; totalWeight: number; batchIds: string[] }>();
  defectiveActions.forEach(a => {
    const batch = (batches || []).find(b => b.id === a.batch_id);
    if (!batch) return;
    const key = getSKUKey(batch);
    if (!skuDefMap.has(key)) skuDefMap.set(key, { skuKey: key, totalWeight: 0, batchIds: [] });
    const entry = skuDefMap.get(key)!;
    entry.totalWeight += a.net_weight || 0;
    if (!entry.batchIds.includes(a.batch_id)) entry.batchIds.push(a.batch_id);
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

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold">SKU</TableHead>
              <TableHead className="text-xs font-semibold">Defective Qty (Kg)</TableHead>
              <TableHead className="text-xs font-semibold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {defRows.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No defective material recorded.</TableCell></TableRow>
            )}
            {defRows.map(r => (
              <TableRow key={r.skuKey}>
                <TableCell className="text-sm font-medium">{r.skuKey}</TableCell>
                <TableCell className="text-sm font-mono-num font-semibold">{r.totalWeight.toFixed(2)}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setSellDialog(r)}>
                    Sell
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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
