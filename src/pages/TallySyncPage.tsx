import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCcw, Pause, Play, Loader2 } from 'lucide-react';

type SyncFn = 'sync-current-month' | 'sync-last-month' | 'sync-historical';

const TALLY_URL = 'http://103.239.89.153:9000';

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function hoursAgo(iso?: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
}

export default function TallySyncPage() {
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [paused, setPaused] = useState(false);

  // Connection ping every 60s
  const ping = useQuery({
    queryKey: ['tally-ping'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('tally-ping', {
        body: { url: TALLY_URL },
      });
      if (error) throw error;
      return data as { reachable: boolean; url: string; error: string | null };
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Sync log
  const logQ = useQuery({
    queryKey: ['tally-sync-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tally_sync_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  // Companies
  const companiesQ = useQuery({
    queryKey: ['tally-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tally_companies')
        .select('*')
        .eq('is_active', true)
        .order('company_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Counts
  const countsQ = useQuery({
    queryKey: ['tally-counts'],
    queryFn: async () => {
      const [v, l] = await Promise.all([
        supabase.from('tally_vouchers').select('*', { count: 'exact', head: true }),
        supabase.from('tally_ledger_balances').select('*', { count: 'exact', head: true }),
      ]);
      return { vouchers: v.count ?? 0, ledgers: l.count ?? 0 };
    },
    refetchInterval: 10000,
  });

  const logs = logQ.data ?? [];

  const lastByType = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of logs) {
      if (r.status !== 'completed') continue;
      if (!map[r.sync_type] || new Date(r.completed_at) > new Date(map[r.sync_type].completed_at)) {
        map[r.sync_type] = r;
      }
    }
    return map;
  }, [logs]);

  const runningHistorical = useMemo(
    () => logs.find((r) => r.sync_type === 'historical' && r.status === 'running'),
    [logs]
  );

  const completedHistoricalChunks = useMemo(() => {
    const set = new Set<string>();
    for (const r of logs) {
      if (r.sync_type === 'historical' && r.status === 'completed' && r.chunk_label) {
        set.add(r.chunk_label);
      }
    }
    return set.size;
  }, [logs]);

  const lastFailed = useMemo(() => logs.find((r) => r.status === 'failed'), [logs]);

  const lastSuccess = useMemo(
    () => logs.find((r) => r.status === 'completed' && r.completed_at),
    [logs]
  );

  const lastSuccessHours = hoursAgo(lastSuccess?.completed_at);

  const triggerSync = useMutation({
    mutationFn: async (fn: SyncFn) => {
      // Historical sync processes in small batches per call to avoid the
      // 150s edge-function timeout. Loop until the function reports done.
      if (fn === 'sync-historical') {
        let lastData: any = null;
        let safety = 200; // hard cap to avoid runaway loops
        while (safety-- > 0) {
          const { data, error } = await supabase.functions.invoke(fn, { body: {} });
          if (error) throw error;
          lastData = data;
          qc.invalidateQueries({ queryKey: ['tally-sync-log'] });
          qc.invalidateQueries({ queryKey: ['tally-counts'] });
          if (data?.done) break;
        }
        return { fn, data: lastData } as { fn: SyncFn; data: any };
      }
      const { data, error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      return { fn, data } as { fn: SyncFn; data: any };
    },
    onSuccess: ({ fn, data }) => {
      const ok = data?.ok_count ?? 0;
      const fail = data?.fail_count ?? 0;
      const total = ok + fail;
      const label =
        fn === 'sync-current-month' ? 'Current month' :
        fn === 'sync-last-month' ? 'Last month' : 'Historical';
      if (fn === 'sync-historical') {
        toast.success(`${label} sync complete`);
      } else if (fail === 0 && total > 0) {
        toast.success(`${label} sync complete — ${ok} of ${total} companies OK`);
      } else if (ok > 0 && fail > 0) {
        const firstErr = (data?.results ?? []).find((r: any) => !r.ok)?.error;
        toast.warning(`${label}: ${ok} ok, ${fail} failed${firstErr ? ` — ${firstErr}` : ''}`);
      } else if (total === 0) {
        toast.info(`${label}: no active companies to sync`);
      } else {
        const firstErr = (data?.results ?? []).find((r: any) => !r.ok)?.error;
        toast.error(`${label} failed for all ${fail} companies${firstErr ? ` — ${firstErr}` : ''}`);
      }
      qc.invalidateQueries({ queryKey: ['tally-sync-log'] });
      qc.invalidateQueries({ queryKey: ['tally-counts'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Sync failed to start'),
  });

  const runningFn: SyncFn | null = triggerSync.isPending
    ? ((triggerSync.variables as SyncFn | undefined) ?? null)
    : null;

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((r) => {
      if (filterType !== 'all' && r.sync_type !== filterType) return false;
      if (filterCompany !== 'all' && r.company_name !== filterCompany) return false;
      return true;
    });
  }, [logs, filterType, filterCompany]);

  const lastAutoSync = lastByType['current_month']?.completed_at;

  // Historical progress
  const histTotal = 52;
  const histCurrent = completedHistoricalChunks;
  const histPct = Math.min(100, Math.round((histCurrent / histTotal) * 100));
  const histStatus =
    runningHistorical
      ? 'in_progress'
      : histCurrent >= histTotal
      ? 'completed'
      : histCurrent > 0
      ? 'paused'
      : 'not_started';

  const retryFailed = () => {
    if (!lastFailed) return;
    const map: Record<string, any> = {
      current_month: 'sync-current-month',
      last_month: 'sync-last-month',
      historical: 'sync-historical',
    };
    const fn = map[lastFailed.sync_type];
    if (fn) triggerSync.mutate(fn);
  };

  return (
    <TooltipProvider>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Tally Sync</h1>

        {/* Row 1 — Connection status */}
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                ping.data?.reachable ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-sm">
              {ping.data?.reachable ? 'Tally Connected' : 'Tally Not Reachable'} — {TALLY_URL}
            </span>
            {ping.data?.error && (
              <span className="text-xs text-muted-foreground">({ping.data.error})</span>
            )}
          </CardContent>
        </Card>

        {/* Row 2 — Sync buttons */}
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={runningFn === 'sync-current-month'}
                onClick={() => triggerSync.mutate('sync-current-month')}
              >
                {runningFn === 'sync-current-month' && <Loader2 className="h-4 w-4 animate-spin" />}
                Sync Current Month
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={runningFn === 'sync-last-month'}
                onClick={() => triggerSync.mutate('sync-last-month')}
              >
                {runningFn === 'sync-last-month' && <Loader2 className="h-4 w-4 animate-spin" />}
                Sync Last Month
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                    disabled={runningFn === 'sync-historical'}
                  >
                    {runningFn === 'sync-historical' && <Loader2 className="h-4 w-4 animate-spin" />}
                    Sync Full Year History
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Start full historical sync?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This fetches all data from April 2024 to March 2025 and runs for 15-20
                      minutes in the background. It will resume automatically if interrupted.
                      Start now?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => triggerSync.mutate('sync-historical')}>
                      Start now
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="text-xs text-muted-foreground">
              Current month syncs automatically every 4 hours. Last auto-sync:{' '}
              {formatDateTime(lastAutoSync)}
            </div>
          </CardContent>
        </Card>

        {/* Row 3 — Status cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <StatusCard
            title="Current Month Sync"
            time={lastByType['current_month']?.completed_at}
            records={lastByType['current_month']?.records_fetched}
          />
          <StatusCard
            title="Last Month Sync"
            time={lastByType['last_month']?.completed_at}
            records={lastByType['last_month']?.records_fetched}
          />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Historical Sync</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {histStatus === 'not_started' && 'Not Started'}
                {histStatus === 'in_progress' && `In Progress (${histCurrent} of ${histTotal} weeks)`}
                {histStatus === 'paused' && `Paused (${histCurrent} of ${histTotal} weeks)`}
                {histStatus === 'completed' && 'Completed'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total Records in Database</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {((countsQ.data?.vouchers ?? 0) + (countsQ.data?.ledgers ?? 0)).toLocaleString('en-IN')}
              </div>
              <div className="text-xs text-muted-foreground">
                Vouchers: {(countsQ.data?.vouchers ?? 0).toLocaleString('en-IN')} • Ledgers:{' '}
                {(countsQ.data?.ledgers ?? 0).toLocaleString('en-IN')}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 4 — Historical progress bar */}
        {runningHistorical && (
          <Card>
            <CardContent className="py-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  Syncing {runningHistorical.chunk_label ?? '—'} ({histCurrent} of {histTotal}) —
                  Company: {runningHistorical.company_name ?? '—'}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPaused(true);
                      toast.info('Will pause after current chunk completes');
                    }}
                    disabled={paused}
                  >
                    <Pause className="h-3 w-3 mr-1" />
                    Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPaused(false);
                      triggerSync.mutate('sync-historical');
                    }}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Resume
                  </Button>
                </div>
              </div>
              <Progress value={histPct} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{histPct}%</span>
                <span>
                  Estimated time remaining: ~{Math.max(0, (histTotal - histCurrent) * 0.4).toFixed(0)} min
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Row 6 — Error banner */}
        {lastFailed &&
          (!lastSuccess ||
            new Date(lastFailed.started_at) > new Date(lastSuccess.completed_at ?? 0)) && (
            <Alert
              variant="destructive"
              className="cursor-pointer"
              onClick={retryFailed}
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Sync failed at {formatDateTime(lastFailed.started_at)} —{' '}
                {lastFailed.error_message ?? 'Unknown error'} — Click to retry
              </AlertDescription>
            </Alert>
          )}

        {/* Row 7 — Data freshness warning */}
        {lastSuccessHours !== null && lastSuccessHours > 8 && (
          <Alert
            className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 cursor-pointer"
            onClick={() => triggerSync.mutate('sync-current-month')}
          >
            <RefreshCcw className="h-4 w-4" />
            <AlertDescription>
              Data may be outdated — last synced {lastSuccessHours} hours ago. Click to sync now.
            </AlertDescription>
          </Alert>
        )}

        {/* Row 5 — Sync log table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">Sync Log (last 50)</CardTitle>
            <div className="flex gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sync types</SelectItem>
                  <SelectItem value="current_month">Current month</SelectItem>
                  <SelectItem value="last_month">Last month</SelectItem>
                  <SelectItem value="historical">Historical</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCompany} onValueChange={setFilterCompany}>
                <SelectTrigger className="w-[180px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All companies</SelectItem>
                  {(companiesQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.company_name}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Sync Type</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Chunk</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      No sync runs yet
                    </TableCell>
                  </TableRow>
                )}
                {filteredLogs.map((r) => {
                  const dur =
                    r.completed_at && r.started_at
                      ? `${Math.round(
                          (new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) /
                            1000
                        )}s`
                      : '—';
                  const statusColor =
                    r.status === 'completed'
                      ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                      : r.status === 'failed'
                      ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                      : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400';
                  const row = (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{formatDateTime(r.started_at)}</TableCell>
                      <TableCell className="text-xs">{r.sync_type ?? '—'}</TableCell>
                      <TableCell className="text-xs">{r.company_name ?? '—'}</TableCell>
                      <TableCell className="text-xs">{r.chunk_label ?? '—'}</TableCell>
                      <TableCell className="text-right text-xs">
                        {(r.records_fetched ?? 0).toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="text-right text-xs">{dur}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColor}>
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                  if (r.status === 'failed' && r.error_message) {
                    return (
                      <Tooltip key={r.id}>
                        <TooltipTrigger asChild>{row}</TooltipTrigger>
                        <TooltipContent className="max-w-md">
                          <div className="text-xs whitespace-pre-wrap">{r.error_message}</div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  return row;
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function StatusCard({
  title,
  time,
  records,
}: {
  title: string;
  time?: string | null;
  records?: number | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-semibold">
          {(records ?? 0).toLocaleString('en-IN')} records
        </div>
        <div className="text-xs text-muted-foreground">Last synced: {formatDateTime(time)}</div>
      </CardContent>
    </Card>
  );
}
