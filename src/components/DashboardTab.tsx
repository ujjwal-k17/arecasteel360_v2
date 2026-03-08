import { useMemo } from 'react';
import { useAllBatches, useAllActions } from '@/hooks/useBatches';
import { useWIPItems, useFGItems } from '@/hooks/useProcessing';
import { useScrapSales } from '@/hooks/useScrapSales';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Warehouse, Layers, CheckCircle, Trash2, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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

  const allBatches = batches || [];
  const allActions = (actions || []) as any[];
  const allWip = wipItems || [];
  const allFg = fgItems || [];
  const allScrap = scrapSales || [];

  // 1. In-Transit
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

  // 2. Coils by Material & Make
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

  // 3. WIP by Material & Process
  const wipByMaterialProcess = useMemo(() => {
    const map = new Map<string, { material: string; process: string; totalQty: number }>();
    for (const item of allWip) {
      const key = `${item.material || '-'}|${item.process || '-'}`;
      if (!map.has(key)) map.set(key, { material: item.material || '-', process: item.process || '-', totalQty: 0 });
      map.get(key)!.totalQty += item.qty || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [allWip]);

  // 4. FG by Material & Process
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

  // 5. Scrap by Type & Material
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

  // 6. Defective by Type
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

  const totalCoilsQty = coilsByMaterialMake.reduce((s, g) => s + g.totalQty, 0);
  const totalWipQty = wipByMaterialProcess.reduce((s, g) => s + g.totalQty, 0);
  const totalFgQty = fgByMaterialProcess.reduce((s, g) => s + g.totalQty, 0);
  const totalScrapQty = scrapByTypeMaterial.reduce((s, g) => s + g.totalQty, 0);
  const totalDefectiveQty = defectiveByType.reduce((s, g) => s + g.totalQty, 0);
  const grandTotal = inTransitStats.totalQty + totalCoilsQty + totalWipQty + totalFgQty + totalScrapQty + totalDefectiveQty;

  const pct = (v: number) => grandTotal > 0 ? ((v / grandTotal) * 100).toFixed(1) : '0.0';

  // Chart data: inventory distribution
  const inventoryDistribution = useMemo(() => [
    { name: 'In-Transit', value: inTransitStats.totalQty },
    { name: 'Coils', value: totalCoilsQty },
    { name: 'WIP', value: totalWipQty },
    { name: 'FG', value: totalFgQty },
    { name: 'Scrap', value: totalScrapQty },
    { name: 'Defective', value: totalDefectiveQty },
  ].filter(d => d.value > 0), [inTransitStats.totalQty, totalCoilsQty, totalWipQty, totalFgQty, totalScrapQty, totalDefectiveQty]);

  // Coils by material for bar chart
  const coilsByMaterialChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of coilsByMaterialMake) {
      map.set(g.material, (map.get(g.material) || 0) + g.totalQty);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [coilsByMaterialMake]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard icon={<Package className="h-4 w-4" />} label="In-Transit" value={`${inTransitStats.totalQty.toFixed(0)} Kg`} sub={`${inTransitStats.count} coils · Avg ${inTransitStats.avgDays} days`} pct={`${pct(inTransitStats.totalQty)}%`} />
        <SummaryCard icon={<Warehouse className="h-4 w-4" />} label="Coils Inventory" value={`${totalCoilsQty.toFixed(0)} Kg`} sub={`${coilsByMaterialMake.reduce((s, g) => s + g.count, 0)} coils`} pct={`${pct(totalCoilsQty)}%`} />
        <SummaryCard icon={<Layers className="h-4 w-4" />} label="WIP Inventory" value={`${totalWipQty.toFixed(0)} Kg`} sub={`${allWip.length} items`} pct={`${pct(totalWipQty)}%`} />
        <SummaryCard icon={<CheckCircle className="h-4 w-4" />} label="FG Inventory" value={`${totalFgQty.toFixed(0)} Kg`} sub={`${allFg.length} items`} pct={`${pct(totalFgQty)}%`} />
        <SummaryCard icon={<Trash2 className="h-4 w-4" />} label="Total Scrap" value={`${totalScrapQty.toFixed(0)} Kg`} sub={`${scrapByTypeMaterial.length} types`} pct={`${pct(totalScrapQty)}%`} />
        <SummaryCard icon={<AlertTriangle className="h-4 w-4" />} label="Total Defective" value={`${totalDefectiveQty.toFixed(0)} Kg`} sub={`${defectiveByType.length} types`} pct={`${pct(totalDefectiveQty)}%`} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Inventory Distribution</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={inventoryDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`} labelLine={false}>
                  {inventoryDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `${v.toFixed(2)} Kg`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Coils Inventory by Material</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={coilsByMaterialChart} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(v: number) => `${v} Kg`} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detail Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* In-Transit */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> In-Transit Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Coils</span><span className="font-mono-num font-semibold">{inTransitStats.count}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Qty</span><span className="font-mono-num font-semibold">{inTransitStats.totalQty.toFixed(2)} Kg</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Avg Transit Days</span><span className="font-mono-num font-semibold">{inTransitStats.avgDays} days</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">% of Total Inventory</span><span className="font-mono-num font-semibold text-primary">{pct(inTransitStats.totalQty)}%</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Coils by Material & Make */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-primary" /> Coils Inventory by Material & Make
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <MiniTable headers={['Material', 'Make', 'Coils', 'Qty (Kg)', '%']}>
              {coilsByMaterialMake.map((g, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{g.material}</TableCell>
                  <TableCell className="text-xs">{g.make}</TableCell>
                  <TableCell className="text-xs font-mono-num">{g.count}</TableCell>
                  <TableCell className="text-xs font-mono-num font-semibold">{g.totalQty.toFixed(2)}</TableCell>
                  <TableCell className="text-xs font-mono-num text-primary">{totalCoilsQty > 0 ? ((g.totalQty / totalCoilsQty) * 100).toFixed(1) : '0.0'}%</TableCell>
                </TableRow>
              ))}
            </MiniTable>
          </CardContent>
        </Card>

        {/* WIP by Material & Process */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> WIP Inventory by Material & Process
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <MiniTable headers={['Material', 'Process', 'Qty (Kg)', '%']}>
              {wipByMaterialProcess.map((g, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{g.material}</TableCell>
                  <TableCell className="text-xs">{g.process}</TableCell>
                  <TableCell className="text-xs font-mono-num font-semibold">{g.totalQty.toFixed(2)}</TableCell>
                  <TableCell className="text-xs font-mono-num text-primary">{totalWipQty > 0 ? ((g.totalQty / totalWipQty) * 100).toFixed(1) : '0.0'}%</TableCell>
                </TableRow>
              ))}
            </MiniTable>
          </CardContent>
        </Card>

        {/* FG by Material & Process */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" /> FG Inventory by Material & Process
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <MiniTable headers={['Material', 'Process', 'Qty (Kg)', '# Pcs', '%']}>
              {fgByMaterialProcess.map((g, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{g.material}</TableCell>
                  <TableCell className="text-xs">{g.process}</TableCell>
                  <TableCell className="text-xs font-mono-num font-semibold">{g.totalQty.toFixed(2)}</TableCell>
                  <TableCell className="text-xs font-mono-num">{g.totalPcs}</TableCell>
                  <TableCell className="text-xs font-mono-num text-primary">{totalFgQty > 0 ? ((g.totalQty / totalFgQty) * 100).toFixed(1) : '0.0'}%</TableCell>
                </TableRow>
              ))}
            </MiniTable>
          </CardContent>
        </Card>

        {/* Scrap by Type & Material */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-primary" /> Scrap by Type & Material
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <MiniTable headers={['Scrap Type', 'Material', 'Qty (Kg)', '%']}>
              {scrapByTypeMaterial.map((g, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{g.scrapType}</TableCell>
                  <TableCell className="text-xs">{g.material}</TableCell>
                  <TableCell className="text-xs font-mono-num font-semibold">{g.totalQty.toFixed(2)}</TableCell>
                  <TableCell className="text-xs font-mono-num text-primary">{totalScrapQty > 0 ? ((g.totalQty / totalScrapQty) * 100).toFixed(1) : '0.0'}%</TableCell>
                </TableRow>
              ))}
            </MiniTable>
          </CardContent>
        </Card>

        {/* Defective by Type */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" /> Defective Material by Type
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <MiniTable headers={['Defect Type', 'Qty (Kg)', '%']}>
              {defectiveByType.map((g, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{g.defectType}</TableCell>
                  <TableCell className="text-xs font-mono-num font-semibold">{g.totalQty.toFixed(2)}</TableCell>
                  <TableCell className="text-xs font-mono-num text-primary">{totalDefectiveQty > 0 ? ((g.totalQty / totalDefectiveQty) * 100).toFixed(1) : '0.0'}%</TableCell>
                </TableRow>
              ))}
            </MiniTable>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, sub, pct }: { icon: React.ReactNode; label: string; value: string; sub: string; pct: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">{icon}<span className="text-xs font-medium">{label}</span></div>
        <div className="text-lg font-bold font-mono-num">{value}</div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-muted-foreground">{sub}</span>
          <span className="text-xs font-semibold text-primary">{pct}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {headers.map(h => <TableHead key={h} className="text-xs font-semibold whitespace-nowrap py-2">{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}
