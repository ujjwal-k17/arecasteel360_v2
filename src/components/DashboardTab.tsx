import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAllBatches, useAllActions, calcUsableBalanceQty, type InventoryAction } from '@/hooks/useBatches';
import { useWIPItems, useFGItems, useAllProcessingRecords } from '@/hooks/useProcessing';
import { useScrapSales } from '@/hooks/useScrapSales';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Package, Warehouse, Layers, CheckCircle, Trash2, AlertTriangle, Boxes, Clock, RefreshCw } from 'lucide-react';
import { fmtNum } from '@/lib/utils';
import { toast } from 'sonner';

const fmt = (n: number) => fmtNum(n);
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-IN');

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

  const refreshAll = () => {
    queryClient.invalidateQueries();
    toast.success('Dashboard refreshed');
  };

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
    const map = new Map<string, { material: string; qty: number; count: number; ageWeighted: number; ageBase: number }>();
    let grandQty = 0, grandAgeW = 0, grandAgeBase = 0;

    for (const b of received) {
      const mat = b.material || '—';
      const usable = calcUsableBalanceQty(b, allActionsTyped, allProcRecords);
      if (usable <= 0) continue;
      const age = ageingDays(b.purchase_date);
      if (!map.has(mat)) map.set(mat, { material: mat, qty: 0, count: 0, ageWeighted: 0, ageBase: 0 });
      const g = map.get(mat)!;
      g.qty += usable;
      g.count++;
      grandQty += usable;
      if (age != null) {
        g.ageWeighted += age * usable;
        g.ageBase += usable;
        grandAgeW += age * usable;
        grandAgeBase += usable;
      }
    }

    const byMat = Array.from(map.values())
      .map(g => ({ ...g, avgAge: g.ageBase > 0 ? g.ageWeighted / g.ageBase : 0 }))
      .sort((a, b) => b.qty - a.qty);
    const totalAvgAge = grandAgeBase > 0 ? grandAgeW / grandAgeBase : 0;
    return { byMat, total: grandQty, totalAvgAge };
  }, [allBatches, allActionsTyped, allProcRecords]);

  // ---------- WIP by Material (qty - defectives, active only) ----------
  const wip = useMemo(() => {
    const items = (wipItems || []).filter((i: any) => (i.status || 'active') === 'active');
    const wipDefByItem = new Map<string, number>();
    for (const d of (wipDefectives || [])) {
      wipDefByItem.set(d.wip_item_id, (wipDefByItem.get(d.wip_item_id) || 0) + (d.quantity || 0));
    }
    const enriched = items.map((i: any) => ({
      material: i.material || '—',
      qty: Math.max(0, (i.qty || 0) - (wipDefByItem.get(i.id) || 0)),
    })).filter(i => i.qty > 0);
    const byMat = groupByMaterial(enriched, i => i.material, i => i.qty);
    return { byMat, total: byMat.reduce((s, g) => s + g.qty, 0), totalCount: enriched.length };
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
    const enriched = items.map((i: any) => ({
      material: i.material || '—',
      qty: Math.max(0, (i.qty || 0) - (soldByItem.get(i.id) || 0) - (defByItem.get(i.id) || 0)),
    })).filter(i => i.qty > 0);
    const byMat = groupByMaterial(enriched, i => i.material, i => i.qty);
    return { byMat, total: byMat.reduce((s, g) => s + g.qty, 0), totalCount: enriched.length };
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
      {/* === Executive Summary Header === */}
      <div className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Inventory Snapshot</h2>
            <p className="text-xs text-muted-foreground">As of {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Coils Avg Ageing:</span>
              <span className="font-bold font-mono-num">{Math.round(coils.totalAvgAge)} days</span>
            </div>
            <Button variant="outline" size="sm" onClick={refreshAll} className="gap-2 h-8">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={<Package className="h-4 w-4" />} label="In-Transit" value={fmt(inTransit.total)} unit="Kg" sub={`${inTransit.totalCount} coils`} tone="blue" />
          <KpiCard icon={<Warehouse className="h-4 w-4" />} label="Coils Inventory" value={fmt(coils.total)} unit="Kg" sub={`${coils.byMat.reduce((s, g) => s + g.count, 0)} coils`} tone="indigo" />
          <KpiCard icon={<Layers className="h-4 w-4" />} label="WIP" value={fmt(wip.total)} unit="Kg" sub={`${wip.totalCount} items`} tone="amber" />
          <KpiCard icon={<CheckCircle className="h-4 w-4" />} label="Finished Goods" value={fmt(fg.total)} unit="Kg" sub={`${fg.totalCount} items`} tone="emerald" />
        </div>
      </div>

      {/* === Inventory by Material — 4 panels === */}
      <Section title="Inventory by Material" subtitle="Quantities (Kg) split across each stage">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MaterialPanel
            icon={<Package className="h-4 w-4" />} title="In-Transit" tone="blue"
            rows={inTransit.byMat.map(g => ({ label: g.material, qty: g.qty, extra: `${g.count} coils` }))}
            total={inTransit.total} totalLabel={`${inTransit.totalCount} coils`}
          />
          <MaterialPanel
            icon={<Warehouse className="h-4 w-4" />} title="Coils Inventory" tone="indigo"
            rows={coils.byMat.map(g => ({ label: g.material, qty: g.qty, extra: `${g.count} coils` }))}
            total={coils.total} totalLabel={`${coils.byMat.reduce((s, g) => s + g.count, 0)} coils`}
          />
          <MaterialPanel
            icon={<Layers className="h-4 w-4" />} title="WIP" tone="amber"
            rows={wip.byMat.map(g => ({ label: g.material, qty: g.qty, extra: `${g.count} items` }))}
            total={wip.total} totalLabel={`${wip.totalCount} items`}
          />
          <MaterialPanel
            icon={<CheckCircle className="h-4 w-4" />} title="Finished Goods" tone="emerald"
            rows={fg.byMat.map(g => ({ label: g.material, qty: g.qty, extra: `${g.count} items` }))}
            total={fg.total} totalLabel={`${fg.totalCount} items`}
          />
        </div>
      </Section>

      {/* === Coils Ageing Section === */}
      <Section title="Coils Inventory Ageing" subtitle="Weighted avg ageing days by material (weighted on usable Kg)">
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">Material</TableHead>
                <TableHead className="text-xs font-semibold text-right">Usable Qty (Kg)</TableHead>
                <TableHead className="text-xs font-semibold text-right">Coils</TableHead>
                <TableHead className="text-xs font-semibold text-right">Weighted Avg Ageing</TableHead>
                <TableHead className="text-xs font-semibold w-32">Ageing Profile</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coils.byMat.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-6">No coils in inventory.</TableCell></TableRow>
              )}
              {coils.byMat.map(g => {
                const tone = g.avgAge > 90 ? 'bg-destructive' : g.avgAge > 60 ? 'bg-amber-500' : g.avgAge > 30 ? 'bg-yellow-400' : 'bg-emerald-500';
                const widthPct = Math.min(100, (g.avgAge / 120) * 100);
                return (
                  <TableRow key={g.material}>
                    <TableCell className="text-sm font-medium">{g.material}</TableCell>
                    <TableCell className="text-sm font-mono-num text-right">{fmt(g.qty)}</TableCell>
                    <TableCell className="text-sm font-mono-num text-right">{g.count}</TableCell>
                    <TableCell className="text-sm font-mono-num font-semibold text-right">{Math.round(g.avgAge)} days</TableCell>
                    <TableCell>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${tone}`} style={{ width: `${widthPct}%` }} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {coils.byMat.length > 0 && (
                <TableRow className="bg-muted/30 font-bold border-t-2">
                  <TableCell className="text-sm">Total</TableCell>
                  <TableCell className="text-sm font-mono-num text-right">{fmt(coils.total)}</TableCell>
                  <TableCell className="text-sm font-mono-num text-right">{coils.byMat.reduce((s, g) => s + g.count, 0)}</TableCell>
                  <TableCell className="text-sm font-mono-num text-right">{Math.round(coils.totalAvgAge)} days</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2">
          <LegendDot color="bg-emerald-500" label="≤30 days" />
          <LegendDot color="bg-yellow-400" label="31–60 days" />
          <LegendDot color="bg-amber-500" label="61–90 days" />
          <LegendDot color="bg-destructive" label="&gt;90 days" />
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
    </div>
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

function KpiCard({ icon, label, value, unit, sub, tone }: { icon: React.ReactNode; label: string; value: string; unit: string; sub: string; tone: string }) {
  const t = TONE_MAP[tone];
  return (
    <div className={`rounded-lg border ${t.bg} ring-1 ${t.ring} p-3.5`}>
      <div className={`flex items-center gap-1.5 ${t.text} mb-1`}>{icon}<span className="text-[10px] font-bold uppercase tracking-widest">{label}</span></div>
      <div className="flex items-baseline gap-1">
        <p className="text-2xl font-bold font-mono-num leading-none">{value}</p>
        <span className="text-[10px] text-muted-foreground font-medium">{unit}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-base font-bold tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function MaterialPanel({ icon, title, tone, rows, total, totalLabel }: {
  icon: React.ReactNode; title: string; tone: string;
  rows: { label: string; qty: number; extra?: string }[];
  total: number; totalLabel?: string;
}) {
  const t = TONE_MAP[tone];
  const max = Math.max(1, ...rows.map(r => r.qty));
  return (
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col">
      <div className={`flex items-center gap-2 px-3.5 py-2.5 border-b ${t.bg}`}>
        <div className={t.text}>{icon}</div>
        <div className="flex-1">
          <p className={`text-xs font-bold uppercase tracking-wide ${t.text}`}>{title}</p>
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
