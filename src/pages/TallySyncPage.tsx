import { useEffect, useMemo, useRef, useState } from 'react';
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

type SyncFn = 'sync-current-month' | 'sync-last-month' | 'sync-historical' | 'sync-current-fy';

// FY = India fiscal year, Apr 1 -> Mar 31
function getFyWindows() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fyStartYear = m >= 3 ? y : y - 1;
  const prevFyStart = new Date(fyStartYear - 1, 3, 1);
  const prevFyEnd = new Date(fyStartYear, 2, 31);
  const currFyStart = new Date(fyStartYear, 3, 1);
  return { prevFyStart, prevFyEnd, currFyStart, currFyEnd: now };
}

// --- Frontend chunk generator (mirrors weekly chunking from old edge fn) ---
function fmtYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
function isoWeek(d: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { year: target.getUTCFullYear(), week };
}
function buildWeeklyChunks(start: Date, end: Date, suffix = ''): { label: string; from: string; to: string }[] {
  const chunks: { label: string; from: string; to: string }[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + 6);
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    const { year, week } = isoWeek(cursor);
    const label = `${year}-W${String(week).padStart(2, '0')}${suffix}`;
    chunks.push({ label, from: fmtYYYYMMDD(cursor), to: fmtYYYYMMDD(actualEnd) });
    cursor = new Date(actualEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function weeksBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (7 * 24 * 3600 * 1000)));
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function hoursAgo(iso?: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
}

const CHUNKED_SYNCS = {
  'sync-historical': { syncType: 'historical', label: 'Previous FY' },
  'sync-current-fy': { syncType: 'current_fy', label: 'Current FY (YTD)' },
} as const;

