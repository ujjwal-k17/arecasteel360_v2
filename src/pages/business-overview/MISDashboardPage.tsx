import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, IndianRupee, TrendingUp, TrendingDown, Wallet, Users, Building2, Banknote } from 'lucide-react';
import { CompanyFilter } from '@/components/business-overview/CompanyFilter';
import { LastSyncedFooter } from '@/components/business-overview/LastSyncedFooter';
import {
  formatINRCompact,
  formatMT,
  totalMTFromLineItems,
  currentMonthRange,
  toISODate,
  calculatePartyBalance,
  ALL_PARTY_VOUCHER_TYPES,
  resolveCreditPeriod,
} from '@/lib/business-overview-utils';
import { useLastSyncAt } from '@/hooks/useTallyCompanies';
import { useIntracompanyParties } from '@/hooks/useIntracompanyParties';

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  onClick,
  loading,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: any;
  onClick?: () => void;
  loading?: boolean;
}) {
  return (
    <Card
      onClick={onClick}
      className={onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function MISDashboardPage() {
  const navigate = useNavigate();
  const [company, setCompany] = useState<string>('all');
  const { data: lastSync } = useLastSyncAt();

  const intra = useIntracompanyParties();
  const intraSet = intra.data ?? { has: (_: any) => false, companies: [] as string[], manualLedgers: new Set<string>() } as any;
  const intraKey = (intra.data?.companies.length ?? 0) + (intra.data?.manualLedgers.size ?? 0);

  const { from, to } = useMemo(() => currentMonthRange(), []);

  const monthly = useQuery({
    queryKey: ['mis', 'monthly', company, toISODate(from), toISODate(to), intraKey],
    queryFn: async () => {
      let q = supabase
        .from('tally_vouchers')
        .select('voucher_type, amount, line_items, company_name, party_name')
        .gte('date', toISODate(from))
        .lte('date', toISODate(to))
        .limit(10000);
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      const result = { sales: { value: 0, mt: 0, n: 0 }, purchase: { value: 0, mt: 0, n: 0 }, receipt: 0, payment: 0 };
      (data ?? []).forEach((v: any) => {
        // Exclude intracompany sales/purchase from MIS totals
        if ((v.voucher_type === 'Sales' || v.voucher_type === 'Purchase') && intraSet.has(v.party_name)) return;
        const amt = Number(v.amount || 0);
        if (v.voucher_type === 'Sales') {
          result.sales.value += amt;
          result.sales.mt += totalMTFromLineItems(v.line_items);
          result.sales.n += 1;
        } else if (v.voucher_type === 'Purchase') {
          result.purchase.value += amt;
          result.purchase.mt += totalMTFromLineItems(v.line_items);
          result.purchase.n += 1;
        } else if (v.voucher_type === 'Receipt') {
          result.receipt += amt;
        } else if (v.voucher_type === 'Payment') {
          result.payment += amt;
        }
      });
      return result;
    },
  });

  // ALL ledger snapshots — needed for opening balance + latest closing.
  const ledgers = useQuery({
    queryKey: ['mis', 'ledgers-all', company],
    queryFn: async () => {
      // Page through to bypass the 1000-row default cap.
      const rows: any[] = [];
      for (let from = 0; ; from += 1000) {
        let q = supabase
          .from('tally_ledger_balances')
          .select('ledger_name, ledger_group, ultimate_group, closing_balance, company_name, as_of_date')
          .order('as_of_date', { ascending: true })
          .range(from, from + 999);
        if (company !== 'all') q = q.eq('company_name', company);
        const { data, error } = await q;
        if (error) throw error;
        const batch = data ?? [];
        rows.push(...batch);
        if (batch.length < 1000) break;
      }
      return rows;
    },
  });

  // Latest snapshot per (company, ledger) — for the bank/outstanding stat cards.
  const latestLedgers = useMemo(() => {
    const byKey = new Map<string, any>();
    (ledgers.data ?? []).forEach((r: any) => {
      const k = `${r.company_name}::${r.ledger_name}`;
      const cur = byKey.get(k);
      if (!cur || (r.as_of_date ?? '') > (cur.as_of_date ?? '')) byKey.set(k, r);
    });
    return Array.from(byKey.values());
  }, [ledgers.data]);

  // Overdue calc using the new ledger-anchored calculator.
  const overdueDetail = useQuery({
    queryKey: ['mis', 'overdueDetail-v2', company, intraKey, ledgers.dataUpdatedAt],
    enabled: !!ledgers.data,
    queryFn: async () => {
      // Fetch all party-relevant vouchers.
      const allVchrs: any[] = [];
      for (let from = 0; ; from += 1000) {
        let q = supabase
          .from('tally_vouchers')
          .select('voucher_number, voucher_type, party_name, amount, date, company_name')
          .in('voucher_type', ALL_PARTY_VOUCHER_TYPES as unknown as string[])
          .range(from, from + 999);
        if (company !== 'all') q = q.eq('company_name', company);
        const { data, error } = await q;
        if (error) throw error;
        const batch = data ?? [];
        allVchrs.push(...batch);
        if (batch.length < 1000) break;
      }

      const { data: cps } = await supabase.from('invoice_credit_periods').select('company_name, voucher_number, credit_period_days').limit(10000);
      const { data: dms } = await supabase.from('debtor_master').select('company_name, ledger_name, credit_period_days').limit(10000);
      const cpMap = new Map<string, number>();
      (cps ?? []).forEach((c: any) => cpMap.set(`${c.company_name}::${c.voucher_number}`, c.credit_period_days));
      const dmMap = new Map<string, number>();
      (dms ?? []).forEach((d: any) => {
        if (d.credit_period_days != null) dmMap.set(`${d.company_name}::${d.ledger_name}`, d.credit_period_days);
      });

      // Group vouchers + ledger snapshots by company::party.
      const vchrByParty = new Map<string, any[]>();
      allVchrs.forEach((v: any) => {
        if (intraSet.has(v.party_name)) return;
        const key = `${v.company_name}::${v.party_name ?? ''}`;
        if (!vchrByParty.has(key)) vchrByParty.set(key, []);
        vchrByParty.get(key)!.push(v);
      });

      const snapsByLedger = new Map<string, any[]>();
      const groupByLedger = new Map<string, string>();
      (ledgers.data ?? []).forEach((l: any) => {
        if (intraSet.has(l.ledger_name)) return;
        const key = `${l.company_name}::${l.ledger_name}`;
        if (!snapsByLedger.has(key)) snapsByLedger.set(key, []);
        snapsByLedger.get(key)!.push(l);
        const grp = l.ultimate_group ?? l.ledger_group ?? '';
        if (!groupByLedger.has(key)) groupByLedger.set(key, grp);
      });

      let totalDebtorOverdue = 0;
      let totalCreditorOverdue = 0;
      const overdueDebtors: { party: string; amount: number; days: number }[] = [];
      const overdueCreditors: { party: string; amount: number; days: number }[] = [];

      const allKeys = new Set<string>([...snapsByLedger.keys(), ...vchrByParty.keys()]);
      allKeys.forEach((key) => {
        const [companyKey, partyName] = key.split('::');
        if (!partyName) return;
        const grp = groupByLedger.get(key);
        if (!grp) return;
        if (grp !== 'Sundry Debtors' && grp !== 'Sundry Creditors') return;

        const side: 'debtors' | 'creditors' = grp === 'Sundry Debtors' ? 'debtors' : 'creditors';
        const partyVchrs = vchrByParty.get(key) ?? [];
        const snaps = snapsByLedger.get(key) ?? [];
        const balance = calculatePartyBalance({
          side,
          vouchers: partyVchrs.map((v: any) => ({
            voucher_number: v.voucher_number,
            voucher_type: v.voucher_type,
            date: v.date,
            amount: Number(v.amount || 0),
          })),
          ledgerSnaps: snaps.map((s: any) => ({
            as_of_date: s.as_of_date,
            closing_balance: Number(s.closing_balance || 0),
          })),
          creditPeriodResolver: (vno) => resolveCreditPeriod(companyKey, vno, partyName, cpMap, dmMap),
        });

        if (balance.totalOverdue <= 0) return;
        if (side === 'debtors') {
          totalDebtorOverdue += balance.totalOverdue;
          overdueDebtors.push({ party: partyName, amount: balance.totalOverdue, days: balance.maxOverdueDays });
        } else {
          totalCreditorOverdue += balance.totalOverdue;
          overdueCreditors.push({ party: partyName, amount: balance.totalOverdue, days: balance.maxOverdueDays });
        }
      });

      overdueDebtors.sort((a, b) => b.amount - a.amount);
      overdueCreditors.sort((a, b) => b.amount - a.amount);
      return { totalDebtorOverdue, totalCreditorOverdue, overdueDebtors, overdueCreditors };
    },
  });

  // Outstanding totals — straight from latest ledger snapshot (sign-corrected).
  const debtorOutstanding = latestLedgers
    .filter((l: any) => (l.ultimate_group ?? l.ledger_group) === 'Sundry Debtors')
    .filter((l: any) => !intraSet.has(l.ledger_name))
    .reduce((s: number, l: any) => {
      const flipped = -Number(l.closing_balance || 0); // debtor: debit → positive
      return s + (flipped > 0 ? flipped : 0);
    }, 0);
  const creditorOutstanding = latestLedgers
    .filter((l: any) => (l.ultimate_group ?? l.ledger_group) === 'Sundry Creditors')
    .filter((l: any) => !intraSet.has(l.ledger_name))
    .reduce((s: number, l: any) => {
      const out = Number(l.closing_balance || 0);
      return s + (out > 0 ? out : 0);
    }, 0);
  const banks = latestLedgers.filter((l: any) => (l.ultimate_group ?? l.ledger_group) === 'Bank Accounts');
  const bankTotal = banks.reduce((s: number, l: any) => s + Number(l.closing_balance || 0), 0);



  const m = monthly.data;
  const isLoading = monthly.isLoading || ledgers.isLoading;

  const isStale = lastSync ? Date.now() - new Date(lastSync as any).getTime() > 8 * 60 * 60 * 1000 : true;

  const debtorAlerts = (overdueDetail.data?.overdueDebtors ?? []).filter(d => d.days >= 90).slice(0, 5);
  const creditorAlerts = (overdueDetail.data?.overdueCreditors ?? []).slice(0, 5);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">MIS Dashboard</h1>
          <p className="text-sm text-muted-foreground">Snapshot of business performance & outstanding</p>
        </div>
        <div className="flex items-center gap-3">
          <CompanyFilter value={company} onChange={setCompany} />
          {lastSync && (
            <div className="text-xs text-muted-foreground text-right">
              Last synced<br />{new Date(lastSync as any).toLocaleString('en-IN')}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: This Month Performance */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">This Month Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Sales MTD"
            value={formatINRCompact(m?.sales.value ?? 0)}
            sub={`${formatMT(m?.sales.mt ?? 0)} MT • ${m?.sales.n ?? 0} invoices`}
            icon={TrendingUp}
            onClick={() => navigate('/business-overview/sales')}
            loading={isLoading}
          />
          <StatCard
            title="Purchases MTD"
            value={formatINRCompact(m?.purchase.value ?? 0)}
            sub={`${formatMT(m?.purchase.mt ?? 0)} MT • ${m?.purchase.n ?? 0} invoices`}
            icon={TrendingDown}
            onClick={() => navigate('/business-overview/purchase')}
            loading={isLoading}
          />
          <StatCard
            title="Collections MTD"
            value={formatINRCompact(m?.receipt ?? 0)}
            icon={IndianRupee}
            loading={isLoading}
          />
          <StatCard
            title="Payments MTD"
            value={formatINRCompact(m?.payment ?? 0)}
            icon={Wallet}
            loading={isLoading}
          />
        </div>
      </div>

      {/* Row 3: Outstanding */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Outstanding Position</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Debtor Outstanding"
            value={formatINRCompact(debtorOutstanding)}
            icon={Users}
            onClick={() => navigate('/business-overview/debtors')}
            loading={isLoading}
          />
          <StatCard
            title="Debtor Overdue"
            value={formatINRCompact(overdueDetail.data?.totalDebtorOverdue ?? 0)}
            icon={AlertTriangle}
            onClick={() => navigate('/business-overview/debtors')}
            loading={overdueDetail.isLoading}
          />
          <StatCard
            title="Creditor Outstanding"
            value={formatINRCompact(creditorOutstanding)}
            icon={Building2}
            onClick={() => navigate('/business-overview/creditors')}
            loading={isLoading}
          />
          <StatCard
            title="Creditor Overdue"
            value={formatINRCompact(overdueDetail.data?.totalCreditorOverdue ?? 0)}
            icon={AlertTriangle}
            onClick={() => navigate('/business-overview/creditors')}
            loading={overdueDetail.isLoading}
          />
        </div>
      </div>

      {/* Row 4: Bank Position */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Bank Position</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Bank Balance"
            value={formatINRCompact(bankTotal)}
            sub={`${banks.length} accounts`}
            icon={Banknote}
            loading={isLoading}
          />
          {banks.map((b: any, i: number) => (
            <StatCard
              key={i}
              title={b.ledger_name}
              value={formatINRCompact(Number(b.closing_balance || 0))}
              sub={b.company_name}
              icon={Banknote}
            />
          ))}
        </div>
      </div>

      {/* Row 5: Alerts */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Alerts</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Debtors overdue 90+ days
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {debtorAlerts.length === 0 ? (
                <p className="text-xs text-muted-foreground">None</p>
              ) : (
                debtorAlerts.map((d, i) => (
                  <div key={i} className="flex justify-between text-sm border-b pb-1 last:border-0">
                    <span className="truncate max-w-[60%]">{d.party}</span>
                    <span className="font-medium text-destructive">{formatINRCompact(d.amount)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Creditors overdue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {creditorAlerts.length === 0 ? (
                <p className="text-xs text-muted-foreground">None</p>
              ) : (
                creditorAlerts.map((d, i) => (
                  <div key={i} className="flex justify-between text-sm border-b pb-1 last:border-0">
                    <span className="truncate max-w-[60%]">{d.party}</span>
                    <span className="font-medium">{formatINRCompact(d.amount)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {isStale && (
          <Alert className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Data is stale</AlertTitle>
            <AlertDescription>Last sync was more than 8 hours ago. Run Tally Sync to refresh.</AlertDescription>
          </Alert>
        )}
      </div>

      <LastSyncedFooter />
    </div>
  );
}
