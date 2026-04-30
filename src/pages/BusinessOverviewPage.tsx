import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Users, Landmark, Truck, ShoppingCart, AlertCircle, Stethoscope, Building2, CheckCircle2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useTallySnapshot, SnapshotVoucher } from '@/hooks/useTallySnapshot';

const ALL = '__all__';

const fmtINR = (n: number) => '₹ ' + Math.round(n).toLocaleString('en-IN');

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthStartIso = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function BusinessOverviewPage() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useTallySnapshot();

  const [companyFilter, setCompanyFilter] = useState<string>(ALL);
  const [fromDate, setFromDate] = useState<string>(monthStartIso());
  const [toDate, setToDate] = useState<string>(todayIso());

  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    const t = toast.loading('Syncing from Tally — this can take up to a minute...');
    try {
      const { data: result, error } = await supabase.functions.invoke('tally-sync', { body: {} });
      if (error) {
        const msg = (error as any)?.message || String(error);
        if (/Failed to send a request|Failed to fetch|FunctionsFetchError/i.test(msg)) {
          throw new Error('Backend timed out reaching Tally. Check that Tally on the cloud RDP is running and port 9000 is open to the internet.');
        }
        throw new Error(msg);
      }
      if ((result as any)?.error) throw new Error((result as any).error);
      const status = (result as any)?.status as string;
      const counts = (result as any)?.counts as Record<string, Record<string, number>>;
      const errCount = ((result as any)?.errors || []).length;
      const totalLedgers = Object.values(counts || {}).reduce((s, c) => s + (c.ledgers || 0), 0);
      const totalSales = Object.values(counts || {}).reduce((s, c) => s + (c.sales || 0), 0);
      const totalPurchases = Object.values(counts || {}).reduce((s, c) => s + (c.purchases || 0), 0);
      if (status === 'success') {
        toast.success(`Synced: ${totalLedgers} ledgers, ${totalSales} sales, ${totalPurchases} purchases`, { id: t });
      } else if (status === 'partial') {
        toast.warning(`Partial sync: ${totalLedgers} ledgers, ${totalSales} sales, ${totalPurchases} purchases — ${errCount} errors`, { id: t });
      } else {
        toast.error(`Sync failed — ${errCount} errors. Previous snapshot still active.`, { id: t });
      }
      await qc.invalidateQueries({ queryKey: ['tally-snapshot'] });
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed', { id: t });
      // Refresh anyway so partial run row shows up
      await qc.invalidateQueries({ queryKey: ['tally-snapshot'] });
    } finally {
      setSyncing(false);
    }
  };

  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);

  const handleTestConnection = async () => {
    setDiagOpen(true);
    setDiagLoading(true);
    setDiagResult(null);
    try {
      const { data: r, error } = await supabase.functions.invoke('tally-diagnose', { body: {} });
      if (error) throw error;
      setDiagResult(r);
    } catch (e: any) {
      setDiagResult({ error: e?.message || String(e) });
    } finally {
      setDiagLoading(false);
    }
  };

  const companies = data?.companies || [];
  const filterCo = <T extends { company: string }>(arr: T[] | undefined): T[] =>
    (arr || []).filter(r => companyFilter === ALL || r.company === companyFilter);

  const debtors = filterCo(data?.debtors);
  const creditors = filterCo(data?.creditors);
  const banks = filterCo(data?.banks);

  // Date-range filter only applied to vouchers
  const inRange = (v: SnapshotVoucher) =>
    v.voucher_date && v.voucher_date >= fromDate && v.voucher_date <= toDate;
  const sales = filterCo(data?.sales).filter(inRange);
  const purchases = filterCo(data?.purchases).filter(inRange);

  const totalDebtors = useMemo(() => debtors.reduce((s, d) => s + (d.closing_balance || 0), 0), [debtors]);
  const totalCreditors = useMemo(() => creditors.reduce((s, d) => s + (d.closing_balance || 0), 0), [creditors]);
  const totalBank = useMemo(() => banks.reduce((s, b) => s + (b.closing_balance || 0), 0), [banks]);
  const totalSales = useMemo(() => sales.reduce((s, v) => s + (v.amount || 0), 0), [sales]);
  const totalPurchases = useMemo(() => purchases.reduce((s, v) => s + (v.amount || 0), 0), [purchases]);

  const lastRun = data?.lastRun;
  const fmtTime = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <div className="container py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Business Overview</h1>
          <SyncStatusBanner lastRun={lastRun || null} fmtTime={fmtTime} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Company</Label>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="All companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All companies</SelectItem>
                {companies.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleTestConnection} disabled={diagLoading}>
            <Stethoscope className={`h-4 w-4 mr-2 ${diagLoading ? 'animate-pulse' : ''}`} />
            Test Connection
          </Button>
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync from Tally'}
          </Button>
        </div>
      </div>

      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tally Connection Diagnostic</DialogTitle>
          </DialogHeader>
          {diagLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Probing Tally server...</div>
          ) : diagResult ? (
            <div className="space-y-3">
              <DiagSummary result={diagResult} />
              <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-[400px] whitespace-pre-wrap break-all">
                {JSON.stringify(diagResult, null, 2)}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {lastRun && (lastRun.errors || []).length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <div className="font-medium mb-1 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5" />
            Last sync had {(lastRun.errors || []).length} warning(s)
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
            {(lastRun.errors || []).map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.company}</span> · {e.dataset}: {e.error}
              </li>
            ))}
          </ul>
          <div className="text-[11px] text-muted-foreground mt-1">
            Datasets that failed retain data from the previous successful sync.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard icon={<Users className="h-4 w-4" />} label="Debtors O/S" value={fmtINR(totalDebtors)} sub={`${debtors.length} parties`} />
        <SummaryCard icon={<Building2 className="h-4 w-4" />} label="Creditors O/S" value={fmtINR(Math.abs(totalCreditors))} sub={`${creditors.length} parties`} />
        <SummaryCard icon={<Landmark className="h-4 w-4" />} label="Bank Balance" value={fmtINR(totalBank)} sub={`${banks.length} accounts`} />
        <SummaryCard icon={<Truck className="h-4 w-4" />} label="Sales (range)" value={fmtINR(totalSales)} sub={`${sales.length} vouchers`} />
        <SummaryCard icon={<ShoppingCart className="h-4 w-4" />} label="Purchases (range)" value={fmtINR(totalPurchases)} sub={`${purchases.length} vouchers`} />
      </div>

      <Tabs defaultValue="debtors">
        <TabsList>
          <TabsTrigger value="debtors">Debtors</TabsTrigger>
          <TabsTrigger value="creditors">Creditors</TabsTrigger>
          <TabsTrigger value="banks">Banks</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
        </TabsList>

        <TabsContent value="debtors">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Debtors — All ledgers under Sundry Debtors</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Includes every ledger whose parent chain ultimately rolls up to "Sundry Debtors", regardless of intermediate group names.
              </p>
            </CardHeader>
            <CardContent>
              <DebtorsTable
                rows={debtors}
                empty={isLoading ? 'Loading...' : 'No data — click Sync from Tally'}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="creditors">
          <Card>
            <CardHeader><CardTitle className="text-lg">Creditor Balances</CardTitle></CardHeader>
            <CardContent>
              <PartyTable rows={creditors} valueLabel="Outstanding" empty={isLoading ? 'Loading...' : 'No data — click Sync from Tally'} absolute />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banks">
          <Card>
            <CardHeader><CardTitle className="text-lg">Bank Balances</CardTitle></CardHeader>
            <CardContent>
              <PartyTable rows={banks} valueLabel="Balance" empty={isLoading ? 'Loading...' : 'No data — click Sync from Tally'} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <CardTitle className="text-lg">Sales Vouchers</CardTitle>
                <DateRange fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
              </div>
            </CardHeader>
            <CardContent>
              <VoucherTable rows={sales} partyLabel="Party" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchases">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <CardTitle className="text-lg">Purchase Vouchers</CardTitle>
                <DateRange fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
              </div>
            </CardHeader>
            <CardContent>
              <VoucherTable rows={purchases} partyLabel="Supplier" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SyncStatusBanner({ lastRun, fmtTime }: { lastRun: any; fmtTime: (s?: string | null) => string }) {
  if (!lastRun) {
    return (
      <p className="text-xs text-muted-foreground mt-1">
        No sync yet. Click <span className="font-medium">Sync from Tally</span> to import data.
      </p>
    );
  }
  const status = lastRun.status as string;
  const isOk = status === 'success';
  const isPartial = status === 'partial';
  const isRunning = status === 'running';
  const Icon = isOk ? CheckCircle2 : isPartial ? AlertCircle : isRunning ? RefreshCw : XCircle;
  const color = isOk ? 'text-emerald-600' : isPartial ? 'text-amber-600' : 'text-destructive';
  return (
    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${color} ${isRunning ? 'animate-spin' : ''}`} />
      Last synced: <span className="font-medium text-foreground">{fmtTime(lastRun.finished_at || lastRun.started_at)}</span>
      <span className={color}>· {status}</span>
      {lastRun.triggered_by_email && <span className="text-muted-foreground">· by {lastRun.triggered_by_email}</span>}
    </p>
  );
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function DateRange({ fromDate, toDate, setFromDate, setToDate }: {
  fromDate: string; toDate: string; setFromDate: (s: string) => void; setToDate: (s: string) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs">From</Label>
        <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-[150px]" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">To</Label>
        <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-[150px]" />
      </div>
    </div>
  );
}

function PartyTable({ rows, valueLabel, empty, absolute }: {
  rows: { company: string; name: string; closing_balance: number }[];
  valueLabel: string;
  empty: string;
  absolute?: boolean;
}) {
  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">{valueLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{empty}</TableCell></TableRow>
          ) : (
            [...rows].sort((a, b) => Math.abs(b.closing_balance) - Math.abs(a.closing_balance)).map((r, i) => (
              <TableRow key={i}>
                <TableCell><Badge variant="outline">{r.company}</Badge></TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right font-medium">
                  {fmtINR(absolute ? Math.abs(r.closing_balance) : r.closing_balance)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function DebtorsTable({ rows, empty }: {
  rows: { company: string; name: string; parent_group: string | null; parent_chain?: string[] | null; closing_balance: number }[];
  empty: string;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? rows.filter(r =>
          r.name.toLowerCase().includes(q) ||
          (r.parent_group || '').toLowerCase().includes(q) ||
          r.company.toLowerCase().includes(q))
      : rows;
    return [...base].sort((a, b) => Math.abs(b.closing_balance) - Math.abs(a.closing_balance));
  }, [rows, search]);

  const total = filtered.reduce((s, r) => s + (r.closing_balance || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <Input
          placeholder="Search by ledger, parent group or company..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filtered.length}</span> ledger{filtered.length === 1 ? '' : 's'} · Total{' '}
          <span className="font-medium text-foreground">{fmtINR(total)}</span>
        </div>
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Ledger Name</TableHead>
              <TableHead>Parent Group</TableHead>
              <TableHead>Group Path</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{empty}</TableCell></TableRow>
            ) : (
              filtered.map((r, i) => {
                const chain = (r.parent_chain && r.parent_chain.length > 0)
                  ? r.parent_chain.join(' → ')
                  : (r.parent_group || '—');
                return (
                  <TableRow key={i}>
                    <TableCell><Badge variant="outline">{r.company}</Badge></TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.parent_group || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[360px] truncate" title={chain}>{chain}</TableCell>
                    <TableCell className="text-right font-medium">{fmtINR(r.closing_balance)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function VoucherTable({ rows, partyLabel }: { rows: SnapshotVoucher[]; partyLabel: string }) {
  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Voucher #</TableHead>
            <TableHead>{partyLabel}</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No vouchers in selected range</TableCell></TableRow>
          ) : (
            rows.map((v) => (
              <TableRow key={v.id}>
                <TableCell><Badge variant="outline">{v.company}</Badge></TableCell>
                <TableCell>{v.voucher_date || '—'}</TableCell>
                <TableCell>{v.voucher_number || '—'}</TableCell>
                <TableCell>{v.party_name || '—'}</TableCell>
                <TableCell className="text-right font-medium">{fmtINR(v.amount)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function DiagSummary({ result }: { result: any }) {
  if (result?.error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
        <div className="font-medium">Diagnostic call failed</div>
        <div className="text-muted-foreground text-xs">{result.error}</div>
      </div>
    );
  }
  const { ping, list, tallyUrl } = result || {};
  const bothFailed = !ping?.ok && !list?.ok;
  const reachable = ping?.ok || list?.ok;
  return (
    <div className="space-y-2 text-sm">
      <div className="text-xs text-muted-foreground">Tally URL: <span className="font-mono">{tallyUrl}</span></div>
      <ProbeRow probe={ping} />
      <ProbeRow probe={list} />
      {bothFailed && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          <div className="font-medium">Tally is not reachable</div>
          <div className="text-muted-foreground mt-1">
            Check that Tally is running with "Act as Server" enabled on port 9000, and port 9000 is open in the firewall.
          </div>
        </div>
      )}
      {reachable && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
          <div className="font-medium">Tally is reachable</div>
        </div>
      )}
    </div>
  );
}

function ProbeRow({ probe }: { probe: any }) {
  if (!probe) return null;
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
      <div>
        <div className="font-medium">{probe.label}</div>
        <div className="text-muted-foreground">
          {probe.ok ? `HTTP ${probe.status} · ${probe.bodyLength} bytes` : (probe.error || `HTTP ${probe.status}`)}
        </div>
      </div>
      <Badge variant={probe.ok ? 'default' : 'destructive'}>{probe.elapsedMs}ms</Badge>
    </div>
  );
}
