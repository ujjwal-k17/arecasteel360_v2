import { useState } from 'react';
import { useAllActions } from '@/hooks/useBatches';
import { useQueryClient } from '@tanstack/react-query';
import { useScrapSales, useInsertScrapSale } from '@/hooks/useScrapSales';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function ScrapManagementTab() {
  const { data: actions } = useAllActions();
  const queryClient = useQueryClient();
  const { data: scrapSales } = useScrapSales();
  const insertScrapSale = useInsertScrapSale();
  const [sellDialog, setSellDialog] = useState<{ scrapType: string; material: string } | null>(null);
  const [saleForm, setSaleForm] = useState({ qty_sold: '', sales_date: '', amount_received: '' });

  // Aggregate scrap by type x material
  const scrapActions = (actions as any[] || []).filter((a: any) => a.action_type === 'scrap');
  const scrapMap = new Map<string, { scrapType: string; material: string; totalWeight: number }>();
  scrapActions.forEach((a: any) => {
    const material = a.batches?.material || 'Unknown';
    const key = `${a.scrap_type}|${material}`;
    if (!scrapMap.has(key)) scrapMap.set(key, { scrapType: a.scrap_type, material, totalWeight: 0 });
    scrapMap.get(key)!.totalWeight += a.net_weight || 0;
  });

  // Subtract sold scrap
  (scrapSales || []).forEach(s => {
    const key = `${s.scrap_type}|${s.material || 'Unknown'}`;
    if (scrapMap.has(key)) {
      scrapMap.get(key)!.totalWeight -= s.qty_sold || 0;
    }
  });

  const scrapRows = Array.from(scrapMap.values()).filter(r => r.totalWeight > 0);

  const handleSell = async () => {
    if (!sellDialog) return;
    try {
      await insertScrapSale.mutateAsync({
        scrap_type: sellDialog.scrapType,
        material: sellDialog.material,
        qty_sold: saleForm.qty_sold ? Number(saleForm.qty_sold) : 0,
        sales_date: saleForm.sales_date || null,
        amount_received: saleForm.amount_received ? Number(saleForm.amount_received) : 0,
        weight_slip_url: null,
      });
      toast.success('Scrap sale recorded');
      setSellDialog(null);
      setSaleForm({ qty_sold: '', sales_date: '', amount_received: '' });
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['inventory_actions'] }); queryClient.invalidateQueries({ queryKey: ['scrap_sales'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>
      <Tabs defaultValue="inventory">
      <TabsList>
        <TabsTrigger value="inventory">Scrap Inventory</TabsTrigger>
        <TabsTrigger value="sold">Sold Scrap</TabsTrigger>
      </TabsList>

      <TabsContent value="inventory" className="mt-4">
        <div className="overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Scrap Type</TableHead>
                <TableHead className="text-xs font-semibold">Material</TableHead>
                <TableHead className="text-xs font-semibold">Qty (Kg)</TableHead>
                <TableHead className="text-xs font-semibold">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scrapRows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No scrap data yet.</TableCell></TableRow>
              )}
              {scrapRows.map(r => (
                <TableRow key={`${r.scrapType}-${r.material}`}>
                  <TableCell className="text-sm">{r.scrapType}</TableCell>
                  <TableCell className="text-sm">{r.material}</TableCell>
                  <TableCell className="text-sm font-mono-num font-semibold">{r.totalWeight.toFixed(2)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setSellDialog({ scrapType: r.scrapType, material: r.material })}>
                      Sell
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="sold" className="mt-4">
        <div className="overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Scrap Type</TableHead>
                <TableHead className="text-xs font-semibold">Material</TableHead>
                <TableHead className="text-xs font-semibold">Qty Sold (Kg)</TableHead>
                <TableHead className="text-xs font-semibold">Sales Date</TableHead>
                <TableHead className="text-xs font-semibold">Amount Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!scrapSales || scrapSales.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No sold scrap records.</TableCell></TableRow>
              )}
              {scrapSales?.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm">{s.scrap_type}</TableCell>
                  <TableCell className="text-sm">{s.material || '-'}</TableCell>
                  <TableCell className="text-sm font-mono-num">{s.qty_sold ?? '-'}</TableCell>
                  <TableCell className="text-sm">{s.sales_date || '-'}</TableCell>
                  <TableCell className="text-sm font-mono-num">₹{s.amount_received ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {/* Sell Dialog */}
      <Dialog open={!!sellDialog} onOpenChange={() => setSellDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sell Scrap — {sellDialog?.scrapType}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Qty Sold (Net Weight Kg)</Label><Input type="number" value={saleForm.qty_sold} onChange={e => setSaleForm(v => ({ ...v, qty_sold: e.target.value }))} /></div>
            <div><Label className="text-xs">Sales Date</Label><Input type="date" value={saleForm.sales_date} onChange={e => setSaleForm(v => ({ ...v, sales_date: e.target.value }))} /></div>
            <div><Label className="text-xs">Amount Received (₹)</Label><Input type="number" value={saleForm.amount_received} onChange={e => setSaleForm(v => ({ ...v, amount_received: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSellDialog(null)}>Cancel</Button>
            <Button onClick={handleSell}>Record Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
    </div>
  );
}
