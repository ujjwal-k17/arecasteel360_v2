import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Users, Landmark, Truck, ShoppingCart, AlertCircle, Stethoscope } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmtNum } from '@/lib/utils';
import { toast } from 'sonner';

const ALL = '__all__';

type Debtor = { company: string; partyName: string; outstanding: number; overdue: number };
type Bank = { company: string; accountName: string; balance: number };
type Voucher = {
  company: string;
  date: string;
  voucherNumber: string;
  voucherType: string;
  party?: string;
  supplier?: string;
  amount: number;
  totalQty: number;
  itemsSummary: string;
  items: { name: string; qty: number; rate: number; amount: number }[];
};

type TallyResponse = {
  debtors: Debtor[];
  banks: Bank[];
  dispatches: Voucher[];
  purchases: Voucher[];
  errors: { company: string; dataset: string; error: string }[];
  fetchedAt: string;
  fromDate: string;
  toDate: string;
  companies: string[];
};

const fmtINR = (n: number) =>
  '₹ ' + Math.round(n).toLocaleString('en-IN');

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthStartIso = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function BusinessOverviewPage() {
  const [companyFilter, setCompanyFilter] = useState<string>(ALL);
  const [fromDate, setFromDate] = useState<string>(monthStartIso());
  const [toDate, setToDate] = useState<string>(todayIso());

  const [ledgersData, setLedgersData] = useState<TallyResponse | null>(null);
  const [vouchersData, setVouchersData] = useState<TallyResponse | null>(null);
  const [ledgersLoading, setLedgersLoading] = useState(false);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [ledgersError, setLedgersError] = useState<string | null>(null);
  const [vouchersError, setVouchersError] = useState<string | null>(null);

  const fetchDataset = async (dataset: 'ledgers' | 'vouchers') => {
    const { data, error } = await supabase.functions.invoke('tally-fetch', {
      body: { dataset, fromDate, toDate },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as TallyResponse;
  };

  const handleSyncLedgers = async () => {
    if (ledgersLoading) return;
    setLedgersLoading(true);
    setLedgersError(null);
    const t = toast.loading('Syncing Debtors & Creditors...');
    try {
      const d = await fetchDataset('ledgers');
      setLedgersData(d);
      toast.success('Debtors & Creditors synced', { id: t });
    } catch (e: any) {
      setLedgersError(e?.message || 'Sync failed');
      toast.error(e?.message || 'Sync failed', { id: t });
    } finally {
      setLedgersLoading(false);
    }
  };

  const handleSyncVouchers = async () => {
    if (vouchersLoading) return;
    setVouchersLoading(true);
    setVouchersError(null);
    const t = toast.loading('Syncing Dispatches & Purchases...');
    try {
      const d = await fetchDataset('vouchers');
      setVouchersData(d);
      toast.success('Dispatches & Purchases synced', { id: t });
    } catch (e: any) {
      setVouchersError(e?.message || 'Sync failed');
      toast.error(e?.message || 'Sync failed', { id: t });
    } finally {
      setVouchersLoading(false);
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
      const { data, error } = await supabase.functions.invoke('tally-diagnose', { body: {} });
      if (error) throw error;
      setDiagResult(data);
    } catch (e: any) {
      setDiagResult({ error: e?.message || String(e) });
    } finally {
      setDiagLoading(false);
    }
  };

  const companies = useMemo(() => {
    const set = new Set<string>([
      ...(ledgersData?.companies || []),
      ...(vouchersData?.companies || []),
    ]);
    return Array.from(set);
  }, [ledgersData, vouchersData]);

  const filterByCompany = <T extends { company: string }>(arr: T[] | undefined): T[] =>
    (arr || []).filter(r => companyFilter === ALL || r.company === companyFilter);

  const debtors = filterByCompany<Debtor>(ledgersData?.debtors);
  const banks = filterByCompany<Bank>(ledgersData?.banks);
  const dispatches = filterByCompany<Voucher>(vouchersData?.dispatches);
  const purchases = filterByCompany<Voucher>(vouchersData?.purchases);

  const totalDebtors = useMemo(() => debtors.reduce((s, d) => s + (d.outstanding || 0), 0), [debtors]);
  const totalBank = useMemo(() => banks.reduce((s, b) => s + (b.balance || 0), 0), [banks]);
  const totalDispatch = useMemo(() => dispatches.reduce((s, v) => s + (v.amount || 0), 0), [dispatches]);
  const totalPurchase = useMemo(() => purchases.reduce((s, v) => s + (v.amount || 0), 0), [purchases]);

  const fmtTime = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('en-IN') : 'not yet';

  const combinedErrors = [
    ...(ledgersData?.errors || []),
    ...(vouchersData?.errors || []),
  ];

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Business Overview</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Debtors & Creditors: {fmtTime(ledgersData?.fetchedAt)} · Dispatches & Purchases: {fmtTime(vouchersData?.fetchedAt)}
          </p>
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
          <Button onClick={handleSyncLedgers} disabled={ledgersLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${ledgersLoading ? 'animate-spin' : ''}`} />
            Sync Debtors & Creditors
          </Button>
          <Button onClick={handleSyncVouchers} disabled={vouchersLoading} variant="secondary">
            <RefreshCw className={`h-4 w-4 mr-2 ${vouchersLoading ? 'animate-spin' : ''}`} />
            Sync Dispatches & Purchases
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

      {(ledgersError || vouchersError) && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <div className="font-medium">Failed to fetch from Tally</div>
            {ledgersError && <div className="text-muted-foreground">Debtors & Creditors: {ledgersError}</div>}
            {vouchersError && <div className="text-muted-foreground">Dispatches & Purchases: {vouchersError}</div>}
          </div>
        </div>
      )}

      {combinedErrors.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <div className="font-medium mb-1 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5" />
            Some companies/datasets returned warnings
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
            {combinedErrors.map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.company}</span> · {e.dataset}: {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}


      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label="Total Debtors Outstanding"
          value={fmtINR(totalDebtors)}
          sub={`${debtors.length} parties`}
        />
        <SummaryCard
          icon={<Landmark className="h-4 w-4" />}
          label="Total Bank Balance"
          value={fmtINR(totalBank)}
          sub={`${banks.length} accounts`}
        />
        <SummaryCard
          icon={<Truck className="h-4 w-4" />}
          label="Dispatches in Range"
          value={fmtINR(totalDispatch)}
          sub={`${dispatches.length} vouchers`}
        />
        <SummaryCard
          icon={<ShoppingCart className="h-4 w-4" />}
          label="Purchases in Range"
          value={fmtINR(totalPurchase)}
          sub={`${purchases.length} vouchers`}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="debtors">
        <TabsList>
          <TabsTrigger value="debtors">Debtors</TabsTrigger>
          <TabsTrigger value="banks">Banks</TabsTrigger>
          <TabsTrigger value="dispatches">Dispatches</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
        </TabsList>

        <TabsContent value="debtors">
          <Card>
            <CardHeader><CardTitle className="text-lg">Debtor Balances</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Party Name</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {debtors.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                    ) : (
                      [...debtors].sort((a, b) => b.outstanding - a.outstanding).map((d, i) => (
                        <TableRow key={i}>
                          <TableCell><Badge variant="outline">{d.company}</Badge></TableCell>
                          <TableCell>{d.partyName}</TableCell>
                          <TableCell className="text-right font-medium">{fmtINR(d.outstanding)}</TableCell>
                          <TableCell className="text-right">{fmtINR(d.overdue)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banks">
          <Card>
            <CardHeader><CardTitle className="text-lg">Bank Balances</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {banks.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                    ) : (
                      [...banks].sort((a, b) => b.balance - a.balance).map((b, i) => (
                        <TableRow key={i}>
                          <TableCell><Badge variant="outline">{b.company}</Badge></TableCell>
                          <TableCell>{b.accountName}</TableCell>
                          <TableCell className="text-right font-medium">{fmtINR(b.balance)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dispatches">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <CardTitle className="text-lg">Dispatch / Sales Vouchers</CardTitle>
                <DateRange fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
              </div>
            </CardHeader>
            <CardContent>
              <VoucherTable rows={dispatches} partyLabel="Party" />
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

function DateRange({
  fromDate, toDate, setFromDate, setToDate,
}: {
  fromDate: string; toDate: string;
  setFromDate: (s: string) => void; setToDate: (s: string) => void;
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

function VoucherTable({ rows, partyLabel }: { rows: Voucher[]; partyLabel: string }) {
  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Voucher #</TableHead>
            <TableHead>{partyLabel}</TableHead>
            <TableHead>Items</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No data</TableCell></TableRow>
          ) : (
            [...rows].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((v, i) => (
              <TableRow key={i}>
                <TableCell><Badge variant="outline">{v.company}</Badge></TableCell>
                <TableCell>{v.date}</TableCell>
                <TableCell>{v.voucherNumber}</TableCell>
                <TableCell>{v.party || v.supplier}</TableCell>
                <TableCell className="max-w-[320px] truncate" title={v.itemsSummary}>{v.itemsSummary || '—'}</TableCell>
                <TableCell className="text-right">{fmtNum(v.totalQty || 0)}</TableCell>
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
            The server at this IP/port did not respond. Check that Tally is running with "Act as Server" enabled on port 9000, the right companies are loaded, and port 9000 is open in the firewall.
          </div>
        </div>
      )}
      {reachable && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
          <div className="font-medium">Tally is reachable</div>
          <div className="text-muted-foreground mt-1">
            Check the response snippet below to confirm the company names match what we're requesting.
          </div>
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
