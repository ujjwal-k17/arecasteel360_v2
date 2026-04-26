import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAllBatches, useAllActions, calcUsableBalanceQty, type InventoryAction } from '@/hooks/useBatches';
import { useWIPItems, useFGItems, useAllProcessingRecords } from '@/hooks/useProcessing';
import { useScrapSales } from '@/hooks/useScrapSales';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, Warehouse, Layers, CheckCircle, Trash2, AlertTriangle, Boxes, RefreshCw, ClipboardList, Truck, Factory } from 'lucide-react';
import { fmtNum } from '@/lib/utils';
import { toast } from 'sonner';

const fmt = (n: number) => fmtNum(n);
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-IN');

type AgeBucket = 0 | 1 | 2 | 3;
const BUCKET_LABELS = ['≤30 D', '31–60 D', '61–90 D', '>90 D'] as const;
function bucketOf(age: number | null): AgeBucket | null {
  if (age == null) return null;
  if (age <= 30) return 0;
  if (age <= 60) return 1;
  if (age <= 90) return 2;
  return 3;
}
type DrillItem = { id: string; ref: string; material: string; spec: string; qty: number; age: number };

// ----- helpers -----
function ageingDays(date: string | null | undefined): number | null {
  if (!date) return null;
  const pd = new Date(date);
  if (isNaN(pd.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - pd.getTime()) / 86400000));
}

function groupByMaterial<T>(items: T[], getMaterial: (i: T) => string, getQty: (i: T) => number) {
  const m = new Map<string, { material: string; qty: number; count: number }>();
  for (const it of items) {
    const mat = getMaterial(it) || '—';
    if (!m.has(mat)) m.set(mat, { material: mat, qty: 0, count: 0 });
    const g = m.get(mat)!;
    g.qty += getQty(it);
    g.count++;
  }
  return Array.from(m.values()).sort((a, b) => b.qty - a.qty);
}

