import { useEffect, useMemo, useState } from 'react';
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
import { RefreshCw, AlertCircle, Stethoscope, CheckCircle2, XCircle, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useDropdownOptions } from '@/hooks/useDropdownOptions';
import {
  useTallySnapshot, SnapshotVoucher, SnapshotLedger, SnapshotBankTxn, SnapshotBillRef, SnapshotDebtorCredit, DebtorOverride,
} from '@/hooks/useTallySnapshot';

const ALL = '__all__';

const fmtINR = (n: number) => '₹ ' + Math.round(n).toLocaleString('en-IN');

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthStartIso = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const fyStartIso = () => {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
};

const daysBetween = (a: string, b: string) =>
  Math.floor((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));

export default function BusinessOverviewPage() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useTallySnapshot();

  const [companyFilter, setCompanyFilter] = useState<string>(ALL);
  const [fromDate, setFromDate] = useState<string>(fyStartIso());
  const [toDate, setToDate] = useState<string>(todayIso());

  const [syncing, setSyncing] = useState(false);
  const [syncAllOpen, setSyncAllOpen] = useState(false);
  type ChunkProgress = {
    label: string;
    fromDate: string;
    toDate: string;
    status: 'pending' | 'running' | 'done' | 'error';
    counts?: number;
    error?: string;
  };
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress[]>([]);

  // Build 90-day chunks from a start date up to today (oldest first).
  const buildChunks = (startDate: string): { fromDate: string; toDate: string; label: string }[] => {
    const out: { fromDate: string; toDate: string; label: string }[] = [];
    const todayMs = new Date().getTime();
    let cursor = new Date(startDate).getTime();
    const day = 24 * 60 * 60 * 1000;
    while (cursor <= todayMs) {
      const from = new Date(cursor);
      const toMs = Math.min(cursor + 90 * day - 1, todayMs);
      const to = new Date(toMs);
      const fromIso = from.toISOString().slice(0, 10);
      const toIso = to.toISOString().slice(0, 10);
      const label = `${from.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} → ${to.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`;
      out.push({ fromDate: fromIso, toDate: toIso, label });
      cursor = toMs + 1;
    }
    return out;
  };

  const sumCounts = (counts: Record<string, Record<string, number>> | undefined) =>
    Object.values(counts || {}).reduce((s, c) => s + Object.values(c).reduce((a, b) => a + b, 0), 0);

  // ---- Sync 30 Days: single call with a tight window.
  const handleSync30Days = async () => {
    if (syncing) return;
    setSyncing(true);
    const t = toast.loading('Syncing last 30 days from Tally...');
    try {
      const today = new Date();
      const from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const fromDate = from.toISOString().slice(0, 10);
      const toDate = today.toISOString().slice(0, 10);
      const { data: result, error } = await supabase.functions.invoke('tally-sync', {
        body: { fromDate, toDate, includeLedgers: true, chunkLabel: 'Last 30 days' },
      });
      if (error) {
        const msg = (error as any)?.message || String(error);
        if (/Failed to send a request|Failed to fetch|FunctionsFetchError/i.test(msg)) {
          throw new Error('Backend timed out reaching Tally. Check Tally on the cloud RDP is running and port 9000 is open.');
        }
        throw new Error(msg);
      }
      if ((result as any)?.error) throw new Error((result as any).error);
      const status = (result as any)?.status as string;
      const counts = (result as any)?.counts as Record<string, Record<string, number>>;
      const errCount = ((result as any)?.errors || []).length;
      const tot = (k: string) => Object.values(counts || {}).reduce((s, c) => s + (c[k] || 0), 0);
      const summary = `${tot('ledgers')} ledgers, ${tot('sales')} sales, ${tot('receipt')} receipts, ${tot('payment') + tot('contra') + tot('journal')} bank/other`;
      if (status === 'success') toast.success(`Synced — ${summary}`, { id: t });
      else if (status === 'partial') toast.warning(`Partial sync — ${summary} · ${errCount} errors`, { id: t });
      else toast.error(`Sync failed — ${errCount} errors. Previous snapshot still active.`, { id: t });
      await qc.invalidateQueries({ queryKey: ['tally-snapshot'] });
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed', { id: t });
      await qc.invalidateQueries({ queryKey: ['tally-snapshot'] });
    } finally {
      setSyncing(false);
    }
  };

  // ---- Sync All: chunked 90-day windows from 2022-04-01 → today, client-orchestrated.
  const handleSyncAll = async () => {
    if (syncing) return;
    setSyncAllOpen(false);
    setSyncing(true);
    const chunks = buildChunks('2022-04-01');
    const initial: ChunkProgress[] = chunks.map(c => ({
      label: c.label, fromDate: c.fromDate, toDate: c.toDate, status: 'pending' as const,
    }));
    setChunkProgress(initial);
    const t = toast.loading(`Starting full sync — ${chunks.length} chunks queued...`);

    let runId: string | undefined;
    let priorCumulative = 0;
    let chunkErrors = 0;

    try {
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const isFirst = i === 0;
        const isLast = i === chunks.length - 1;
        setChunkProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'running' } : p));
        toast.loading(`Syncing ${c.label} (${i + 1}/${chunks.length})...`, { id: t });

        try {
          const { data: result, error } = await supabase.functions.invoke('tally-sync', {
            body: {
              runId,
              fromDate: c.fromDate,
              toDate: c.toDate,
              includeLedgers: isFirst, // ledgers fetched once with the first chunk
              finalize: isLast,
              chunkLabel: c.label,
            },
          });
          if (error) throw new Error((error as any)?.message || String(error));
          if ((result as any)?.error) throw new Error((result as any).error);
          if (!runId) runId = (result as any)?.runId as string;
          const counts = (result as any)?.counts as Record<string, Record<string, number>> | undefined;
          const cumulative = sumCounts(counts);
          const thisChunkInserted = Math.max(0, cumulative - priorCumulative);
          priorCumulative = cumulative;
          setChunkProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'done', counts: thisChunkInserted } : p));
        } catch (e: any) {
          chunkErrors++;
          const msg = e?.message || String(e);
          setChunkProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: msg } : p));
          // Continue with remaining chunks — partial data is better than none.
        }
      }

      // Ensure the run is finalized even if the last chunk errored before finalize ran.
      if (runId) {
        await supabase.functions.invoke('tally-sync', {
          body: {
            runId,
            fromDate: chunks[chunks.length - 1].fromDate,
            toDate: chunks[chunks.length - 1].toDate,
            includeLedgers: false,
            finalize: true,
            chunkLabel: 'finalize',
          },
        }).catch(() => { /* best effort */ });
      }

      if (chunkErrors === 0) toast.success(`Full sync complete — ${chunks.length} chunks synced`, { id: t });
      else toast.warning(`Sync finished with ${chunkErrors} chunk error(s) of ${chunks.length}`, { id: t });
      await qc.invalidateQueries({ queryKey: ['tally-snapshot'] });
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed', { id: t });
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

  // Memoize the company-filtered slices so they don't rebuild on every render
  // (e.g. on every search keystroke or dialog open). Filtering large arrays
  // unconditionally was a meaningful render-time cost.
  const {
    debtors, banks, sales, purchases, receipts, bankTxns, billRefs, debtorCredits, overrides,
  } = useMemo(() => {
    const match = <T extends { company: string }>(arr: T[] | undefined): T[] =>
      companyFilter === ALL ? (arr || []) : (arr || []).filter(r => r.company === companyFilter);
    return {
      debtors: match(data?.debtors),
      banks: match(data?.banks),
      sales: match(data?.sales),
      purchases: match(data?.purchases),
      receipts: match(data?.receipts),
      bankTxns: match(data?.bankTxns),
      billRefs: data?.billRefs || [],
      debtorCredits: companyFilter === ALL
        ? (data?.debtorCredits || [])
        : (data?.debtorCredits || []).filter(c => c.company === companyFilter),
      overrides: data?.overrides || [],
    };
  }, [data, companyFilter]);

  const inRange = (d: string | null) => !!d && d >= fromDate && d <= toDate;

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
                {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleTestConnection} disabled={diagLoading}>
            <Stethoscope className={`h-4 w-4 mr-2 ${diagLoading ? 'animate-pulse' : ''}`} />
            Test Connection
          </Button>
          <Button variant="outline" onClick={handleSync30Days} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync 30 Days
          </Button>
          <Button onClick={() => setSyncAllOpen(true)} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync All'}
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
              <li key={i}><span className="font-medium">{e.company}</span> · {e.dataset}: {e.error}</li>
            ))}
          </ul>
          <div className="text-[11px] text-muted-foreground mt-1">
            Datasets that failed retain data from the previous successful sync.
          </div>
        </div>
      )}

      <Tabs defaultValue="debtors">
        <TabsList>
          <TabsTrigger value="debtors">Debtor Summary</TabsTrigger>
          <TabsTrigger value="sales-purchases">Sales &amp; Purchases</TabsTrigger>
          <TabsTrigger value="banking">Banking</TabsTrigger>
        </TabsList>

        <TabsContent value="debtors">
          <DebtorSummaryModule
            debtors={debtors}
            sales={sales}
            receipts={receipts}
            billRefs={billRefs}
            debtorCredits={debtorCredits}
            overrides={overrides}
            isLoading={isLoading}
            onChanged={() => qc.invalidateQueries({ queryKey: ['tally-snapshot'] })}
          />
        </TabsContent>

        <TabsContent value="sales-purchases">
          <SalesPurchasesModule
            sales={sales}
            purchases={purchases}
            debtors={debtors}
            overrides={overrides}
            fromDate={fromDate} toDate={toDate}
            setFromDate={setFromDate} setToDate={setToDate}
            inRange={inRange}
            onChangedOverride={() => qc.invalidateQueries({ queryKey: ['tally-snapshot'] })}
          />
        </TabsContent>

        <TabsContent value="banking">
          <BankingModule
            banks={banks}
            bankTxns={bankTxns}
            fromDate={fromDate} toDate={toDate}
            setFromDate={setFromDate} setToDate={setToDate}
            inRange={inRange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// FIFO matching helpers
// ============================================================

type DebtorKey = string; // `${company}::${ledger}`
const dkey = (company: string, ledger: string) => `${company}::${ledger}`;

type InvoiceMatch = {
  voucher: SnapshotVoucher;
  amount: number;
  paid: number;
  paidOnDate: string | null; // date when last payment cleared the invoice (FIFO)
  dueDate: string | null;
  overdueDays: number | null;
  status: 'paid' | 'partial' | 'open' | 'overdue';
};

/**
 * FIFO match payments against invoices for a single debtor (by company + ledger name).
 * Inputs already filtered to that debtor; sorted ascending by date.
 */
function fifoMatch(
  invoices: SnapshotVoucher[],
  payments: { voucher_date: string | null; amount: number }[],
  creditPeriodDays: number | null,
): InvoiceMatch[] {
  const sortedInv = [...invoices].sort((a, b) => (a.voucher_date || '').localeCompare(b.voucher_date || ''));
  const sortedPay = [...payments].sort((a, b) => (a.voucher_date || '').localeCompare(b.voucher_date || ''));

  const out: InvoiceMatch[] = sortedInv.map(v => ({
    voucher: v, amount: v.amount, paid: 0, paidOnDate: null, dueDate: null, overdueDays: null, status: 'open',
  }));

  let i = 0;
  for (const pay of sortedPay) {
    let remaining = pay.amount;
    while (remaining > 0.0001 && i < out.length) {
      const inv = out[i];
      const need = inv.amount - inv.paid;
      if (need <= 0.0001) { i++; continue; }
      const apply = Math.min(need, remaining);
      inv.paid += apply;
      remaining -= apply;
      if (inv.paid >= inv.amount - 0.0001) {
        inv.paidOnDate = pay.voucher_date;
        i++;
      }
    }
    if (i >= out.length) break;
  }

  const today = todayIso();
  for (const m of out) {
    const invDate = m.voucher.voucher_date;
    if (invDate && creditPeriodDays != null) {
      const due = new Date(invDate);
      due.setDate(due.getDate() + creditPeriodDays);
      m.dueDate = due.toISOString().slice(0, 10);
    }
    if (m.paid >= m.amount - 0.0001) {
      m.status = 'paid';
      if (m.dueDate && m.paidOnDate) {
        const od = daysBetween(m.dueDate, m.paidOnDate);
        m.overdueDays = od > 0 ? od : 0;
      }
    } else {
      m.status = m.paid > 0.0001 ? 'partial' : 'open';
      if (m.dueDate) {
        const od = daysBetween(m.dueDate, today);
        m.overdueDays = od > 0 ? od : 0;
        if (od > 0) m.status = 'overdue';
      }
    }
  }
  return out;
}

// ============================================================
// 1) Debtor Summary Module
// ============================================================

function DebtorSummaryModule({
  debtors, sales, receipts, billRefs, debtorCredits, overrides, isLoading, onChanged,
}: {
  debtors: SnapshotLedger[];
  sales: SnapshotVoucher[];
  receipts: SnapshotVoucher[];
  billRefs: SnapshotBillRef[];
  debtorCredits: SnapshotDebtorCredit[];
  overrides: DebtorOverride[];
  isLoading: boolean;
  onChanged: () => void;
}) {
  return (
    <Tabs defaultValue="master">
      <TabsList>
        <TabsTrigger value="master">Master Data</TabsTrigger>
        <TabsTrigger value="payments">Payment Summary</TabsTrigger>
      </TabsList>
      <TabsContent value="master">
        <DebtorMasterDataTab
          debtors={debtors}
          overrides={overrides}
          isLoading={isLoading}
          onChanged={onChanged}
        />
      </TabsContent>
      <TabsContent value="payments">
        <DebtorPaymentSummaryTab
          debtors={debtors}
          sales={sales}
          receipts={receipts}
          billRefs={billRefs}
          debtorCredits={debtorCredits}
          overrides={overrides}
          isLoading={isLoading}
        />
      </TabsContent>
    </Tabs>
  );
}

function AddressCell({ address }: { address: string | null }) {
  if (!address) return <span className="text-muted-foreground">—</span>;
  // Render multi-line addresses cleanly
  const lines = address.split(/\s*,\s*|\n+/).map(s => s.trim()).filter(Boolean);
  return (
    <div className="text-xs leading-snug max-w-[280px] whitespace-normal" title={lines.join(', ')}>
      {lines.join(', ')}
    </div>
  );
}

function DebtorMasterDataTab({
  debtors, overrides, isLoading, onChanged,
}: {
  debtors: SnapshotLedger[];
  overrides: DebtorOverride[];
  isLoading: boolean;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState('');

  const overrideMap = useMemo(() => {
    const m = new Map<DebtorKey, DebtorOverride>();
    for (const o of overrides) m.set(dkey(o.company, o.ledger_name), o);
    return m;
  }, [overrides]);

  // Deduplicate by ledger name (across companies, in case a debtor exists in multiple companies
  // we still show one row per (company, ledger) but the "Company" column is dropped per request).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? debtors.filter(r =>
          r.name.toLowerCase().includes(q) ||
          (r.gstin || '').toLowerCase().includes(q))
      : debtors;
    return [...base].sort((a, b) => Math.abs(b.closing_balance) - Math.abs(a.closing_balance));
  }, [debtors, search]);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-lg">Debtor Master Data</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            New debtors are added on each sync; existing entries (and their credit period / sales rep) are preserved.
          </p>
        </div>
        <Input placeholder="Search name / GSTIN..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ledger</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="w-[160px]">Sales Rep</TableHead>
                <TableHead className="w-[140px]">Credit Period (days)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{isLoading ? 'Loading...' : 'No debtors'}</TableCell></TableRow>
              ) : filtered.map((d) => {
                const k = dkey(d.company, d.name);
                const ov = overrideMap.get(k);
                return (
                  <TableRow key={k}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-xs">{d.gstin || '—'}</TableCell>
                    <TableCell><AddressCell address={d.address} /></TableCell>
                    <TableCell className="text-xs">
                      <div>{d.contact_person || '—'}</div>
                      <div className="text-muted-foreground">{d.phone || ''}</div>
                      {d.email && <div className="text-muted-foreground">{d.email}</div>}
                    </TableCell>
                    <TableCell>
                      <SalesRepSelect debtor={d} current={ov?.sales_rep ?? null} onSaved={onChanged} />
                    </TableCell>
                    <TableCell>
                      <CreditPeriodInput debtor={d} current={ov?.credit_period_days ?? null} onSaved={onChanged} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SalesRepSelect({
  debtor, current, onSaved,
}: { debtor: SnapshotLedger; current: string | null; onSaved: () => void }) {
  const { data: options } = useDropdownOptions();
  const reps = useMemo(
    () => (options || []).filter(o => o.category === 'sales_rep').map(o => o.value),
    [options]
  );
  const [saving, setSaving] = useState(false);

  const save = async (val: string | null) => {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tally_debtor_overrides')
        .upsert(
          { company: debtor.company, ledger_name: debtor.name, sales_rep: val },
          { onConflict: 'company,ledger_name' }
        );
      if (error) throw error;
      toast.success('Saved');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select
      value={current ?? '__none__'}
      onValueChange={(v) => save(v === '__none__' ? null : v)}
      disabled={saving}
    >
      <SelectTrigger className="h-8 w-[150px]">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">—</SelectItem>
        {reps.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DebtorPaymentSummaryTab({
  debtors, sales, receipts, billRefs, debtorCredits, overrides, isLoading,
}: {
  debtors: SnapshotLedger[];
  sales: SnapshotVoucher[];
  receipts: SnapshotVoucher[];
  billRefs: SnapshotBillRef[];
  debtorCredits: SnapshotDebtorCredit[];
  overrides: DebtorOverride[];
  isLoading: boolean;
}) {
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  

  const overrideMap = useMemo(() => {
    const m = new Map<DebtorKey, DebtorOverride>();
    for (const o of overrides) m.set(dkey(o.company, o.ledger_name), o);
    return m;
  }, [overrides]);



  // Pre-index sales by (company, ledger lowercase), pre-sorted descending by date.
  // This collapses what was an O(debtors × sales) `sales.filter(...)` + per-row
  // `sort()` into a single O(sales) build + O(1) lookup per debtor.
  const salesByDebtor = useMemo(() => {
    const m = new Map<string, SnapshotVoucher[]>();
    for (const v of sales) {
      const party = (v.party_name || '').toLowerCase();
      if (!party) continue;
      const key = `${v.company}__${party}`;
      const arr = m.get(key);
      if (arr) arr.push(v); else m.set(key, [v]);
    }
    // ISO date strings sort lexicographically — descending = b vs a.
    for (const arr of m.values()) {
      arr.sort((a, b) => (b.voucher_date || '').localeCompare(a.voucher_date || ''));
    }
    return m;
  }, [sales]);

  // Compute per-debtor overdue using outstanding walk-back; outstanding = Tally closing balance
  const rows = useMemo(() => {
    const today = todayIso();
    // Add `days` to an ISO date string (yyyy-mm-dd) without allocating two Date
    // objects per invoice.
    const addDaysIso = (iso: string, days: number): string => {
      const d = new Date(iso + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    return debtors.map(d => {
      const k = dkey(d.company, d.name);
      const ov = overrideMap.get(k);
      const cp = ov?.credit_period_days ?? null;
      const salesRep = ov?.sales_rep ?? null;
      const dInvoices = salesByDebtor.get(`${d.company}__${d.name.toLowerCase()}`) || [];
      const outstandingAbs = Math.abs(Number(d.closing_balance) || 0);
      let remaining = outstandingAbs;
      let overdue = 0;
      let overdueCount = 0;
      let unpaidInvoiceCount = 0;
      // dInvoices is already sorted descending by date.
      for (const v of dInvoices) {
        if (remaining <= 0.0001) break;
        const amt = Number(v.amount) || 0;
        if (amt <= 0) continue;
        const unpaidPortion = Math.min(amt, remaining);
        remaining -= unpaidPortion;
        unpaidInvoiceCount += 1;
        if (v.voucher_date && cp != null) {
          const dueIso = addDaysIso(v.voucher_date, cp);
          if (dueIso < today) {
            overdue += unpaidPortion;
            overdueCount += 1;
          }
        }
      }
      return {
        debtor: d, key: k, cp, salesRep,
        outstanding: d.closing_balance,
        overdue, overdueCount, invoiceCount: unpaidInvoiceCount,
      };
    }).filter(r =>
      r.salesRep !== 'IntraCompany' &&
      Math.abs(r.outstanding) > 0.5
    );
  }, [debtors, salesByDebtor, overrideMap]);

  // Sales-rep sub-tab
  const [repTab, setRepTab] = useState<string>('__all__');
  const repCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const key = r.salesRep || '__unassigned__';
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [rows]);

  const repFilteredRows = useMemo(() => {
    if (repTab === '__all__') return rows;
    if (repTab === '__unassigned__') return rows.filter(r => !r.salesRep);
    return rows.filter(r => r.salesRep === repTab);
  }, [rows, repTab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? repFilteredRows.filter(r => r.debtor.name.toLowerCase().includes(q) || (r.debtor.gstin || '').toLowerCase().includes(q)) : repFilteredRows;
    return [...base].sort((a, b) => Math.abs(b.outstanding) - Math.abs(a.outstanding));
  }, [repFilteredRows, search]);

  const totals = useMemo(() => {
    return filtered.reduce((acc, r) => {
      acc.outstanding += r.outstanding;
      acc.overdue += r.overdue;
      return acc;
    }, { outstanding: 0, overdue: 0 });
  }, [filtered]);

  const selectedRow = selectedKey ? rows.find(r => r.key === selectedKey) : null;

  const missingCp = filtered.some(r => r.cp == null);

  // Build the list of rep tabs from dropdown options + any reps actually used
  const repTabValues = useMemo(() => {
    const used = new Set<string>();
    for (const r of rows) if (r.salesRep) used.add(r.salesRep);
    // Predictable order: registered options first, then any extras, then unassigned
    const list: string[] = [];
    for (const v of Array.from(used).sort()) list.push(v);
    if (rows.some(r => !r.salesRep)) list.push('__unassigned__');
    return list;
  }, [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-lg">Payment Summary</CardTitle>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-1">
              <span>Active debtors: <strong className="text-foreground">{filtered.length}</strong></span>
              <span>Total outstanding: <strong className="text-foreground">{fmtINR(totals.outstanding)}</strong></span>
              <span className={totals.overdue > 0 ? 'text-destructive' : ''}>
                Total overdue: <strong>{fmtINR(totals.overdue)}</strong>
              </span>
              {missingCp && <span className="text-amber-600">Some debtors have no credit period — overdue may be understated.</span>}
            </div>
          </div>
          <Input placeholder="Search name / GSTIN..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        </CardHeader>
        <div className="px-6">
          <Tabs value={repTab} onValueChange={setRepTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="__all__">All ({rows.length})</TabsTrigger>
              {repTabValues.map(v => (
                <TabsTrigger key={v} value={v}>
                  {v === '__unassigned__' ? 'Unassigned' : v} ({repCounts.get(v) || 0})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ledger</TableHead>
                  <TableHead className="text-right">Open Invoices</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Overdue Invoices</TableHead>
                  <TableHead className="w-[120px]">Credit Period</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{isLoading ? 'Loading...' : 'No active debtors with pending invoices'}</TableCell></TableRow>
                ) : filtered.map(r => (
                  <TableRow
                    key={r.key}
                    className={`cursor-pointer hover:bg-muted/30 ${selectedKey === r.key ? 'bg-muted/40' : ''}`}
                    onClick={() => setSelectedKey(r.key)}
                  >
                    <TableCell className="font-medium">{r.debtor.name}</TableCell>
                    <TableCell className="text-right">{r.invoiceCount}</TableCell>
                    <TableCell className="text-right font-medium">{fmtINR(r.outstanding)}</TableCell>
                    <TableCell className={`text-right font-medium ${r.overdue > 0 ? 'text-destructive' : ''}`}>{fmtINR(r.overdue)}</TableCell>
                    <TableCell className="text-right">{r.overdueCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.cp == null ? '—' : `${r.cp} days`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedRow} onOpenChange={(open) => { if (!open) setSelectedKey(null); }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedRow?.debtor.name || 'Debtor'}</DialogTitle>
          </DialogHeader>
          {selectedRow && (
            <DebtorInvoiceCycleCard
              debtor={selectedRow.debtor}
              sales={sales}
              debtorCredits={debtorCredits}
              creditPeriod={selectedRow.cp}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreditPeriodInput({
  debtor, current, onSaved,
}: { debtor: SnapshotLedger; current: number | null; onSaved: () => void }) {
  const [val, setVal] = useState<string>(current == null ? '' : String(current));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    const n = val.trim() === '' ? null : Number(val);
    if (n != null && (isNaN(n) || n < 0)) {
      toast.error('Invalid credit period');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tally_debtor_overrides')
        .upsert(
          { company: debtor.company, ledger_name: debtor.name, credit_period_days: n },
          { onConflict: 'company,ledger_name' }
        );
      if (error) throw error;
      toast.success('Saved');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Input
      type="number"
      min={0}
      value={val}
      placeholder="—"
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        const cur = current == null ? '' : String(current);
        if (val !== cur) save();
      }}
      onWheel={(e) => (e.target as HTMLInputElement).blur()}
      className="h-8 w-24"
      disabled={saving}
    />
  );
}

function DebtorInvoiceCycleCard({
  debtor, sales, debtorCredits, creditPeriod,
}: {
  debtor: SnapshotLedger;
  sales: SnapshotVoucher[];
  debtorCredits: SnapshotDebtorCredit[];
  creditPeriod: number | null;
}) {
  const ledgerLow = debtor.name.toLowerCase();
  const dInvoices = sales.filter(v =>
    v.company === debtor.company &&
    (v.party_name || '').toLowerCase() === ledgerLow
  );

  // Outstanding from Tally closing balance. Tally stores debtor balances on the
  // Cr side (negative in <AMOUNT>), so we take the absolute value as the receivable.
  const outstanding = Math.abs(Number(debtor.closing_balance) || 0);

  // Identify unpaid invoices: walk from most recent backward, summing invoice amounts
  // until they cover the outstanding. The oldest invoice in this set may be partially paid.
  type UnpaidRow = {
    voucher: SnapshotVoucher;
    amount: number;
    unpaid: number;
    paid: number;
    dueDate: string | null;
    overdueDays: number | null;
    status: 'partial' | 'open' | 'overdue';
  };

  const unpaidRows = useMemo<UnpaidRow[]>(() => {
    const sortedDesc = [...dInvoices].sort((a, b) =>
      (b.voucher_date || '').localeCompare(a.voucher_date || '')
    );
    const today = todayIso();
    const picked: UnpaidRow[] = [];
    let remaining = outstanding;
    for (const v of sortedDesc) {
      if (remaining <= 0.0001) break;
      const amt = Number(v.amount) || 0;
      if (amt <= 0) continue;
      const unpaidPortion = Math.min(amt, remaining);
      const paidPortion = amt - unpaidPortion;
      remaining -= unpaidPortion;

      let dueDate: string | null = null;
      let overdueDays: number | null = null;
      if (v.voucher_date && creditPeriod != null) {
        const due = new Date(v.voucher_date);
        due.setDate(due.getDate() + creditPeriod);
        dueDate = due.toISOString().slice(0, 10);
        const od = daysBetween(dueDate, today);
        overdueDays = od > 0 ? od : 0;
      }
      const isOverdue = (overdueDays || 0) > 0;
      const status: UnpaidRow['status'] =
        paidPortion > 0.0001 ? 'partial' : (isOverdue ? 'overdue' : 'open');
      picked.push({
        voucher: v, amount: amt, unpaid: unpaidPortion, paid: paidPortion,
        dueDate, overdueDays, status,
      });
    }
    return picked;
  }, [dInvoices, outstanding, creditPeriod]);

  const totalUnpaid = unpaidRows.reduce((s, m) => s + m.unpaid, 0);
  const overdueCount = unpaidRows.filter(m => (m.overdueDays || 0) > 0).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{debtor.name}</CardTitle>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
          <span>Outstanding: <strong className="text-foreground">{fmtINR(outstanding)}</strong></span>
          <span>Unpaid invoices: <strong className="text-foreground">{unpaidRows.length}</strong></span>
          <span>Sum (unpaid): <strong className="text-foreground">{fmtINR(totalUnpaid)}</strong></span>
          {overdueCount > 0 && <span className="text-destructive">Overdue: <strong>{overdueCount}</strong></span>}
          {creditPeriod == null && <span className="text-amber-600">Set credit period to see due dates &amp; overdue</span>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Unpaid</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Overdue Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unpaidRows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No unpaid invoices</TableCell></TableRow>
              ) : unpaidRows.map((m, i) => (
                <TableRow key={i} className={m.status === 'overdue' ? 'bg-destructive/5' : ''}>
                  <TableCell className="font-medium">{m.voucher.voucher_number || '—'}</TableCell>
                  <TableCell>{m.voucher.voucher_date || '—'}</TableCell>
                  <TableCell className="text-right">{fmtINR(m.amount)}</TableCell>
                  <TableCell className="text-right">{fmtINR(m.paid)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtINR(m.unpaid)}</TableCell>
                  <TableCell>{m.dueDate || '—'}</TableCell>
                  <TableCell><StatusBadge status={m.status} /></TableCell>
                  <TableCell className={`text-right font-medium ${m.overdueDays && m.overdueDays > 0 ? 'text-destructive' : ''}`}>
                    {m.overdueDays == null ? '—' : m.overdueDays}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: InvoiceMatch['status'] }) {
  const map: Record<InvoiceMatch['status'], { label: string; cls: string }> = {
    paid: { label: 'Paid', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
    partial: { label: 'Partial', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
    open: { label: 'Open', cls: 'bg-muted text-muted-foreground border' },
    overdue: { label: 'Overdue', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
  };
  const v = map[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${v.cls}`}>{v.label}</span>;
}

// ============================================================
// 2) Sales & Purchases Module
// ============================================================

function SalesPurchasesModule({
  sales, purchases, debtors, overrides, fromDate, toDate, setFromDate, setToDate, inRange, onChangedOverride,
}: {
  sales: SnapshotVoucher[];
  purchases: SnapshotVoucher[];
  debtors: SnapshotLedger[];
  overrides: DebtorOverride[];
  fromDate: string; toDate: string;
  setFromDate: (s: string) => void; setToDate: (s: string) => void;
  inRange: (d: string | null) => boolean;
  onChangedOverride: () => void;
}) {
  return (
    <Tabs defaultValue="sales">
      <TabsList>
        <TabsTrigger value="sales">Sales</TabsTrigger>
        <TabsTrigger value="purchases">Purchases</TabsTrigger>
      </TabsList>
      <TabsContent value="sales">
        <SalesTab
          sales={sales} debtors={debtors} overrides={overrides}
          fromDate={fromDate} toDate={toDate}
          setFromDate={setFromDate} setToDate={setToDate}
          inRange={inRange}
          onChangedOverride={onChangedOverride}
        />
      </TabsContent>
      <TabsContent value="purchases">
        <PurchasesTab
          purchases={purchases}
          fromDate={fromDate} toDate={toDate}
          setFromDate={setFromDate} setToDate={setToDate}
          inRange={inRange}
        />
      </TabsContent>
    </Tabs>
  );
}

function SalesTab({
  sales, debtors, overrides, fromDate, toDate, setFromDate, setToDate, inRange, onChangedOverride,
}: {
  sales: SnapshotVoucher[];
  debtors: SnapshotLedger[];
  overrides: DebtorOverride[];
  fromDate: string; toDate: string;
  setFromDate: (s: string) => void; setToDate: (s: string) => void;
  inRange: (d: string | null) => boolean;
  onChangedOverride: () => void;
}) {
  const overrideMap = useMemo(() => {
    const m = new Map<DebtorKey, DebtorOverride>();
    for (const o of overrides) m.set(dkey(o.company, o.ledger_name), o);
    return m;
  }, [overrides]);

  const debtorMap = useMemo(() => {
    const m = new Map<DebtorKey, SnapshotLedger>();
    for (const d of debtors) m.set(dkey(d.company, d.name), d);
    return m;
  }, [debtors]);

  const inRangeSales = useMemo(() => sales.filter(v => inRange(v.voucher_date)), [sales, fromDate, toDate, inRange]);

  const totalQty = useMemo(() => {
    // Sum qty across line items if available
    return inRangeSales.reduce((s, v) => s + (v.items || []).reduce((q, it) => q + (it.qty || 0), 0), 0);
  }, [inRangeSales]);
  const totalAmt = useMemo(() => inRangeSales.reduce((s, v) => s + v.amount, 0), [inRangeSales]);
  const customerCount = useMemo(
    () => new Set(inRangeSales.map(v => `${v.company}::${(v.party_name || '').toLowerCase()}`)).size,
    [inRangeSales]
  );

  const today = todayIso();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-lg">Sales</CardTitle>
          <DateRange fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-2">
          <span>Total invoices: <strong className="text-foreground">{inRangeSales.length}</strong></span>
          <span>Total quantity: <strong className="text-foreground">{totalQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
          <span>Total amount: <strong className="text-foreground">{fmtINR(totalAmt)}</strong></span>
          <span>Customers invoiced: <strong className="text-foreground">{customerCount}</strong></span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[120px]">Credit Period</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Overdue Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inRangeSales.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No sales in selected range</TableCell></TableRow>
              ) : inRangeSales.map(v => {
                const k = dkey(v.company, v.party_name || '');
                const ov = overrideMap.get(k);
                const debtor = debtorMap.get(k);
                const cp = ov?.credit_period_days ?? null;
                let due: string | null = null;
                let overdueDays: number | null = null;
                if (v.voucher_date && cp != null) {
                  const d = new Date(v.voucher_date);
                  d.setDate(d.getDate() + cp);
                  due = d.toISOString().slice(0, 10);
                  overdueDays = Math.max(0, daysBetween(due, today));
                }
                const qty = (v.items || []).reduce((q, it) => q + (it.qty || 0), 0);
                return (
                  <TableRow key={v.id}>
                    <TableCell><Badge variant="outline">{v.company}</Badge></TableCell>
                    <TableCell>{v.voucher_date || '—'}</TableCell>
                    <TableCell className="font-medium">{v.voucher_number || '—'}</TableCell>
                    <TableCell>{v.party_name || '—'}</TableCell>
                    <TableCell className="text-right">{qty ? qty.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</TableCell>
                    <TableCell className="text-right font-medium">{fmtINR(v.amount)}</TableCell>
                    <TableCell>
                      {debtor ? (
                        <CreditPeriodInput debtor={debtor} current={cp} onSaved={onChangedOverride} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{due || '—'}</TableCell>
                    <TableCell className={`text-right ${overdueDays && overdueDays > 0 ? 'text-destructive font-medium' : ''}`}>
                      {overdueDays == null ? '—' : overdueDays}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PurchasesTab({
  purchases, fromDate, toDate, setFromDate, setToDate, inRange,
}: {
  purchases: SnapshotVoucher[];
  fromDate: string; toDate: string;
  setFromDate: (s: string) => void; setToDate: (s: string) => void;
  inRange: (d: string | null) => boolean;
}) {
  const inRangeP = useMemo(() => purchases.filter(v => inRange(v.voucher_date)), [purchases, fromDate, toDate, inRange]);
  const totalQty = inRangeP.reduce((s, v) => s + (v.items || []).reduce((q, it) => q + (it.qty || 0), 0), 0);
  const totalAmt = inRangeP.reduce((s, v) => s + v.amount, 0);
  const vendorCount = new Set(inRangeP.map(v => `${v.company}::${(v.party_name || '').toLowerCase()}`)).size;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-lg">Purchases</CardTitle>
          <DateRange fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-2">
          <span>Total invoices: <strong className="text-foreground">{inRangeP.length}</strong></span>
          <span>Total quantity: <strong className="text-foreground">{totalQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
          <span>Total amount: <strong className="text-foreground">{fmtINR(totalAmt)}</strong></span>
          <span>Vendors purchased from: <strong className="text-foreground">{vendorCount}</strong></span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inRangeP.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No purchases in selected range</TableCell></TableRow>
              ) : inRangeP.map(v => {
                const qty = (v.items || []).reduce((q, it) => q + (it.qty || 0), 0);
                return (
                  <TableRow key={v.id}>
                    <TableCell><Badge variant="outline">{v.company}</Badge></TableCell>
                    <TableCell>{v.voucher_date || '—'}</TableCell>
                    <TableCell className="font-medium">{v.voucher_number || '—'}</TableCell>
                    <TableCell>{v.party_name || '—'}</TableCell>
                    <TableCell className="text-right">{qty ? qty.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</TableCell>
                    <TableCell className="text-right font-medium">{fmtINR(v.amount)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 3) Banking Module
// ============================================================

function BankingModule({
  banks, bankTxns, fromDate, toDate, setFromDate, setToDate, inRange,
}: {
  banks: SnapshotLedger[];
  bankTxns: SnapshotBankTxn[];
  fromDate: string; toDate: string;
  setFromDate: (s: string) => void; setToDate: (s: string) => void;
  inRange: (d: string | null) => boolean;
}) {
  return (
    <Tabs defaultValue="working-capital">
      <TabsList>
        <TabsTrigger value="working-capital">Working Capital</TabsTrigger>
        <TabsTrigger value="transactions">Transactions</TabsTrigger>
      </TabsList>

      <TabsContent value="working-capital">
        <WorkingCapitalTab banks={banks} />
      </TabsContent>

      <TabsContent value="transactions">
        <BankTransactionsTab
          bankTxns={bankTxns}
          fromDate={fromDate} toDate={toDate}
          setFromDate={setFromDate} setToDate={setToDate}
          inRange={inRange}
        />
      </TabsContent>
    </Tabs>
  );
}

function WorkingCapitalTab({ banks }: { banks: SnapshotLedger[] }) {
  const total = banks.reduce((s, b) => s + (b.closing_balance || 0), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Bank Balances</CardTitle>
        <div className="text-xs text-muted-foreground mt-1">
          Total balance across all banks: <strong className="text-foreground">{fmtINR(total)}</strong> · {banks.length} accounts
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Bank Ledger</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {banks.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No bank ledgers</TableCell></TableRow>
              ) : [...banks].sort((a, b) => Math.abs(b.closing_balance) - Math.abs(a.closing_balance)).map((b, i) => (
                <TableRow key={i}>
                  <TableCell><Badge variant="outline">{b.company}</Badge></TableCell>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-right font-medium">{fmtINR(b.closing_balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function BankTransactionsTab({
  bankTxns, fromDate, toDate, setFromDate, setToDate, inRange,
}: {
  bankTxns: SnapshotBankTxn[];
  fromDate: string; toDate: string;
  setFromDate: (s: string) => void; setToDate: (s: string) => void;
  inRange: (d: string | null) => boolean;
}) {
  const filtered = useMemo(() => bankTxns.filter(t => inRange(t.voucher_date)), [bankTxns, fromDate, toDate, inRange]);

  const inflow = filtered.filter(t => t.bank_is_debit).reduce((s, t) => s + Math.abs(t.bank_amount), 0);
  const outflow = filtered.filter(t => !t.bank_is_debit).reduce((s, t) => s + Math.abs(t.bank_amount), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-lg">Bank Transactions</CardTitle>
          <DateRange fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <SummaryStat icon={<ArrowDownCircle className="h-4 w-4 text-emerald-600" />} label="Inflow (range)" value={fmtINR(inflow)} />
          <SummaryStat icon={<ArrowUpCircle className="h-4 w-4 text-destructive" />} label="Outflow (range)" value={fmtINR(outflow)} />
          <SummaryStat icon={<RefreshCw className="h-4 w-4 text-muted-foreground" />} label="Net" value={fmtINR(inflow - outflow)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Voucher #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No bank transactions in selected range</TableCell></TableRow>
              ) : filtered.map(t => (
                <TableRow key={`${t.id}-${t.bank_ledger}`}>
                  <TableCell><Badge variant="outline">{t.company}</Badge></TableCell>
                  <TableCell>{t.voucher_date || '—'}</TableCell>
                  <TableCell>{t.voucher_number || '—'}</TableCell>
                  <TableCell className="text-xs capitalize">{t.kind}</TableCell>
                  <TableCell>{t.bank_ledger}</TableCell>
                  <TableCell>{t.party_name || '—'}</TableCell>
                  <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                    {t.bank_is_debit ? fmtINR(Math.abs(t.bank_amount)) : ''}
                  </TableCell>
                  <TableCell className="text-right text-destructive">
                    {!t.bank_is_debit ? fmtINR(Math.abs(t.bank_amount)) : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Shared small components
// ============================================================

function SummaryStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2 flex items-center gap-3">
      <div>{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold tracking-tight">{value}</div>
      </div>
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
            Check that Tally is running with "Act as Server" enabled on port 9000.
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
