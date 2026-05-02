import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';
import { CompanyFilter } from '@/components/business-overview/CompanyFilter';
import { LastSyncedFooter } from '@/components/business-overview/LastSyncedFooter';
import { formatINR, formatINRCompact, formatDate, currentFYRange, toISODate } from '@/lib/business-overview-utils';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

// Heuristics for which voucher types are debit vs credit from the *party's* perspective.
// For receivables view: Sales increases what they owe us (debit to party), Receipts reduce it (credit).
// For payables view: Purchase increases what we owe them (credit to party), Payments reduce it (debit).
// Since we don't know if it's debtor/creditor in advance, we pick a generic interpretation:
// - Sales / Debit Note → debit
// - Purchase / Credit Note → credit
// - Receipt → credit
// - Payment → debit
// - Journal / Contra → use amount sign (treated as debit if positive)
function debitCreditFor(vtype: string, amount: number) {
  const t = (vtype || '').toLowerCase();
  if (t.includes('sales') || t.includes('debit note')) return { debit: amount, credit: 0 };
  if (t.includes('purchase') || t.includes('credit note')) return { debit: 0, credit: amount };
  if (t === 'receipt') return { debit: 0, credit: amount };
  if (t === 'payment') return { debit: amount, credit: 0 };
  return { debit: amount, credit: 0 };
}

export default function PartyLedgerPage() {
  const fy = useMemo(() => currentFYRange(), []);
  const [company, setCompany] = useState<string>('all');
  const [from, setFrom] = useState<string>(toISODate(fy.from));
  const [to, setTo] = useState<string>(toISODate(fy.to));
  const [partySearch, setPartySearch] = useState('');
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Distinct parties for search
  const parties = useQuery({
    queryKey: ['party-list', company],
    queryFn: async () => {
      let q = supabase.from('tally_vouchers').select('party_name, company_name').not('party_name', 'is', null);
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((v: any) => {
        if (v.party_name) set.add(v.party_name);
      });
      return Array.from(set).sort();
    },
  });

  // Transactions for selected party
  const txns = useQuery({
    enabled: !!selectedParty,
    queryKey: ['party-ledger-txns', selectedParty, company, from, to],
    queryFn: async () => {
      let q = supabase
        .from('tally_vouchers')
        .select('voucher_number, voucher_type, amount, date, narration, company_name')
        .eq('party_name', selectedParty as string)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true });
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Outstanding (closing balance from ledger)
  const outstandingQ = useQuery({
    enabled: !!selectedParty,
    queryKey: ['party-ledger-outstanding', selectedParty, company],
    queryFn: async () => {
      let q = supabase
        .from('tally_ledger_balances')
        .select('closing_balance, company_name, ledger_group')
        .eq('ledger_name', selectedParty as string);
      if (company !== 'all') q = q.eq('company_name', company);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.closing_balance || 0), 0);
    },
  });

  const summary = useMemo(() => {
    let invoiced = 0;
    let received = 0;
    (txns.data ?? []).forEach((v: any) => {
      const t = (v.voucher_type || '').toLowerCase();
      if (t.includes('sales')) invoiced += Number(v.amount || 0);
      else if (t === 'receipt') received += Number(v.amount || 0);
    });
    return { invoiced, received };
  }, [txns.data]);

  const rowsWithBalance = useMemo(() => {
    let bal = 0;
    return (txns.data ?? []).map((v: any) => {
      const { debit, credit } = debitCreditFor(v.voucher_type, Number(v.amount || 0));
      bal += debit - credit;
      return { ...v, debit, credit, running: bal };
    });
  }, [txns.data]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Party Ledger</h1>
        <p className="text-sm text-muted-foreground">Complete transaction history for any party</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Search Party</label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[320px] justify-between">
                  {selectedParty ?? 'Select party…'}
                  <Search className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type to search…" value={partySearch} onValueChange={setPartySearch} />
                  <CommandList>
                    <CommandEmpty>No party found.</CommandEmpty>
                    <CommandGroup>
                      {(parties.data ?? [])
                        .filter(p => !partySearch || p.toLowerCase().includes(partySearch.toLowerCase()))
                        .slice(0, 100)
                        .map(p => (
                          <CommandItem
                            key={p}
                            value={p}
                            onSelect={() => {
                              setSelectedParty(p);
                              setOpen(false);
                            }}
                          >
                            {p}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Company</label>
            <CompanyFilter value={company} onChange={setCompany} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[160px]" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[160px]" />
          </div>
        </CardContent>
      </Card>

      {!selectedParty ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Select a party to view its ledger.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Party</CardTitle></CardHeader>
              <CardContent><div className="text-lg font-bold truncate">{selectedParty}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Invoiced</CardTitle></CardHeader>
              <CardContent>
                {txns.isLoading ? <Skeleton className="h-7 w-32" /> : <div className="text-lg font-bold">{formatINRCompact(summary.invoiced)}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Received</CardTitle></CardHeader>
              <CardContent>
                {txns.isLoading ? <Skeleton className="h-7 w-32" /> : <div className="text-lg font-bold">{formatINRCompact(summary.received)}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Net Outstanding</CardTitle></CardHeader>
              <CardContent>
                {outstandingQ.isLoading ? <Skeleton className="h-7 w-32" /> : <div className="text-lg font-bold">{formatINRCompact(outstandingQ.data ?? 0)}</div>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Transactions</CardTitle></CardHeader>
            <CardContent>
              {txns.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : rowsWithBalance.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No data found. Run Tally Sync to import data.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2">Date</th>
                        <th className="py-2">Type</th>
                        <th className="py-2">Voucher #</th>
                        <th className="py-2 text-right">Debit</th>
                        <th className="py-2 text-right">Credit</th>
                        <th className="py-2 text-right">Running Balance</th>
                        <th className="py-2">Narration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsWithBalance.map((r: any, i: number) => (
                        <tr key={`${r.voucher_number}-${i}`} className="border-b hover:bg-muted/40">
                          <td className="py-1.5">{formatDate(r.date)}</td>
                          <td className="py-1.5">{r.voucher_type}</td>
                          <td className="py-1.5">{r.voucher_number}</td>
                          <td className="py-1.5 text-right">{r.debit ? formatINR(r.debit) : '—'}</td>
                          <td className="py-1.5 text-right">{r.credit ? formatINR(r.credit) : '—'}</td>
                          <td className="py-1.5 text-right font-medium">{formatINR(r.running)}</td>
                          <td className="py-1.5 text-muted-foreground truncate max-w-[280px]">{r.narration ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <LastSyncedFooter />
    </div>
  );
}