export default function DashboardTab() {
  const queryClient = useQueryClient();
  const { data: batches } = useAllBatches();
  const { data: actions } = useAllActions();
  const { data: wipItems } = useWIPItems();
  const { data: fgItems } = useFGItems();
  const { data: scrapSales } = useScrapSales();
  const { data: processingRecords } = useAllProcessingRecords();

  const { data: palletPurchases } = useQuery({
    queryKey: ['pallet_purchases'],
    queryFn: async () => (await supabase.from('pallet_purchases').select('*')).data || [],
  });
  const { data: palletConsumptions } = useQuery({
    queryKey: ['pallet_consumptions'],
    queryFn: async () => (await supabase.from('pallet_consumptions').select('*')).data || [],
  });
  const { data: steelPalletPurchases } = useQuery({
    queryKey: ['steel_pallet_purchases'],
    queryFn: async () => (await supabase.from('steel_pallet_purchases' as any).select('*')).data || [],
  });
  const { data: steelPalletConsumptions } = useQuery({
    queryKey: ['steel_pallet_consumptions'],
    queryFn: async () => (await supabase.from('steel_pallet_consumptions' as any).select('*')).data || [],
  });
  const { data: fgSales } = useQuery({
    queryKey: ['fg_sales'],
    queryFn: async () => ((await supabase.from('fg_sales' as any).select('*')).data || []) as any[],
  });
  const { data: fgDefectives } = useQuery({
    queryKey: ['fg_defectives'],
    queryFn: async () => ((await supabase.from('fg_defectives' as any).select('*')).data || []) as any[],
  });
  const { data: wipDefectives } = useQuery({
    queryKey: ['wip_defectives'],
    queryFn: async () => ((await supabase.from('wip_defectives' as any).select('*')).data || []) as any[],
  });
  const { data: defectiveSales } = useQuery({
    queryKey: ['defective_sales'],
    queryFn: async () => ((await supabase.from('defective_sales').select('*')).data || []) as any[],
  });
  const { data: ordersData } = useQuery({
    queryKey: ['dashboard_orders'],
    queryFn: async () => ((await supabase.from('orders').select('*, customers(customer_type), order_items(net_weight)')).data || []) as any[],
  });
  const { data: dispatchesData } = useQuery({
    queryKey: ['dashboard_dispatches'],
    queryFn: async () => ((await supabase.from('order_dispatches').select('*')).data || []) as any[],
  });

  const refreshAll = () => {
    queryClient.invalidateQueries();
    toast.success('Dashboard refreshed');
  };

  const [drill, setDrill] = useState<{ stage: string; material: string; bucket: AgeBucket; items: DrillItem[] } | null>(null);

  const allBatches = batches || [];
  const allActions = (actions || []) as any[];
  const allActionsTyped = allActions as InventoryAction[];
  const allProcRecords = processingRecords || [];

  // ---------- In-Transit by Material ----------
  const inTransit = useMemo(() => {
    const list = allBatches.filter(b => b.status === 'in-transit');
    const byMat = groupByMaterial(list, b => b.material || '', b => b.net_weight || 0);
    const total = byMat.reduce((s, g) => s + g.qty, 0);
    const totalCount = list.length;
    return { byMat, total, totalCount };
  }, [allBatches]);

  // ---------- Coils by Material (with weighted avg ageing) ----------
  const coils = useMemo(() => {
    const received = allBatches.filter(b => b.status === 'received');
    const map = new Map<string, { material: string; qty: number; count: number; ageWeighted: number; ageBase: number; b0: number; b1: number; b2: number; b3: number }>();
    const items: DrillItem[] = [];
    let grandQty = 0, grandAgeW = 0, grandAgeBase = 0;

    for (const b of received) {
      const mat = b.material || '—';
      const usable = calcUsableBalanceQty(b, allActionsTyped, allProcRecords);
      if (usable <= 0) continue;
      const age = ageingDays(b.purchase_date);
      if (!map.has(mat)) map.set(mat, { material: mat, qty: 0, count: 0, ageWeighted: 0, ageBase: 0, b0: 0, b1: 0, b2: 0, b3: 0 });
      const g = map.get(mat)!;
      g.qty += usable;
      g.count++;
      grandQty += usable;
      if (age != null) {
        g.ageWeighted += age * usable;
        g.ageBase += usable;
        grandAgeW += age * usable;
        grandAgeBase += usable;
        if (age <= 30) g.b0 += usable;
        else if (age <= 60) g.b1 += usable;
        else if (age <= 90) g.b2 += usable;
        else g.b3 += usable;
        items.push({
          id: b.id,
          ref: b.batch_number || b.coil_number || '—',
          material: mat,
          spec: [b.thickness && `${b.thickness}mm`, b.width && `${b.width}mm`, b.coating, b.grade].filter(Boolean).join(' · '),
          qty: usable,
          age,
        });
      }
    }

    const byMat = Array.from(map.values())
      .map(g => ({ ...g, avgAge: g.ageBase > 0 ? g.ageWeighted / g.ageBase : 0 }))
      .sort((a, b) => b.qty - a.qty);
    const totalAvgAge = grandAgeBase > 0 ? grandAgeW / grandAgeBase : 0;
    return { byMat, total: grandQty, totalAvgAge, items };
  }, [allBatches, allActionsTyped, allProcRecords]);

  // ---------- WIP by Material (qty - defectives, active only) ----------
  const wip = useMemo(() => {
    const items = (wipItems || []).filter((i: any) => (i.status || 'active') === 'active');
    const wipDefByItem = new Map<string, number>();
    for (const d of (wipDefectives || [])) {
      wipDefByItem.set(d.wip_item_id, (wipDefByItem.get(d.wip_item_id) || 0) + (d.quantity || 0));
    }
    const map = new Map<string, { material: string; qty: number; count: number; ageWeighted: number; ageBase: number; b0: number; b1: number; b2: number; b3: number }>();
    const drill: DrillItem[] = [];
    let grandQty = 0, grandAgeW = 0, grandAgeBase = 0, totalCount = 0;
    for (const i of items as any[]) {
      const qty = Math.max(0, (i.qty || 0) - (wipDefByItem.get(i.id) || 0));
      if (qty <= 0) continue;
      const mat = i.material || '—';
      const age = ageingDays(i.created_at);
      if (!map.has(mat)) map.set(mat, { material: mat, qty: 0, count: 0, ageWeighted: 0, ageBase: 0, b0: 0, b1: 0, b2: 0, b3: 0 });
      const g = map.get(mat)!;
      g.qty += qty; g.count++; grandQty += qty; totalCount++;
      if (age != null) {
        g.ageWeighted += age * qty; g.ageBase += qty;
        grandAgeW += age * qty; grandAgeBase += qty;
        if (age <= 30) g.b0 += qty;
        else if (age <= 60) g.b1 += qty;
        else if (age <= 90) g.b2 += qty;
        else g.b3 += qty;
        drill.push({
          id: i.id,
          ref: i.process || 'WIP',
          material: mat,
          spec: [i.thickness && `${i.thickness}mm`, i.width && `${i.width}mm`, i.length && `${i.length}mm`, i.coating, i.grade].filter(Boolean).join(' · '),
          qty,
          age,
        });
      }
    }
    const byMat = Array.from(map.values())
      .map(g => ({ ...g, avgAge: g.ageBase > 0 ? g.ageWeighted / g.ageBase : 0 }))
      .sort((a, b) => b.qty - a.qty);
    const totalAvgAge = grandAgeBase > 0 ? grandAgeW / grandAgeBase : 0;
    return { byMat, total: grandQty, totalCount, totalAvgAge, items: drill };
  }, [wipItems, wipDefectives]);

  // ---------- FG by Material (qty - sold - defective) ----------
  const fg = useMemo(() => {
    const items = fgItems || [];
    const soldByItem = new Map<string, number>();
    for (const s of (fgSales || [])) {
      soldByItem.set(s.fg_item_id, (soldByItem.get(s.fg_item_id) || 0) + (s.quantity || 0));
    }
    const defByItem = new Map<string, number>();
    for (const d of (fgDefectives || [])) {
      defByItem.set(d.fg_item_id, (defByItem.get(d.fg_item_id) || 0) + (d.quantity || 0));
    }
    const map = new Map<string, { material: string; qty: number; count: number; ageWeighted: number; ageBase: number; b0: number; b1: number; b2: number; b3: number }>();
    const drill: DrillItem[] = [];
    let grandQty = 0, grandAgeW = 0, grandAgeBase = 0, totalCount = 0;
    for (const i of items as any[]) {
      const qty = Math.max(0, (i.qty || 0) - (soldByItem.get(i.id) || 0) - (defByItem.get(i.id) || 0));
      if (qty <= 0) continue;
      const mat = i.material || '—';
      const age = ageingDays(i.created_at);
      if (!map.has(mat)) map.set(mat, { material: mat, qty: 0, count: 0, ageWeighted: 0, ageBase: 0, b0: 0, b1: 0, b2: 0, b3: 0 });
      const g = map.get(mat)!;
      g.qty += qty; g.count++; grandQty += qty; totalCount++;
      if (age != null) {
        g.ageWeighted += age * qty; g.ageBase += qty;
        grandAgeW += age * qty; grandAgeBase += qty;
        if (age <= 30) g.b0 += qty;
        else if (age <= 60) g.b1 += qty;
        else if (age <= 90) g.b2 += qty;
        else g.b3 += qty;
        drill.push({
          id: i.id,
          ref: i.process || 'FG',
          material: mat,
          spec: [i.thickness && `${i.thickness}mm`, i.width && `${i.width}mm`, i.length && `${i.length}mm`, i.coating, i.grade].filter(Boolean).join(' · '),
          qty,
          age,
        });
      }
    }
    const byMat = Array.from(map.values())
      .map(g => ({ ...g, avgAge: g.ageBase > 0 ? g.ageWeighted / g.ageBase : 0 }))
      .sort((a, b) => b.qty - a.qty);
    const totalAvgAge = grandAgeBase > 0 ? grandAgeW / grandAgeBase : 0;
    return { byMat, total: grandQty, totalCount, totalAvgAge, items: drill };
  }, [fgItems, fgSales, fgDefectives]);

  // ---------- Scrap by Material (unsold) ----------
  const scrap = useMemo(() => {
    const scrapActions = allActions.filter((a: any) => a.action_type === 'scrap');
    const map = new Map<string, { material: string; qty: number; count: number }>();
    for (const a of scrapActions) {
      const mat = (a as any).batches?.material || '—';
      if (!map.has(mat)) map.set(mat, { material: mat, qty: 0, count: 0 });
      const g = map.get(mat)!;
      g.qty += a.net_weight || 0;
      g.count++;
    }
    for (const s of (scrapSales || [])) {
      const mat = s.material || '—';
      if (map.has(mat)) map.get(mat)!.qty -= s.qty_sold || 0;
    }
    const byMat = Array.from(map.values()).filter(r => r.qty > 0).sort((a, b) => b.qty - a.qty);
    return { byMat, total: byMat.reduce((s, g) => s + g.qty, 0) };
  }, [allActions, scrapSales]);

  // ---------- Defective by Material (Coil + WIP + FG defectives, minus defective sales) ----------
  const defective = useMemo(() => {
    const map = new Map<string, { material: string; qty: number; count: number }>();
    const add = (mat: string, qty: number) => {
      const m = mat || '—';
      if (!map.has(m)) map.set(m, { material: m, qty: 0, count: 0 });
      const g = map.get(m)!;
      g.qty += qty;
      g.count++;
    };
    // Coil-level defectives
    const defActions = allActions.filter((a: any) => a.action_type === 'defective');
    for (const a of defActions) add((a as any).batches?.material || '—', a.net_weight || 0);
    // WIP defectives
    const wipById = new Map((wipItems || []).map((w: any) => [w.id, w]));
    for (const d of (wipDefectives || [])) {
      const w: any = wipById.get(d.wip_item_id);
      if (w) add(w.material || '—', d.quantity || 0);
    }
    // FG defectives
    const fgById = new Map((fgItems || []).map((f: any) => [f.id, f]));
    for (const d of (fgDefectives || [])) {
      const f: any = fgById.get(d.fg_item_id);
      if (f) add(f.material || '—', d.quantity || 0);
    }
    // Subtract defective sales (matched by batch -> material)
    const batchById = new Map((batches || []).map((b: any) => [b.id, b]));
    for (const s of (defectiveSales || [])) {
      const b: any = batchById.get(s.batch_id);
      const mat = b?.material || '—';
      if (map.has(mat)) map.get(mat)!.qty -= s.quantity || 0;
    }
    const byMat = Array.from(map.values()).filter(r => r.qty > 0).sort((a, b) => b.qty - a.qty);
    return { byMat, total: byMat.reduce((s, g) => s + g.qty, 0) };
  }, [allActions, wipDefectives, fgDefectives, wipItems, fgItems, defectiveSales, batches]);

  // ---------- Consumables (Pallets) ----------
  const consumables = useMemo(() => {
    const calc = (purchases: any[], consumptions: any[]) => {
      const purP = (purchases || []).reduce((s, p) => s + (p.num_pcs || 0), 0);
      const purK = (purchases || []).reduce((s, p) => s + (p.weight_kg || 0), 0);
      const conP = (consumptions || []).reduce((s, c) => s + (c.num_pcs || 0), 0);
      const conK = (consumptions || []).reduce((s, c) => s + (c.weight_kg || 0), 0);
      return { stockPcs: purP - conP, stockKg: purK - conK, purchasedPcs: purP, purchasedKg: purK, consumedPcs: conP, consumedKg: conK };
    };
    return {
      wooden: calc(palletPurchases || [], palletConsumptions || []),
      steel: calc(steelPalletPurchases || [], steelPalletConsumptions || []),
    };
  }, [palletPurchases, palletConsumptions, steelPalletPurchases, steelPalletConsumptions]);

  return (
    <div className="space-y-6">
      {/* === Inventory by Material — 4 panels === */}
      <Section
        title="Inventory by Material"
        subtitle="Quantities (Kg) split across each stage"
        action={
          <Button variant="outline" size="sm" onClick={refreshAll} className="gap-2 h-8">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      >

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MaterialPanel
            icon={<Package className="h-4 w-4" />} title="In-Transit" tone="blue"
            rows={inTransit.byMat.map(g => ({ label: g.material, qty: g.qty, extra: `${g.count} coils` }))}
            total={inTransit.total} totalLabel={`${inTransit.totalCount} coils`}
          />
          <MaterialPanel
            icon={<Warehouse className="h-4 w-4" />} title="Coils Inventory" tone="indigo"
            rows={coils.byMat.map(g => ({ label: g.material, qty: g.qty, extra: `${g.count} coils`, age: g.avgAge }))}
            total={coils.total} totalLabel={`${coils.byMat.reduce((s, g) => s + g.count, 0)} coils`}
            avgAge={coils.totalAvgAge}
          />
          <MaterialPanel
            icon={<Layers className="h-4 w-4" />} title="WIP" tone="amber"
            rows={wip.byMat.map(g => ({ label: g.material, qty: g.qty, extra: `${g.count} items`, age: g.avgAge }))}
            total={wip.total} totalLabel={`${wip.totalCount} items`}
            avgAge={wip.totalAvgAge}
          />
          <MaterialPanel
            icon={<CheckCircle className="h-4 w-4" />} title="Finished Goods" tone="emerald"
            rows={fg.byMat.map(g => ({ label: g.material, qty: g.qty, extra: `${g.count} items`, age: g.avgAge }))}
            total={fg.total} totalLabel={`${fg.totalCount} items`}
            avgAge={fg.totalAvgAge}
          />
        </div>
      </Section>

      {/* === Ageing Sections === */}
      <Section title="Inventory Ageing" subtitle="Weighted avg ageing days by material (weighted on qty). Click a bucket count to see details.">
        <div className="space-y-4">
          <AgeingTable title="Coils" qtyLabel="Usable Qty (Kg)" countLabel="Coils" rows={coils.byMat} total={coils.total} totalAvgAge={coils.totalAvgAge} emptyMsg="No coils in inventory."
            onCellClick={(material, bucket) => setDrill({ stage: 'Coils', material, bucket, items: coils.items })} />
          <AgeingTable title="WIP" qtyLabel="Qty (Kg)" countLabel="Items" rows={wip.byMat} total={wip.total} totalAvgAge={wip.totalAvgAge} emptyMsg="No WIP items."
            onCellClick={(material, bucket) => setDrill({ stage: 'WIP', material, bucket, items: wip.items })} />
          <AgeingTable title="Finished Goods" qtyLabel="Qty (Kg)" countLabel="Items" rows={fg.byMat} total={fg.total} totalAvgAge={fg.totalAvgAge} emptyMsg="No FG items."
            onCellClick={(material, bucket) => setDrill({ stage: 'Finished Goods', material, bucket, items: fg.items })} />
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2">
          <LegendDot color="bg-emerald-500" label="≤30 D" />
          <LegendDot color="bg-yellow-400" label="31–60 D" />
          <LegendDot color="bg-amber-500" label="61–90 D" />
          <LegendDot color="bg-destructive" label="&gt;90 D" />
        </div>
      </Section>

      {/* === Scrap & Defective === */}
      <Section title="Scrap & Defective Stock" subtitle="Unsold quantities split by material">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MaterialPanel
            icon={<Trash2 className="h-4 w-4" />} title="Scrap Stock" tone="rose"
            rows={scrap.byMat.map(g => ({ label: g.material, qty: g.qty, extra: `${g.count} entries` }))}
            total={scrap.total} totalLabel="Unsold"
          />
          <MaterialPanel
            icon={<AlertTriangle className="h-4 w-4" />} title="Defective Stock" tone="orange"
            rows={defective.byMat.map(g => ({ label: g.material, qty: g.qty, extra: `${g.count} entries` }))}
            total={defective.total} totalLabel="Total"
          />
        </div>
      </Section>

      {/* === Consumables === */}
      <Section title="Consumables" subtitle="Pallet inventory and lifecycle">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConsumableCard
            icon={<Boxes className="h-4 w-4" />} title="Wooden Pallets" tone="amber"
            data={consumables.wooden}
          />
          <ConsumableCard
            icon={<Boxes className="h-4 w-4" />} title="Steel Pallets" tone="slate"
            data={consumables.steel}
          />
        </div>
      </Section>

      <DrillDialog drill={drill} onOpenChange={(open) => { if (!open) setDrill(null); }} />
    </div>
  );
}

function DrillDialog({ drill, onOpenChange }: { drill: { stage: string; material: string; bucket: AgeBucket; items: DrillItem[] } | null; onOpenChange: (open: boolean) => void }) {
  const filtered = useMemo(() => {
    if (!drill) return [];
    return drill.items
      .filter(it => it.material === drill.material && bucketOf(it.age) === drill.bucket)
      .sort((a, b) => b.age - a.age);
  }, [drill]);
  const totalQty = filtered.reduce((s, i) => s + i.qty, 0);
  return (
    <Dialog open={!!drill} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {drill ? `${drill.stage} · ${drill.material} · ${BUCKET_LABELS[drill.bucket]}` : ''}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} · {fmtNum(totalQty)} Kg total
          </p>
        </DialogHeader>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No items in this bucket.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Reference</TableHead>
                <TableHead className="text-xs">Specification</TableHead>
                <TableHead className="text-xs text-right">Qty (Kg)</TableHead>
                <TableHead className="text-xs text-right">Age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(it => (
                <TableRow key={it.id}>
                  <TableCell className="text-xs font-medium">{it.ref}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{it.spec || '—'}</TableCell>
                  <TableCell className="text-xs font-mono-num text-right">{fmtNum(it.qty)}</TableCell>
                  <TableCell className="text-xs font-mono-num text-right">{it.age} D</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============== Presentation Components ==============

const TONE_MAP: Record<string, { bg: string; ring: string; text: string; bar: string }> = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-950/30',       ring: 'ring-blue-200 dark:ring-blue-900',       text: 'text-blue-700 dark:text-blue-300',       bar: 'bg-blue-500' },
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-950/30',   ring: 'ring-indigo-200 dark:ring-indigo-900',   text: 'text-indigo-700 dark:text-indigo-300',   bar: 'bg-indigo-500' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-950/30',     ring: 'ring-amber-200 dark:ring-amber-900',     text: 'text-amber-700 dark:text-amber-300',     bar: 'bg-amber-500' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', ring: 'ring-emerald-200 dark:ring-emerald-900', text: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-950/30',       ring: 'ring-rose-200 dark:ring-rose-900',       text: 'text-rose-700 dark:text-rose-300',       bar: 'bg-rose-500' },
  orange:  { bg: 'bg-orange-50 dark:bg-orange-950/30',   ring: 'ring-orange-200 dark:ring-orange-900',   text: 'text-orange-700 dark:text-orange-300',   bar: 'bg-orange-500' },
  slate:   { bg: 'bg-slate-50 dark:bg-slate-950/30',     ring: 'ring-slate-200 dark:ring-slate-800',     text: 'text-slate-700 dark:text-slate-300',     bar: 'bg-slate-500' },
};

function Section({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MaterialPanel({ icon, title, tone, rows, total, totalLabel, avgAge }: {
  icon: React.ReactNode; title: string; tone: string;
  rows: { label: string; qty: number; extra?: string; age?: number }[];
  total: number; totalLabel?: string; avgAge?: number;
}) {
  const t = TONE_MAP[tone];
  const max = Math.max(1, ...rows.map(r => r.qty));
  return (
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col">
      <div className={`flex items-center gap-2 px-3.5 py-2.5 border-b ${t.bg}`}>
        <div className={t.text}>{icon}</div>
        <div className="flex-1">
          <p className={`text-xs font-bold uppercase tracking-wide ${t.text}`}>{title}</p>
          {avgAge != null && (
            <p className="text-[9px] text-muted-foreground mt-0.5">Avg ageing: <span className="font-mono-num font-semibold text-foreground">{Math.round(avgAge)} D</span></p>
          )}
        </div>
        <div className="text-right">
          <p className="text-base font-bold font-mono-num leading-none">{fmt(total)}</p>
          <p className="text-[9px] text-muted-foreground">Kg</p>
        </div>
      </div>
      <div className="p-3 space-y-1.5 flex-1">
        {rows.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-3">No data</p>
        )}
        {rows.map(r => (
          <div key={r.label}>
            <div className="flex justify-between items-baseline mb-0.5">
              <span className="text-xs font-medium truncate">{r.label}</span>
              <div className="text-right">
                <span className="text-xs font-mono-num font-semibold">{fmt(r.qty)}</span>
                {r.extra && <span className="text-[9px] text-muted-foreground ml-1">· {r.extra}</span>}
                {r.age != null && <span className="text-[9px] text-muted-foreground ml-1">· {Math.round(r.age)} D</span>}
              </div>
            </div>
            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${t.bar}`} style={{ width: `${(r.qty / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      {rows.length > 0 && totalLabel && (
        <div className="px-3 py-1.5 bg-muted/20 border-t text-[10px] text-muted-foreground text-right">
          {totalLabel}
        </div>
      )}
    </div>
  );
}

function ConsumableCard({ icon, title, tone, data }: {
  icon: React.ReactNode; title: string; tone: string;
  data: { stockPcs: number; stockKg: number; purchasedPcs: number; purchasedKg: number; consumedPcs: number; consumedKg: number };
}) {
  const t = TONE_MAP[tone];
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className={`flex items-center gap-2 px-3.5 py-2.5 border-b ${t.bg}`}>
        <div className={t.text}>{icon}</div>
        <p className={`text-xs font-bold uppercase tracking-wide ${t.text} flex-1`}>{title}</p>
      </div>
      <div className="grid grid-cols-3 divide-x">
        <ConsumableMetric label="In Stock" pcs={data.stockPcs} kg={data.stockKg} highlight />
        <ConsumableMetric label="Purchased" pcs={data.purchasedPcs} kg={data.purchasedKg} />
        <ConsumableMetric label="Consumed" pcs={data.consumedPcs} kg={data.consumedKg} />
      </div>
    </div>
  );
}

function ConsumableMetric({ label, pcs, kg, highlight }: { label: string; pcs: number; kg: number; highlight?: boolean }) {
  return (
    <div className={`p-3 text-center ${highlight ? 'bg-muted/30' : ''}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className="text-base font-bold font-mono-num leading-none">{fmtInt(pcs)}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">pcs</p>
      <p className="text-[11px] font-mono-num font-semibold mt-1 text-muted-foreground">{fmt(kg)} Kg</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span dangerouslySetInnerHTML={{ __html: label }} />
    </span>
  );
}

function AgeingTable({ title, qtyLabel, countLabel, rows, total, totalAvgAge, emptyMsg, onCellClick }: {
  title: string;
  qtyLabel: string;
  countLabel: string;
  rows: { material: string; qty: number; count: number; avgAge: number; b0: number; b1: number; b2: number; b3: number }[];
  total: number;
  totalAvgAge: number;
  emptyMsg: string;
  onCellClick?: (material: string, bucket: AgeBucket) => void;
}) {
  const totalCount = rows.reduce((s, g) => s + g.count, 0);
  const tot = rows.reduce(
    (s, g) => ({ b0: s.b0 + g.b0, b1: s.b1 + g.b1, b2: s.b2 + g.b2, b3: s.b3 + g.b3 }),
    { b0: 0, b1: 0, b2: 0, b3: 0 }
  );
  const renderClickable = (material: string, bucket: AgeBucket, value: number, colorClass: string) => {
    if (value <= 0) return <span className="text-muted-foreground">—</span>;
    if (!onCellClick) return <span className={colorClass}>{fmtNum(value)}</span>;
    return (
      <button
        type="button"
        onClick={() => onCellClick(material, bucket)}
        className={`${colorClass} underline-offset-2 hover:underline cursor-pointer font-semibold`}
      >
        {fmtNum(value)}
      </button>
    );
  };
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-3 py-2 bg-muted/40 border-b flex items-center justify-between gap-3">
        <h4 className="text-xs font-bold uppercase tracking-wide">{title}</h4>
        {rows.length > 0 && (
          <div className="text-[11px] text-muted-foreground">
            Wtd. avg ageing: <span className="font-mono-num font-semibold text-foreground">{Math.round(totalAvgAge)} D</span>
          </div>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/20">
            <TableHead className="text-[11px] font-semibold">Material</TableHead>
            <TableHead className="text-[11px] font-semibold text-right">{qtyLabel}</TableHead>
            <TableHead className="text-[11px] font-semibold text-right">{countLabel}</TableHead>
            <TableHead className="text-[11px] font-semibold text-right">Avg Ageing</TableHead>
            <TableHead className="text-[11px] font-semibold text-right">≤30 D</TableHead>
            <TableHead className="text-[11px] font-semibold text-right">31–60 D</TableHead>
            <TableHead className="text-[11px] font-semibold text-right">61–90 D</TableHead>
            <TableHead className="text-[11px] font-semibold text-right">&gt;90 D</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground text-xs py-6">{emptyMsg}</TableCell></TableRow>
          )}
          {rows.map(g => (
            <TableRow key={g.material}>
              <TableCell className="text-xs font-medium">{g.material}</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{fmtNum(g.qty)}</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{g.count}</TableCell>
              <TableCell className="text-xs font-mono-num font-semibold text-right">{Math.round(g.avgAge)} D</TableCell>
              <TableCell className="text-xs font-mono-num text-right text-emerald-600 dark:text-emerald-400">{g.b0 > 0 ? fmtNum(g.b0) : '—'}</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{renderClickable(g.material, 1, g.b1, 'text-yellow-600 dark:text-yellow-400')}</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{renderClickable(g.material, 2, g.b2, 'text-amber-600 dark:text-amber-400')}</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{renderClickable(g.material, 3, g.b3, 'text-destructive')}</TableCell>
            </TableRow>
          ))}
          {rows.length > 0 && (
            <TableRow className="bg-muted/30 font-bold border-t-2">
              <TableCell className="text-xs">Total</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{fmtNum(total)}</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{totalCount}</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{Math.round(totalAvgAge)} D</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{tot.b0 > 0 ? fmtNum(tot.b0) : '—'}</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{tot.b1 > 0 ? fmtNum(tot.b1) : '—'}</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{tot.b2 > 0 ? fmtNum(tot.b2) : '—'}</TableCell>
              <TableCell className="text-xs font-mono-num text-right">{tot.b3 > 0 ? fmtNum(tot.b3) : '—'}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
