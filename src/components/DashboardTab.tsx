import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAllBatches, useAllActions } from '@/hooks/useBatches';
import { useWIPItems, useFGItems } from '@/hooks/useProcessing';
import { useScrapSales } from '@/hooks/useScrapSales';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Warehouse, Layers, CheckCircle, Trash2, AlertTriangle, Boxes } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(210, 70%, 55%)',
  'hsl(150, 60%, 45%)',
  'hsl(35, 85%, 55%)',
  'hsl(340, 65%, 50%)',
  'hsl(270, 55%, 55%)',
  'hsl(180, 50%, 45%)',
  'hsl(60, 70%, 45%)',
];

export default function DashboardTab() {
  const { data: batches } = useAllBatches();
  const { data: actions } = useAllActions();
  const { data: wipItems } = useWIPItems();
  const { data: fgItems } = useFGItems();
  const { data: scrapSales } = useScrapSales();

  const { data: palletSkus } = useQuery({
    queryKey: ['pallet_skus'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pallet_skus').select('*');
      if (error) throw error;
      return data;
    },
  });
  const { data: palletPurchases } = useQuery({
    queryKey: ['pallet_purchases'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pallet_purchases').select('*');
      if (error) throw error;
      return data;
    },
  });
  const { data: palletConsumptions } = useQuery({
    queryKey: ['pallet_consumptions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pallet_consumptions').select('*');
      if (error) throw error;
      return data;
    },
  });

  const allBatches = batches || [];
  const allActions = (actions || []) as any[];
  const allWip = wipItems || [];
  const allFg = fgItems || [];
  const allScrap = scrapSales || [];

  // In-Transit
  const inTransitStats = useMemo(() => {
    const transit = allBatches.filter(b => b.status === 'in-transit');
    const totalQty = transit.reduce((s, b) => s + (b.net_weight || 0), 0);
    const now = new Date();
    const days = transit.map(b => {
      const pd = b.purchase_date ? new Date(b.purchase_date) : now;
      return Math.max(0, Math.floor((now.getTime() - pd.getTime()) / (1000 * 60 * 60 * 24)));
    });
    const avgDays = days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
    return { count: transit.length, totalQty, avgDays };
  }, [allBatches]);

  // Coils
  const coilsByMaterialMake = useMemo(() => {
    const received = allBatches.filter(b => b.status === 'received');
    const map = new Map<string, { material: string; make: string; count: number; totalQty: number }>();
    for (const b of received) {
      const key = `${b.material || '-'}|${b.make || '-'}`;
      if (!map.has(key)) map.set(key, { material: b.material || '-', make: b.make || '-', count: 0, totalQty: 0 });
      const g = map.get(key)!;
      g.count++;
      g.totalQty += b.net_weight || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [allBatches]);

  // WIP
  const wipByMaterialProcess = useMemo(() => {
    const map = new Map<string, { material: string; process: string; totalQty: number }>();
    for (const item of allWip) {
      const key = `${item.material || '-'}|${item.process || '-'}`;
      if (!map.has(key)) map.set(key, { material: item.material || '-', process: item.process || '-', totalQty: 0 });
      map.get(key)!.totalQty += item.qty || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [allWip]);

  // FG
  const fgByMaterialProcess = useMemo(() => {
    const map = new Map<string, { material: string; process: string; totalQty: number; totalPcs: number }>();
    for (const item of allFg) {
      const key = `${item.material || '-'}|${item.process || '-'}`;
      if (!map.has(key)) map.set(key, { material: item.material || '-', process: item.process || '-', totalQty: 0, totalPcs: 0 });
      const g = map.get(key)!;
      g.totalQty += item.qty || 0;
      g.totalPcs += item.num_pcs || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [allFg]);

  // Scrap
  const scrapByTypeMaterial = useMemo(() => {
    const scrapActions = allActions.filter((a: any) => a.action_type === 'scrap');
    const map = new Map<string, { scrapType: string; material: string; totalQty: number }>();
    for (const a of scrapActions) {
      const batchMaterial = (a as any).batches?.material || '-';
      const key = `${a.scrap_type || '-'}|${batchMaterial}`;
      if (!map.has(key)) map.set(key, { scrapType: a.scrap_type || '-', material: batchMaterial, totalQty: 0 });
      map.get(key)!.totalQty += a.net_weight || 0;
    }
    for (const s of allScrap) {
      const key = `${s.scrap_type || '-'}|${s.material || '-'}`;
      if (!map.has(key)) map.set(key, { scrapType: s.scrap_type || '-', material: s.material || '-', totalQty: 0 });
      map.get(key)!.totalQty += s.qty_sold || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [allActions, allScrap]);

  // Defective
  const defectiveByType = useMemo(() => {
    const defActions = allActions.filter((a: any) => a.action_type === 'defective');
    const map = new Map<string, { defectType: string; totalQty: number }>();
    for (const a of defActions) {
      const key = a.defect_type || '-';
      if (!map.has(key)) map.set(key, { defectType: key, totalQty: 0 });
      map.get(key)!.totalQty += a.net_weight || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [allActions]);

  // Pallets
  const palletStats = useMemo(() => {
    const purchases = palletPurchases || [];
    const consumptions = palletConsumptions || [];
    const totalPurchasedPcs = purchases.reduce((s, p) => s + (p.num_pcs || 0), 0);
    const totalPurchasedKg = purchases.reduce((s, p) => s + (p.weight_kg || 0), 0);
    const totalConsumedPcs = consumptions.reduce((s, c) => s + (c.num_pcs || 0), 0);
    const totalConsumedKg = consumptions.reduce((s, c) => s + (c.weight_kg || 0), 0);
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthPurchases = purchases.filter(p => p.purchase_date >= monthStart);
    const monthConsumptions = consumptions.filter(c => c.consumption_date >= monthStart);
    return {
      totalStockPcs: totalPurchasedPcs - totalConsumedPcs,
      totalStockKg: totalPurchasedKg - totalConsumedKg,
      monthPurchaseKg: monthPurchases.reduce((s, p) => s + (p.weight_kg || 0), 0),
      monthPurchasePcs: monthPurchases.reduce((s, p) => s + (p.num_pcs || 0), 0),
      monthConsumptionKg: monthConsumptions.reduce((s, c) => s + (c.weight_kg || 0), 0),
      monthConsumptionPcs: monthConsumptions.reduce((s, c) => s + (c.num_pcs || 0), 0),
    };
  }, [palletPurchases, palletConsumptions]);

  const totalCoilsQty = coilsByMaterialMake.reduce((s, g) => s + g.totalQty, 0);
  const totalWipQty = wipByMaterialProcess.reduce((s, g) => s + g.totalQty, 0);
  const totalFgQty = fgByMaterialProcess.reduce((s, g) => s + g.totalQty, 0);
  const totalScrapQty = scrapByTypeMaterial.reduce((s, g) => s + g.totalQty, 0);
  const totalDefectiveQty = defectiveByType.reduce((s, g) => s + g.totalQty, 0);
  const grandTotal = inTransitStats.totalQty + totalCoilsQty + totalWipQty + totalFgQty + totalScrapQty + totalDefectiveQty;

  const pct = (v: number) => grandTotal > 0 ? ((v / grandTotal) * 100).toFixed(1) : '0.0';

  const inventoryDistribution = useMemo(() => [
    { name: 'In-Transit', value: inTransitStats.totalQty },
    { name: 'Coils', value: totalCoilsQty },
    { name: 'WIP', value: totalWipQty },
    { name: 'FG', value: totalFgQty },
    { name: 'Scrap', value: totalScrapQty },
    { name: 'Defective', value: totalDefectiveQty },
  ].filter(d => d.value > 0), [inTransitStats.totalQty, totalCoilsQty, totalWipQty, totalFgQty, totalScrapQty, totalDefectiveQty]);

  return (
    <div className="space-y-5">
      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <StatChip icon={<Package className="h-3.5 w-3.5" />} label="In-Transit" value={`${inTransitStats.totalQty.toFixed(0)} Kg`} detail={`${inTransitStats.count} coils`} />
        <StatChip icon={<Warehouse className="h-3.5 w-3.5" />} label="Coils" value={`${totalCoilsQty.toFixed(0)} Kg`} detail={`${coilsByMaterialMake.reduce((s, g) => s + g.count, 0)} coils`} />
        <StatChip icon={<Layers className="h-3.5 w-3.5" />} label="WIP" value={`${totalWipQty.toFixed(0)} Kg`} detail={`${allWip.length} items`} />
        <StatChip icon={<CheckCircle className="h-3.5 w-3.5" />} label="FG" value={`${totalFgQty.toFixed(0)} Kg`} detail={`${allFg.length} items`} />
        <StatChip icon={<Trash2 className="h-3.5 w-3.5" />} label="Scrap" value={`${totalScrapQty.toFixed(0)} Kg`} detail={`${scrapByTypeMaterial.length} types`} />
        <StatChip icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Defective" value={`${totalDefectiveQty.toFixed(0)} Kg`} detail={`${defectiveByType.length} types`} />
        <StatChip icon={<Boxes className="h-3.5 w-3.5" />} label="Pallets" value={`${palletStats.totalStockPcs} Pcs`} detail={`${palletStats.totalStockKg.toFixed(1)} Kg`} />
      </div>

      {/* Chart + In-Transit side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Distribution</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={inventoryDistribution} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value" strokeWidth={0}>
                {inventoryDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `${v.toFixed(0)} Kg`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
            {inventoryDistribution.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                {d.name} ({pct(d.value)}%)
              </span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* In-Transit */}
          <MiniSection icon={<Package className="h-3.5 w-3.5" />} title="In-Transit">
            <Row label="Total Coils" value={String(inTransitStats.count)} />
            <Row label="Total Qty" value={`${inTransitStats.totalQty.toFixed(2)} Kg`} />
            <Row label="Avg Transit" value={`${inTransitStats.avgDays} days`} />
          </MiniSection>

          {/* Pallets */}
          <MiniSection icon={<Boxes className="h-3.5 w-3.5" />} title="Pallets Stock">
            {palletStats.bySize.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No pallet data</p>
            ) : (
              palletStats.bySize.map(p => (
                <Row key={p.size} label={p.size} value={`${p.stockPcs} pcs · ${p.stockKg.toFixed(1)} Kg`} />
              ))
            )}
          </MiniSection>

          {/* Coils */}
          <MiniSection icon={<Warehouse className="h-3.5 w-3.5" />} title="Coils by Material">
            <MiniTable headers={['Material', 'Make', 'Qty (Kg)']}>
              {coilsByMaterialMake.slice(0, 5).map((g, i) => (
                <TableRow key={i}>
                  <TableCell className="text-[11px] py-1">{g.material}</TableCell>
                  <TableCell className="text-[11px] py-1">{g.make}</TableCell>
                  <TableCell className="text-[11px] py-1 font-mono-num font-semibold">{g.totalQty.toFixed(0)}</TableCell>
                </TableRow>
              ))}
            </MiniTable>
          </MiniSection>

          {/* WIP */}
          <MiniSection icon={<Layers className="h-3.5 w-3.5" />} title="WIP by Process">
            <MiniTable headers={['Material', 'Process', 'Qty (Kg)']}>
              {wipByMaterialProcess.slice(0, 5).map((g, i) => (
                <TableRow key={i}>
                  <TableCell className="text-[11px] py-1">{g.material}</TableCell>
                  <TableCell className="text-[11px] py-1">{g.process}</TableCell>
                  <TableCell className="text-[11px] py-1 font-mono-num font-semibold">{g.totalQty.toFixed(0)}</TableCell>
                </TableRow>
              ))}
            </MiniTable>
          </MiniSection>

          {/* FG */}
          <MiniSection icon={<CheckCircle className="h-3.5 w-3.5" />} title="FG by Process">
            <MiniTable headers={['Material', 'Process', 'Qty (Kg)']}>
              {fgByMaterialProcess.slice(0, 5).map((g, i) => (
                <TableRow key={i}>
                  <TableCell className="text-[11px] py-1">{g.material}</TableCell>
                  <TableCell className="text-[11px] py-1">{g.process}</TableCell>
                  <TableCell className="text-[11px] py-1 font-mono-num font-semibold">{g.totalQty.toFixed(0)}</TableCell>
                </TableRow>
              ))}
            </MiniTable>
          </MiniSection>

          {/* Scrap */}
          <MiniSection icon={<Trash2 className="h-3.5 w-3.5" />} title="Scrap Summary">
            <MiniTable headers={['Type', 'Material', 'Qty (Kg)']}>
              {scrapByTypeMaterial.slice(0, 5).map((g, i) => (
                <TableRow key={i}>
                  <TableCell className="text-[11px] py-1">{g.scrapType}</TableCell>
                  <TableCell className="text-[11px] py-1">{g.material}</TableCell>
                  <TableCell className="text-[11px] py-1 font-mono-num font-semibold">{g.totalQty.toFixed(0)}</TableCell>
                </TableRow>
              ))}
            </MiniTable>
          </MiniSection>
        </div>
      </div>
    </div>
  );
}

function StatChip({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">{icon}<span className="text-[10px] font-medium uppercase tracking-wide">{label}</span></div>
      <p className="text-sm font-bold font-mono-num leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function MiniSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">{icon}<span className="text-xs font-semibold">{title}</span></div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono-num font-semibold">{value}</span>
    </div>
  );
}

function MiniTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            {headers.map(h => <TableHead key={h} className="text-[10px] font-semibold whitespace-nowrap py-1 px-2">{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}
