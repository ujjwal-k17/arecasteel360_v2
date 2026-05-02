import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Search } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { ManageSalesRepsDialog, useSalesReps } from './ManageSalesRepsDialog';
import { CompanyFilter } from './CompanyFilter';
import { useIntracompanyParties } from '@/hooks/useIntracompanyParties';

export default function DebtorMasterTab() {
  const qc = useQueryClient();
  const [company, setCompany] = useState('all');
  const [search, setSearch] = useState('');
  const [editingCP, setEditingCP] = useState<Record<string, string>>({});
  const intra = useIntracompanyParties();
  const reps = useSalesReps();

  const dm = useQuery({
    queryKey: ['debtor-master', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debtor_master')
        .select('*')
        .order('ledger_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    let arr = (dm.data ?? []);
    if (company !== 'all') arr = arr.filter((d: any) => d.company_name === company);
    if (search.trim()) {
      const s = search.toLowerCase();
      arr = arr.filter((d: any) => d.ledger_name.toLowerCase().includes(s));
    }
    return arr;
  }, [dm.data, company, search]);

  const saveCP = async (id: string, raw: string) => {
    const days = parseInt(raw, 10);
    if (isNaN(days) || days < 0) {
      toast.error('Enter a valid number of days');
      return;
    }
    const { error } = await supabase.from('debtor_master').update({ credit_period_days: days }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Saved');
    setEditingCP(prev => { const n = { ...prev }; delete n[id]; return n; });
    qc.invalidateQueries({ queryKey: ['debtor-master'] });
  };

  const saveRep = async (id: string, rep: string) => {
    const value = rep === '__none__' ? null : rep;
    const { error } = await supabase.from('debtor_master').update({ sales_rep: value }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['debtor-master'] });
  };

  const toggleIntra = async (id: string, value: boolean) => {
    const { error } = await supabase.from('debtor_master').update({ is_intracompany: value }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(value ? 'Marked as intracompany' : 'Removed intracompany flag');
    qc.invalidateQueries({ queryKey: ['debtor-master'] });
    qc.invalidateQueries({ queryKey: ['business-overview', 'intracompany-parties'] });
  };

  const activeReps = (reps.data ?? []).filter((r: any) => r.is_active);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Company</label>
            <CompanyFilter value={company} onChange={setCompany} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Search Debtor</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-8 w-[260px]" />
            </div>
          </div>
          <div className="ml-auto">
            <ManageSalesRepsDialog />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          {dm.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No debtors found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2">Debtor Name</th>
                    <th className="py-2">Company</th>
                    <th className="py-2 text-right">Credit Period (days)</th>
                    <th className="py-2">Sales Rep</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d: any) => {
                    const cpVal = editingCP[d.id] != null
                      ? editingCP[d.id]
                      : (d.credit_period_days != null ? String(d.credit_period_days) : '');
                    const dirty = editingCP[d.id] != null && editingCP[d.id] !== String(d.credit_period_days ?? '');
                    return (
                      <tr key={d.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 font-medium">{d.ledger_name}</td>
                        <td className="py-2 text-muted-foreground">{d.company_name}</td>
                        <td className="py-2 text-right">
                          <Input
                            value={cpVal}
                            onChange={e => setEditingCP(prev => ({ ...prev, [d.id]: e.target.value }))}
                            onBlur={() => dirty && saveCP(d.id, cpVal)}
                            onKeyDown={e => { if (e.key === 'Enter' && dirty) saveCP(d.id, cpVal); }}
                            className="h-8 w-24 text-right ml-auto"
                            placeholder="—"
                            inputMode="numeric"
                          />
                        </td>
                        <td className="py-2">
                          <Select
                            value={d.sales_rep ?? '__none__'}
                            onValueChange={val => saveRep(d.id, val)}
                          >
                            <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— None —</SelectItem>
                              {activeReps.map((r: any) => (
                                <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