export default function TallySyncPage() {
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');

  // Independent pause states for each chunked sync
  const [pausedHist, setPausedHist] = useState(false);
  const [pausedCurrFy, setPausedCurrFy] = useState(false);
  const pausedHistRef = useRef(false);
  const pausedCurrFyRef = useRef(false);
  useEffect(() => { pausedHistRef.current = pausedHist; }, [pausedHist]);
  useEffect(() => { pausedCurrFyRef.current = pausedCurrFy; }, [pausedCurrFy]);

  const fyWindows = useMemo(() => getFyWindows(), []);
  const prevFyTotal = useMemo(
    () => weeksBetween(fyWindows.prevFyStart, fyWindows.prevFyEnd),
    [fyWindows]
  );
  const currFyTotal = useMemo(
    () => weeksBetween(fyWindows.currFyStart, fyWindows.currFyEnd),
    [fyWindows]
  );

  const ping = useQuery({
    queryKey: ['tally-ping'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('tally-ping', {
        body: {},
      });
      if (error) throw error;
      return data as {
        reachable: boolean;
        url: string;
        via: 'tunnel' | 'direct' | null;
        error: string | null;
      };
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

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
  const runningCurrFy = useMemo(
    () => logs.find((r) => r.sync_type === 'current_fy' && r.status === 'running'),
    [logs]
  );

  const completedChunksByType = useMemo(() => {
    const map: Record<string, Set<string>> = { historical: new Set(), current_fy: new Set() };
    for (const r of logs) {
      if (r.status === 'completed' && r.chunk_label && map[r.sync_type]) {
        map[r.sync_type].add(r.chunk_label);
      }
    }
    return { historical: map.historical.size, current_fy: map.current_fy.size };
  }, [logs]);

  const lastFailed = useMemo(() => logs.find((r) => r.status === 'failed'), [logs]);
  const lastSuccess = useMemo(
    () => logs.find((r) => r.status === 'completed' && r.completed_at),
    [logs]
  );
  const lastSuccessHours = hoursAgo(lastSuccess?.completed_at);

  const triggerSync = useMutation({
    mutationFn: async (fn: SyncFn) => {
      // --- Client-orchestrated historical sync (one chunk per edge call) ---
      if (fn === 'sync-historical') {
        // 1. Reset pause flag
        await supabase
          .from('tally_sync_control')
          .upsert({ sync_type: 'historical', is_paused: false }, { onConflict: 'sync_type' });

        // 2. Load active companies
        const { data: companies, error: cErr } = await supabase
          .from('tally_companies')
          .select('company_name')
          .eq('is_active', true)
          .order('company_name');
        if (cErr) throw cErr;
        if (!companies || companies.length === 0) {
          toast.info('No active companies to sync');
          return { fn, data: { done: true } } as { fn: SyncFn; data: any };
        }

        // 3. Build full chunk list for previous FY
        const { prevFyStart, prevFyEnd } = getFyWindows();
        const chunks = buildWeeklyChunks(prevFyStart, prevFyEnd);
        if (chunks.length === 0) {
          toast.info('No chunks to process');
          return { fn, data: { done: true } } as { fn: SyncFn; data: any };
        }

        // 4. Load already-completed chunk labels per company (resume support)
        const { data: doneRows } = await supabase
          .from('tally_sync_log')
          .select('company_name, chunk_label')
          .eq('sync_type', 'historical')
          .eq('status', 'completed')
          .not('chunk_label', 'is', null);
        const completed = new Set<string>(
          (doneRows ?? []).map((r) => `${r.company_name}::${r.chunk_label}`),
        );

        let okCount = 0;
        let failCount = 0;
        let firstErr: string | null = null;

        // 5. Loop: company × chunk, single edge-fn call each
        for (const c of companies) {
          let firstChunkForCompany = true;
          for (const ch of chunks) {
            // Pause check (DB-backed so it survives reload)
            if (pausedHistRef.current) {
              toast.info('Previous FY sync paused');
              return { fn, data: { paused: true, ok_count: okCount, fail_count: failCount } } as any;
            }
            const { data: ctrl } = await supabase
              .from('tally_sync_control')
              .select('is_paused')
              .eq('sync_type', 'historical')
              .maybeSingle();
            if (ctrl?.is_paused) {
              setPausedHist(true);
              pausedHistRef.current = true;
              toast.info('Previous FY sync paused');
              return { fn, data: { paused: true, ok_count: okCount, fail_count: failCount } } as any;
            }

            const key = `${c.company_name}::${ch.label}`;
            if (completed.has(key)) {
              firstChunkForCompany = false;
              continue;
            }

            try {
              const { data, error } = await supabase.functions.invoke('sync-historical-chunk', {
                body: {
                  company_name: c.company_name,
                  from_date: ch.from,
                  to_date: ch.to,
                  chunk_label: ch.label,
                  sync_type: 'historical',
                  fetch_ledgers: firstChunkForCompany,
                },
              });
              if (error) throw error;
              if (data?.success === false) {
                failCount++;
                if (!firstErr) firstErr = data?.engine?.error || 'Chunk failed';
              } else {
                okCount++;
              }
            } catch (e: any) {
              failCount++;
              if (!firstErr) firstErr = e?.message || String(e);
            }

            firstChunkForCompany = false;
            qc.invalidateQueries({ queryKey: ['tally-sync-log'] });
            qc.invalidateQueries({ queryKey: ['tally-counts'] });
          }
        }

        return {
          fn,
          data: { done: true, ok_count: okCount, fail_count: failCount, first_error: firstErr },
        } as { fn: SyncFn; data: any };
      }

      // --- Chunked orchestrators: each edge call processes one small safe slice ---
      if (fn === 'sync-current-fy' || fn === 'sync-last-month') {
        const syncType = fn === 'sync-last-month' ? 'last_month' : CHUNKED_SYNCS[fn].syncType;
        const label = fn === 'sync-last-month' ? 'Last month' : CHUNKED_SYNCS[fn].label;
        const pauseRef = fn === 'sync-current-fy' ? pausedCurrFyRef : { current: false };

        await supabase
          .from('tally_sync_control')
          .upsert({ sync_type: syncType, is_paused: false }, { onConflict: 'sync_type' });

        let lastData: any = null;
        let okCount = 0;
        let failCount = 0;
        let firstErr: string | null = null;
        let safety = 200;
        while (safety-- > 0) {
          if (pauseRef.current) {
            toast.info(`${label} sync paused`);
            break;
          }
          const { data, error } = await supabase.functions.invoke(fn, { body: {} });
          if (error) throw error;
          lastData = data;
          if (data?.success === false) {
            const e = data?.error || data?.summary?.flatMap((s: any) => s.results ?? []).find((r: any) => !r.ok)?.error;
            failCount++;
            if (!firstErr) firstErr = e || `${label} chunk failed`;
          } else if ((data?.processed_this_call ?? 0) > 0) {
            okCount++;
          }
          qc.invalidateQueries({ queryKey: ['tally-sync-log'] });
          qc.invalidateQueries({ queryKey: ['tally-counts'] });
          if (data?.paused) {
            toast.info(`${label} sync paused`);
            break;
          }
          if (data?.done) break;
          if (pauseRef.current) {
            toast.info(`${label} sync paused`);
            break;
          }
        }
        return {
          fn,
          data: { ...(lastData || {}), ok_count: okCount, fail_count: failCount, first_error: firstErr },
        } as { fn: SyncFn; data: any };
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
        fn === 'sync-last-month' ? 'Last month' :
        fn === 'sync-historical' ? 'Previous FY' : 'Current FY (YTD)';
      if (fn === 'sync-historical' || fn === 'sync-last-month' || fn === 'sync-current-fy') {
        if (data?.paused) {
          // toast already shown
        } else if (fail === 0 && ok > 0) {
          toast.success(`${label} sync complete — ${ok} chunks processed`);
        } else if (ok > 0 && fail > 0) {
          toast.warning(`${label}: ${ok} ok, ${fail} failed${data?.first_error ? ` — ${data.first_error}` : ''}`);
        } else if (ok === 0 && fail === 0) {
          toast.info(`${label}: nothing to sync (already complete)`);
        } else {
          toast.error(`${label} failed${data?.first_error ? ` — ${data.first_error}` : ''}`);
        }
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

  // Aggregate chunked logs into one row per (sync_type, company_name) so users
  // see whole-period status (with date range) instead of week-by-week chunks.
  const aggregatedLogs = useMemo(() => {
    type AggRow = {
      id: string;
      sync_type: string | null;
      company_name: string | null;
      started_at: string;
      completed_at: string | null;
      records_fetched: number;
      statuses: Set<string>;
      error_message: string | null;
      chunks_total: number;
      chunks_done: number;
      chunks_failed: number;
      chunks_running: number;
    };
    const map = new Map<string, AggRow>();
    for (const r of logs) {
      const key = `${r.sync_type}::${r.company_name ?? ''}`;
      const cur = map.get(key);
      if (!cur) {
        map.set(key, {
          id: r.id,
          sync_type: r.sync_type,
          company_name: r.company_name,
          started_at: r.started_at,
          completed_at: r.completed_at,
          records_fetched: r.records_fetched ?? 0,
          statuses: new Set([r.status]),
          error_message: r.status === 'failed' ? r.error_message : null,
          chunks_total: 1,
          chunks_done: r.status === 'completed' ? 1 : 0,
          chunks_failed: r.status === 'failed' ? 1 : 0,
          chunks_running: r.status === 'running' ? 1 : 0,
        });
      } else {
        cur.chunks_total += 1;
        if (r.status === 'completed') cur.chunks_done += 1;
        else if (r.status === 'failed') cur.chunks_failed += 1;
        else if (r.status === 'running') cur.chunks_running += 1;
        cur.statuses.add(r.status);
        cur.records_fetched += r.records_fetched ?? 0;
        if (new Date(r.started_at) < new Date(cur.started_at)) cur.started_at = r.started_at;
        if (r.completed_at && (!cur.completed_at || new Date(r.completed_at) > new Date(cur.completed_at))) {
          cur.completed_at = r.completed_at;
        }
        if (r.status === 'failed' && !cur.error_message) cur.error_message = r.error_message;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );
  }, [logs]);

  // Date range label per sync_type (whole period being synced)
  const dateRangeForType = (syncType: string | null): string => {
    if (!syncType) return '—';
    const now = new Date();
    if (syncType === 'current_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return `${fmtDate(start)} – ${fmtDate(now)}`;
    }
    if (syncType === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return `${fmtDate(start)} – ${fmtDate(end)}`;
    }
    if (syncType === 'historical') {
      return `${fmtDate(fyWindows.prevFyStart)} – ${fmtDate(fyWindows.prevFyEnd)}`;
    }
    if (syncType === 'current_fy') {
      return `${fmtDate(fyWindows.currFyStart)} – ${fmtDate(fyWindows.currFyEnd)}`;
    }
    return '—';
  };

  const filteredLogs = useMemo(() => {
    return aggregatedLogs.filter((r) => {
      if (filterType !== 'all' && r.sync_type !== filterType) return false;
      if (filterCompany !== 'all' && r.company_name !== filterCompany) return false;
      return true;
    });
  }, [aggregatedLogs, filterType, filterCompany]);


  const lastAutoSync = lastByType['current_month']?.completed_at;

  // Per-FY progress
  const histCurrent = completedChunksByType.historical;
  const histPct = Math.min(100, Math.round((histCurrent / Math.max(prevFyTotal, 1)) * 100));
  const histStatus =
    runningHistorical ? 'in_progress' :
    histCurrent >= prevFyTotal ? 'completed' :
    histCurrent > 0 ? 'paused' : 'not_started';

  const currFyCurrent = completedChunksByType.current_fy;
  const currFyPct = Math.min(100, Math.round((currFyCurrent / Math.max(currFyTotal, 1)) * 100));
  const currFyStatus =
    runningCurrFy ? 'in_progress' :
    currFyCurrent >= currFyTotal ? 'completed' :
    currFyCurrent > 0 ? 'paused' : 'not_started';

  const retryFailed = () => {
    if (!lastFailed) return;
    const map: Record<string, SyncFn> = {
      current_month: 'sync-current-month',
      last_month: 'sync-last-month',
      historical: 'sync-historical',
      current_fy: 'sync-current-fy',
    };
    const fn = map[lastFailed.sync_type];
    if (fn) triggerSync.mutate(fn);
  };

  const prevFyLabel = `${fmtDate(fyWindows.prevFyStart)} – ${fmtDate(fyWindows.prevFyEnd)}`;
  const currFyLabel = `${fmtDate(fyWindows.currFyStart)} – ${fmtDate(fyWindows.currFyEnd)}`;

  return (
    <TooltipProvider>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Tally Sync</h1>

        {/* Connection status */}
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                ping.data?.reachable ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-sm">
              {ping.data?.reachable ? 'Tally Connected' : 'Tally Not Reachable'}
              {ping.data?.url && <> — {ping.data.url}</>}
              {ping.data?.via && (
                <Badge variant="outline" className="ml-2 text-xs">
                  via {ping.data.via}
                </Badge>
              )}
            </span>
            {ping.data?.error && (
              <span className="text-xs text-muted-foreground">({ping.data.error})</span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={ping.isFetching}
              onClick={async () => {
                const res = await ping.refetch();
                if (res.data?.reachable) {
                  toast.success(`Tally is reachable via ${res.data.via ?? 'unknown'}`);
                } else {
                  toast.error(`Tally not reachable${res.data?.error ? ` — ${res.data.error}` : ''}`);
                }
              }}
            >
              {ping.isFetching ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCcw className="h-3 w-3 mr-1" />
              )}
              Refresh
            </Button>
          </CardContent>
        </Card>

        {/* Sync buttons */}
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
                    Sync Previous FY
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sync Previous FY?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This fetches all data from {prevFyLabel} ({prevFyTotal} weekly chunks)
                      and runs for 15-20 minutes in the background. It will resume automatically
                      if interrupted. Start now?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        setPausedHist(false);
                        pausedHistRef.current = false;
                        triggerSync.mutate('sync-historical');
                      }}
                    >
                      Start now
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    disabled={runningFn === 'sync-current-fy'}
                  >
                    {runningFn === 'sync-current-fy' && <Loader2 className="h-4 w-4 animate-spin" />}
                    Sync Current FY (YTD)
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sync Current FY (YTD)?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This fetches all data from {currFyLabel} (~{currFyTotal} weekly chunks)
                      and runs in the background. It will resume automatically if interrupted.
                      Start now?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        setPausedCurrFy(false);
                        pausedCurrFyRef.current = false;
                        triggerSync.mutate('sync-current-fy');
                      }}
                    >
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

        {/* Status cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
              <CardTitle className="text-sm">Previous FY Sync</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {histStatus === 'not_started' && 'Not Started'}
                {histStatus === 'in_progress' && `In Progress (${histCurrent} of ${prevFyTotal})`}
                {histStatus === 'paused' && `Paused (${histCurrent} of ${prevFyTotal})`}
                {histStatus === 'completed' && 'Completed'}
              </div>
              <div className="text-xs text-muted-foreground">{prevFyLabel}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Current FY Sync (YTD)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {currFyStatus === 'not_started' && 'Not Started'}
                {currFyStatus === 'in_progress' && `In Progress (${currFyCurrent} of ${currFyTotal})`}
                {currFyStatus === 'paused' && `Paused (${currFyCurrent} of ${currFyTotal})`}
                {currFyStatus === 'completed' && 'Completed'}
              </div>
              <div className="text-xs text-muted-foreground">{currFyLabel}</div>
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

        {/* Progress bars */}
        {runningHistorical && (
          <ProgressCard
            title="Previous FY"
            chunkLabel={runningHistorical.chunk_label}
            companyName={runningHistorical.company_name}
            current={histCurrent}
            total={prevFyTotal}
            pct={histPct}
            paused={pausedHist}
            onPause={async () => {
              setPausedHist(true);
              pausedHistRef.current = true;
              const { error } = await supabase
                .from('tally_sync_control')
                .upsert({ sync_type: 'historical', is_paused: true }, { onConflict: 'sync_type' });
              if (error) toast.error(`Could not pause sync — ${error.message}`);
              toast.info('Will pause after current chunk completes');
            }}
            onResume={() => {
              setPausedHist(false);
              pausedHistRef.current = false;
              triggerSync.mutate('sync-historical');
            }}
          />
        )}
        {runningCurrFy && (
          <ProgressCard
            title="Current FY (YTD)"
            chunkLabel={runningCurrFy.chunk_label}
            companyName={runningCurrFy.company_name}
            current={currFyCurrent}
            total={currFyTotal}
            pct={currFyPct}
            paused={pausedCurrFy}
            onPause={async () => {
              setPausedCurrFy(true);
              pausedCurrFyRef.current = true;
              const { error } = await supabase
                .from('tally_sync_control')
                .upsert({ sync_type: 'current_fy', is_paused: true }, { onConflict: 'sync_type' });
              if (error) toast.error(`Could not pause sync — ${error.message}`);
              toast.info('Will pause after current chunk completes');
            }}
            onResume={() => {
              setPausedCurrFy(false);
              pausedCurrFyRef.current = false;
              triggerSync.mutate('sync-current-fy');
            }}
          />
        )}

        {/* Error banner */}
        {lastFailed &&
          (!lastSuccess ||
            new Date(lastFailed.started_at) > new Date(lastSuccess.completed_at ?? 0)) && (
            <Alert variant="destructive" className="cursor-pointer" onClick={retryFailed}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Sync failed at {formatDateTime(lastFailed.started_at)} —{' '}
                {lastFailed.error_message ?? 'Unknown error'} — Click to retry
              </AlertDescription>
            </Alert>
          )}

        {/* Stale-data warning */}
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

        {/* Sync log */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">Sync Log (last 50)</CardTitle>
            <div className="flex gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[180px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sync types</SelectItem>
                  <SelectItem value="current_month">Current month</SelectItem>
                  <SelectItem value="last_month">Last month</SelectItem>
                  <SelectItem value="historical">Previous FY</SelectItem>
                  <SelectItem value="current_fy">Current FY (YTD)</SelectItem>
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
                  <TableHead>Date Range</TableHead>
                  <TableHead className="text-right">Chunks</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
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
                  // Aggregated status: running > failed > completed
                  const aggStatus =
                    r.chunks_running > 0 ? 'running' :
                    r.chunks_failed > 0 && r.chunks_done === 0 ? 'failed' :
                    r.chunks_failed > 0 ? 'partial' :
                    r.chunks_done > 0 ? 'completed' : 'pending';
                  const statusColor =
                    aggStatus === 'completed'
                      ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                      : aggStatus === 'failed'
                      ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                      : aggStatus === 'partial'
                      ? 'bg-orange-500/15 text-orange-700 dark:text-orange-400'
                      : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400';
                  const typeLabel =
                    r.sync_type === 'historical' ? 'previous_fy' :
                    r.sync_type ?? '—';
                  const row = (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{formatDateTime(r.started_at)}</TableCell>
                      <TableCell className="text-xs">{typeLabel}</TableCell>
                      <TableCell className="text-xs">{r.company_name ?? '—'}</TableCell>
                      <TableCell className="text-xs">{dateRangeForType(r.sync_type)}</TableCell>
                      <TableCell className="text-right text-xs">
                        {r.chunks_done}/{r.chunks_total}
                        {r.chunks_failed > 0 ? ` (${r.chunks_failed} failed)` : ''}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {(r.records_fetched ?? 0).toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="text-right text-xs">{dur}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColor}>
                          {aggStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                  if ((aggStatus === 'failed' || aggStatus === 'partial') && r.error_message) {
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

function ProgressCard({
  title,
  chunkLabel,
  companyName,
  current,
  total,
  pct,
  paused,
  onPause,
  onResume,
}: {
  title: string;
  chunkLabel?: string | null;
  companyName?: string | null;
  current: number;
  total: number;
  pct: number;
  paused: boolean;
  onPause: () => void | Promise<void>;
  onResume: () => void;
}) {
  return (
    <Card>
      <CardContent className="py-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="font-medium">{title}:</span> Syncing {chunkLabel ?? '—'} ({current} of{' '}
            {total}) — Company: {companyName ?? '—'}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onPause} disabled={paused}>
              <Pause className="h-3 w-3 mr-1" />
              Pause
            </Button>
            <Button size="sm" variant="outline" onClick={onResume}>
              <Play className="h-3 w-3 mr-1" />
              Resume
            </Button>
          </div>
        </div>
        <Progress value={pct} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{pct}%</span>
          <span>Estimated time remaining: ~{Math.max(0, (total - current) * 0.4).toFixed(0)} min</span>
        </div>
      </CardContent>
    </Card>
  );
}
