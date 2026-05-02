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
  applyFIFO,
  debtorOutstandingFromClosing,
  creditorOutstandingFromClosing,
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
        .lte('date', toISODate(to));
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

  const ledgers = useQuery({
    queryKey: ['mis', 'ledgers', company],
    queryFn: async () => {
      let q = supabase
        .from('tally_ledger_balances')
        .select('ledger_name, ledger_group, ultimate_group, closing_balance, company_name, as_of_date')
        .order('as_of_date', { ascending: false })
        .limit(10000);
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      // Always use latest snapshot per (company, ledger).
      const seen = new Set<string>();
      return (data ?? []).filter((r: any) => {
        const k = `${r.company_name}::${r.ledger_name}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    },
  });

  // Overdue calc — fetch all Sales + Receipt vouchers in scope.
  const overdue = useQuery({
    queryKey: ['mis', 'overdue', company],
    queryFn: async () => {
      // Pull all Sales/Receipt/Purchase/Payment in current FY scope to be lighter.
      let qSales = supabase
        .from('tally_vouchers')
        .select('voucher_number, party_name, amount, date, company_name')
        .in('voucher_type', ['Sales', 'Receipt', 'Purchase', 'Payment'])
        .order('date', { ascending: true });
      if (company !== 'all') qSales = qSales.eq('company_name', company);
      const { data, error } = await qSales;
      if (error) throw error;

      // Credit period overrides
      const { data: cps } = await supabase.from('invoice_credit_periods').select('*');
      const cpMap = new Map<string, number>();
      (cps ?? []).forEach((c: any) => cpMap.set(`${c.company_name}::${c.voucher_number}`, c.credit_period_days));
      const { data: dms } = await supabase.from('debtor_master').select('company_name, ledger_name, credit_period_days');
      const dmMap = new Map<string, number>();
      (dms ?? []).forEach((d: any) => {
        if (d.credit_period_days != null) dmMap.set(`${d.company_name}::${d.ledger_name}`, d.credit_period_days);
      });

      // Group by party + company
      type Rec = { sales: any[]; purchases: any[]; receipts: any[]; payments: any[] };
      const map = new Map<string, Rec>();
      (data ?? []).forEach((v: any) => {
        const key = `${v.company_name}::${v.party_name}`;
        if (!map.has(key)) map.set(key, { sales: [], purchases: [], receipts: [], payments: [] });
        const rec = map.get(key)!;
        // Re-fetch type via voucher_type isn't here; we need it
      });

      return { vouchers: data ?? [], cpMap, dmMap };
    },
  });

  // Need voucher_type for overdue grouping — refetch with type
  const overdueDetail = useQuery({
    queryKey: ['mis', 'overdueDetail', company, intraKey],
    queryFn: async () => {
      let q = supabase
        .from('tally_vouchers')
        .select('voucher_number, voucher_type, party_name, amount, date, company_name')
        .in('voucher_type', ['Sales', 'Receipt', 'Purchase', 'Payment']);
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      const { data: cps } = await supabase.from('invoice_credit_periods').select('company_name, voucher_number, credit_period_days');
      const { data: dms } = await supabase.from('debtor_master').select('company_name, ledger_name, credit_period_days');
      const cpMap = new Map<string, number>();
      (cps ?? []).forEach((c: any) => cpMap.set(`${c.company_name}::${c.voucher_number}`, c.credit_period_days));
      const dmMap = new Map<string, number>();
      (dms ?? []).forEach((d: any) => {
        if (d.credit_period_days != null) dmMap.set(`${d.company_name}::${d.ledger_name}`, d.credit_period_days);
      });

      type Rec = { sales: any[]; purchases: any[]; receipts: any[]; payments: any[] };
      const groups = new Map<string, Rec>();
      (data ?? []).forEach((v: any) => {
        // Exclude intracompany parties from overdue calculations
        if (intraSet.has(v.party_name)) return;
        const key = `${v.company_name}::${v.party_name ?? ''}`;
        if (!groups.has(key)) groups.set(key, { sales: [], purchases: [], receipts: [], payments: [] });
        const g = groups.get(key)!;
        if (v.voucher_type === 'Sales') g.sales.push(v);
        else if (v.voucher_type === 'Receipt') g.receipts.push(v);
        else if (v.voucher_type === 'Purchase') g.purchases.push(v);
        else if (v.voucher_type === 'Payment') g.payments.push(v);
      });

      let totalDebtorOverdue = 0;
      let totalCreditorOverdue = 0;
      const overdueDebtors: { party: string; amount: number; days: number }[] = [];
      const overdueCreditors: { party: string; amount: number; days: number }[] = [];

      groups.forEach((g, key) => {
        const [companyKey, partyName] = key.split('::');
        const salesInv = g.sales.map((s: any) => ({
          voucher_number: s.voucher_number,
          date: s.date,
          amount: Number(s.amount || 0),
          credit_period_days: resolveCreditPeriod(companyKey, s.voucher_number, partyName, cpMap, dmMap),
        }));
        const recVchr = g.receipts.map((r: any) => ({ date: r.date, amount: Number(r.amount || 0) }));
        const fifoDeb = applyFIFO(salesInv, recVchr);
        const debOver = fifoDeb.filter(r => r.outstanding > 0 && r.days_overdue > 0);
        const debOverSum = debOver.reduce((s, r) => s + r.outstanding, 0);
        totalDebtorOverdue += debOverSum;
        if (debOverSum > 0) {
          const maxDays = Math.max(...debOver.map(r => r.days_overdue), 0);
          overdueDebtors.push({ party: partyName, amount: debOverSum, days: maxDays });
        }

        const purInv = g.purchases.map((s: any) => ({
          voucher_number: s.voucher_number,
          date: s.date,
          amount: Number(s.amount || 0),
          credit_period_days: resolveCreditPeriod(companyKey, s.voucher_number, partyName, cpMap, dmMap),
        }));
        const payVchr = g.payments.map((r: any) => ({ date: r.date, amount: Number(r.amount || 0) }));
        const fifoCre = applyFIFO(purInv, payVchr);
        const creOver = fifoCre.filter(r => r.outstanding > 0 && r.days_overdue > 0);
        const creOverSum = creOver.reduce((s, r) => s + r.outstanding, 0);
        totalCreditorOverdue += creOverSum;
        if (creOverSum > 0) {
          const maxDays = Math.max(...creOver.map(r => r.days_overdue), 0);
          overdueCreditors.push({ party: partyName, amount: creOverSum, days: maxDays });
        }
      });

      overdueDebtors.sort((a, b) => b.amount - a.amount);
      overdueCreditors.sort((a, b) => b.amount - a.amount);
      return { totalDebtorOverdue, totalCreditorOverdue, overdueDebtors, overdueCreditors };
    },
  });

  // Sign-flip + intracompany exclusion for outstanding totals.
  const debtorOutstanding = (ledgers.data ?? [])
    .filter((l: any) => (l.ultimate_group ?? l.ledger_group) === 'Sundry Debtors')
    .filter((l: any) => !intraSet.has(l.ledger_name))
    .reduce((s: number, l: any) => {
      const flipped = debtorOutstandingFromClosing(l.closing_balance);
      return s + (flipped > 0 ? flipped : 0); // only debit balances count as debtor outstanding
    }, 0);
  const creditorOutstanding = (ledgers.data ?? [])
    .filter((l: any) => (l.ultimate_group ?? l.ledger_group) === 'Sundry Creditors')
    .filter((l: any) => !intraSet.has(l.ledger_name))
    .reduce((s: number, l: any) => {
      const out = creditorOutstandingFromClosing(l.closing_balance);
      return s + (out > 0 ? out : 0);
    }, 0);
  const banks = (ledgers.data ?? []).filter((l: any) => (l.ultimate_group ?? l.ledger_group) === 'Bank Accounts');
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
