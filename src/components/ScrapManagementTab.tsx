import { useState } from 'react';
import { useAllActions } from '@/hooks/useBatches';
import { useQueryClient } from '@tanstack/react-query';
import { useScrapSales, useInsertScrapSale } from '@/hooks/useScrapSales';
import { useInsertCashEntry } from '@/hooks/useCashBook';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import { ChevronDown, ChevronRight, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ScrapBatchDetail {
  batchNumber: string;
  material: string;
  scrapType: string;
  netWeight: number;
  createdAt: string;
}

export default function ScrapManagementTab() {
  const { data: actions } = useAllActions();
  const queryClient = useQueryClient();
  const { data: scrapSales } = useScrapSales();
  const insertScrapSale = useInsertScrapSale();
  const insertCash = useInsertCashEntry();
  const [sellDialog, setSellDialog] = useState<{ scrapType: string; material: string } | null>(null);
  const [saleForm, setSaleForm] = useState<{ qty_sold: string; sales_date: string; amount_received: string; sales_type: 'Cash' | 'Invoice'; invoice_number: string; buyer_name: string }>({ qty_sold: '', sales_date: '', amount_received: '', sales_type: 'Invoice', invoice_number: '', buyer_name: '' });
  const [expandedScrapKey, setExpandedScrapKey] = useState<string | null>(null);
  const [expandedMaterialKey, setExpandedMaterialKey] = useState<string | null>(null);
  const [expandedSoldKey, setExpandedSoldKey] = useState<string | null>(null);

  const scrapActions = (actions as any[] || []).filter((a: any) => a.action_type === 'scrap');

  // Group by scrap_type → material → batches
  const typeMap = new Map<string, { scrapType: string; totalWeight: number; materials: Map<string, { material: string; totalWeight: number; batches: ScrapBatchDetail[] }> }>();
  scrapActions.forEach((a: any) => {
    const material = a.batches?.material || 'Unknown';
    const scrapType = a.scrap_type;
    if (!typeMap.has(scrapType)) typeMap.set(scrapType, { scrapType, totalWeight: 0, materials: new Map() });
    const t = typeMap.get(scrapType)!;
    if (!t.materials.has(material)) t.materials.set(material, { material, totalWeight: 0, batches: [] });
    const m = t.materials.get(material)!;
    const wt = a.net_weight || 0;
    m.totalWeight += wt;
    t.totalWeight += wt;
    m.batches.push({
      batchNumber: a.batches?.batch_number || 'N/A',
      material,
      scrapType,
      netWeight: wt,
      createdAt: a.created_at,
    });
  });

  // Subtract sold quantities from material totals
  (scrapSales || []).forEach(s => {
    const t = typeMap.get(s.scrap_type);
    if (!t) return;
    const m = t.materials.get(s.material || 'Unknown');
    if (!m) return;
    const sold = s.qty_sold || 0;
    m.totalWeight -= sold;
    t.totalWeight -= sold;
  });

  const scrapTypeRows = Array.from(typeMap.values())
    .map(t => ({
      ...t,
      materialList: Array.from(t.materials.values()).filter(m => m.totalWeight > 0),
    }))
    .filter(t => t.materialList.length > 0);

  const soldGroupMap = new Map<string, { scrapType: string; material: string; totalQty: number; totalAmount: number; sales: typeof scrapSales }>();
  (scrapSales || []).forEach(s => {
    const key = `${s.scrap_type}|${s.material || 'Unknown'}`;
    if (!soldGroupMap.has(key)) soldGroupMap.set(key, { scrapType: s.scrap_type, material: s.material || 'Unknown', totalQty: 0, totalAmount: 0, sales: [] });
    const entry = soldGroupMap.get(key)!;
    entry.totalQty += s.qty_sold || 0;
    entry.totalAmount += s.amount_received || 0;
    (entry.sales as any[]).push(s);
  });
  const soldGroups = Array.from(soldGroupMap.values());

  const handleSell = async () => {
    if (!sellDialog) return;
    if (saleForm.sales_type === 'Cash' && !saleForm.buyer_name.trim()) { toast.error('Buyer name is required for Cash sale'); return; }
    if (saleForm.sales_type === 'Invoice' && !saleForm.invoice_number.trim()) { toast.error('Invoice number is required'); return; }
    try {
      const sale = await insertScrapSale.mutateAsync({
        scrap_type: sellDialog.scrapType,
        material: sellDialog.material,
        qty_sold: saleForm.qty_sold ? Number(saleForm.qty_sold) : 0,
        sales_date: saleForm.sales_date || null,
        amount_received: saleForm.amount_received ? Number(saleForm.amount_received) : 0,
        sales_type: saleForm.sales_type.toLowerCase(),
        invoice_number: saleForm.sales_type === 'Invoice' ? saleForm.invoice_number : null,
        buyer_name: saleForm.sales_type === 'Cash' ? saleForm.buyer_name : null,
        weight_slip_url: null,
      } as any);
      // If Cash, push to Cash In > Receivable
      if (saleForm.sales_type === 'Cash' && Number(saleForm.amount_received) > 0) {
        await insertCash.mutateAsync({
          direction: 'in',
          status: 'receivable',
          entry_date: saleForm.sales_date || new Date().toISOString().slice(0, 10),
          amount: Number(saleForm.amount_received),
          debtor_name: saleForm.buyer_name,
          category: 'Scrap Sales',
          sub_category: sellDialog.scrapType,
          comments: `${sellDialog.material} · ${saleForm.qty_sold} Kg`,
          source_type: 'scrap_sale',
          source_id: (sale as any)?.id || null,
        } as any);
      }
      toast.success('Scrap sale recorded');
      setSellDialog(null);
      setSaleForm({ qty_sold: '', sales_date: '', amount_received: '', sales_type: 'Invoice', invoice_number: '', buyer_name: '' });
    } catch (e: any) { console.error('Scrap sale failed:', e); toast.error(e?.message || 'Failed to record sale'); }
  };

  const handleDownloadScrapInventory = () => {
    const allBatchDetails: { 'Scrap Type': string; 'Batch Number': string; 'Material': string; 'Net Weight (Kg)': string; 'Date': string }[] = [];
    scrapTypeRows.forEach(t => {
      t.materialList.forEach(m => {
        m.batches.forEach(bd => {
          allBatchDetails.push({
            'Scrap Type': bd.scrapType,
            'Batch Number': bd.batchNumber,
            'Material': bd.material,
            'Net Weight (Kg)': bd.netWeight.toFixed(2),
            'Date': bd.createdAt ? new Date(bd.createdAt).toLocaleDateString() : '',
          });
        });
      });
    });
    if (allBatchDetails.length === 0) { toast.info('No data to download'); return; }
    const ws = XLSX.utils.json_to_sheet(allBatchDetails);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scrap Inventory');
    XLSX.writeFile(wb, `scrap_inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Downloaded');
  };

  const handleDownloadSoldScrap = () => {
    const rows: { 'Scrap Type': string; 'Material': string; 'Qty Sold (Kg)': string; 'Date': string; 'Amount (₹)': string }[] = [];
    soldGroups.forEach(g => {
      (g.sales as any[]).forEach((s: any) => {
        rows.push({
          'Scrap Type': g.scrapType,
          'Material': g.material,
          'Qty Sold (Kg)': (s.qty_sold ?? 0).toFixed(2),
          'Date': s.sales_date || '',
          'Amount (₹)': (s.amount_received ?? 0).toFixed(2),
        });
      });
    });
    if (rows.length === 0) { toast.info('No data to download'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sold Scrap');
    XLSX.writeFile(wb, `sold_scrap_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Downloaded');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['inventory_actions'] }); queryClient.invalidateQueries({ queryKey: ['scrap_sales'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>
      <Tabs defaultValue="inventory">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="inventory" className="flex-1 sm:flex-none">Scrap Inventory</TabsTrigger>
          <TabsTrigger value="sold" className="flex-1 sm:flex-none">Sold Scrap</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Button variant="outline" size="sm" onClick={handleDownloadScrapInventory} className="gap-2">
              <Download className="h-4 w-4" /> Download Excel
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="text-xs font-semibold">Scrap Type</TableHead>
                  <TableHead className="text-xs font-semibold">Materials</TableHead>
                  <TableHead className="text-xs font-semibold">Total Qty (Kg)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scrapTypeRows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No scrap data yet.</TableCell></TableRow>
                )}
                {scrapTypeRows.map(t => {
                  const key = t.scrapType;
                  const isExpanded = expandedScrapKey === key;
                  return (
                    <>
                      <TableRow key={key} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedScrapKey(isExpanded ? null : key)}>
                        <TableCell>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                        <TableCell className="text-sm font-semibold">{t.scrapType}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.materialList.length} material{t.materialList.length !== 1 ? 's' : ''}</TableCell>
                        <TableCell className="text-sm font-mono-num font-semibold">{t.totalWeight.toFixed(2)}</TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${key}-detail`}>
                          <TableCell colSpan={4} className="p-0">
                            <div className="bg-muted/10 border-t px-6 py-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">Material-wise breakdown</p>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-8"></TableHead>
                                    <TableHead className="text-xs">Material</TableHead>
                                    <TableHead className="text-xs">Qty (Kg)</TableHead>
                                    <TableHead className="text-xs">Action</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {t.materialList.map(m => {
                                    const mKey = `${t.scrapType}|${m.material}`;
                                    const mExpanded = expandedMaterialKey === mKey;
                                    return (
                                      <>
                                        <TableRow key={mKey} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedMaterialKey(mExpanded ? null : mKey)}>
                                          <TableCell>{mExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                                          <TableCell className="text-xs">{m.material}</TableCell>
                                          <TableCell className="text-xs font-mono-num font-semibold">{m.totalWeight.toFixed(2)}</TableCell>
                                          <TableCell>
                                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setSellDialog({ scrapType: t.scrapType, material: m.material }); }}>Sell</Button>
                                          </TableCell>
                                        </TableRow>
                                        {mExpanded && (
                                          <TableRow key={`${mKey}-batches`}>
                                            <TableCell colSpan={4} className="p-0">
                                              <div className="bg-background border-t px-6 py-2">
                                                <p className="text-xs font-semibold text-muted-foreground mb-1">Batch-wise details</p>
                                                <Table>
                                                  <TableHeader>
                                                    <TableRow>
                                                      <TableHead className="text-xs">Batch No</TableHead>
                                                      <TableHead className="text-xs">Net Wt (Kg)</TableHead>
                                                      <TableHead className="text-xs">Date</TableHead>
                                                    </TableRow>
                                                  </TableHeader>
                                                  <TableBody>
                                                    {m.batches.map((bd, i) => (
                                                      <TableRow key={i}>
                                                        <TableCell className="text-xs">{bd.batchNumber}</TableCell>
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
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="sold" className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Button variant="outline" size="sm" onClick={handleDownloadSoldScrap} className="gap-2">
              <Download className="h-4 w-4" /> Download Excel
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="text-xs font-semibold">Scrap Type</TableHead>
                  <TableHead className="text-xs font-semibold">Material</TableHead>
                  <TableHead className="text-xs font-semibold">Total Qty Sold (Kg)</TableHead>
                  <TableHead className="text-xs font-semibold">Total Amount (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {soldGroups.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No sold scrap records.</TableCell></TableRow>
                )}
                {soldGroups.map(g => {
                  const key = `${g.scrapType}|${g.material}`;
                  const isExpanded = expandedSoldKey === key;
                  return (
                    <>
                      <TableRow key={key} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedSoldKey(isExpanded ? null : key)}>
                        <TableCell>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                        <TableCell className="text-sm">{g.scrapType}</TableCell>
                        <TableCell className="text-sm">{g.material}</TableCell>
                        <TableCell className="text-sm font-mono-num font-semibold">{g.totalQty.toFixed(2)}</TableCell>
                        <TableCell className="text-sm font-mono-num font-semibold">₹{g.totalAmount.toFixed(2)}</TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${key}-detail`}>
                          <TableCell colSpan={5} className="p-0">
                            <div className="bg-muted/10 border-t px-6 py-2">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">Date-wise sales</p>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Sales Date</TableHead>
                                    <TableHead className="text-xs">Qty Sold (Kg)</TableHead>
                                    <TableHead className="text-xs">Amount (₹)</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(g.sales as any[]).sort((a: any, b: any) => (b.sales_date || '').localeCompare(a.sales_date || '')).map((s: any) => (
                                    <TableRow key={s.id}>
                                      <TableCell className="text-xs">{s.sales_date || '-'}</TableCell>
                                      <TableCell className="text-xs font-mono-num">{s.qty_sold ?? '-'}</TableCell>
                                      <TableCell className="text-xs font-mono-num">₹{s.amount_received ?? '-'}</TableCell>
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
        </TabsContent>

        {/* Sell Dialog */}
        <Dialog open={!!sellDialog} onOpenChange={() => setSellDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Sell Scrap — {sellDialog?.scrapType} ({sellDialog?.material})</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Qty Sold (Net Weight Kg)</Label><Input type="number" value={saleForm.qty_sold} onChange={e => setSaleForm(v => ({ ...v, qty_sold: e.target.value }))} /></div>
              <div><Label className="text-xs">Sales Date</Label><Input type="date" value={saleForm.sales_date} onChange={e => setSaleForm(v => ({ ...v, sales_date: e.target.value }))} /></div>
              <div><Label className="text-xs">Amount Received (₹)</Label><Input type="number" value={saleForm.amount_received} onChange={e => setSaleForm(v => ({ ...v, amount_received: e.target.value }))} /></div>
              <div>
                <Label className="text-xs">Sales Type</Label>
                <Select value={saleForm.sales_type} onValueChange={(v: 'Cash' | 'Invoice') => setSaleForm(s => ({ ...s, sales_type: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Invoice">Invoice</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {saleForm.sales_type === 'Invoice' ? (
                <div><Label className="text-xs">Invoice Number</Label><Input value={saleForm.invoice_number} onChange={e => setSaleForm(v => ({ ...v, invoice_number: e.target.value }))} /></div>
              ) : (
                <div><Label className="text-xs">Buyer Name <span className="text-destructive">*</span></Label><Input value={saleForm.buyer_name} onChange={e => setSaleForm(v => ({ ...v, buyer_name: e.target.value }))} placeholder="Required" /></div>
              )}
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
