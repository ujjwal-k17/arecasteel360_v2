import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Trash2, Plus, Eraser } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// Tables that hold company-scoped synced data
const SYNCED_TABLES = [
  'tally_vouchers',
  'tally_groups',
  'tally_ledger_balances',
  'tally_stock_items',
  'tally_sync_log',
] as const;

async function purgeCompanyData(companyName: string) {
  const results = await Promise.all(
    SYNCED_TABLES.map((t) =>
      supabase.from(t as any).delete().eq('company_name', companyName).select('id'),
    ),
  );
  const errors = results.map((r, i) => (r.error ? `${SYNCED_TABLES[i]}: ${r.error.message}` : null)).filter(Boolean);
  const totalDeleted = results.reduce((s, r) => s + (Array.isArray(r.data) ? r.data.length : 0), 0);
  if (errors.length) throw new Error(errors.join('; '));
  return totalDeleted;
}

export default function TallyCompaniesTab() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['admin-tally-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tally_companies')
        .select('*')
        .order('company_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-tally-companies'] });
    qc.invalidateQueries({ queryKey: ['business-overview', 'companies'] });
    qc.invalidateQueries({ queryKey: ['sales-analysis'] });
    qc.invalidateQueries({ queryKey: ['purchase-analysis'] });
  };

  const addCompany = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Enter a company name');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('tally_companies')
        .insert({ company_name: trimmed, is_active: true });
      if (error) throw error;
      toast.success(`Added ${trimmed}`);
      setName('');
      refresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to add');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (id: string, next: boolean) => {
    const { error } = await supabase
      .from('tally_companies')
      .update({ is_active: next })
      .eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next ? 'Activated' : 'Deactivated');
    refresh();
  };

  const purge = async (label: string) => {
    setBusy(true);
    try {
      const n = await purgeCompanyData(label);
      toast.success(`Purged ${n} synced rows for ${label}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message || 'Purge failed');
    } finally {
      setBusy(false);
    }
  };

  const removeWithPurge = async (id: string, label: string) => {
    setBusy(true);
    try {
      await purgeCompanyData(label);
      const { error } = await supabase.from('tally_companies').delete().eq('id', id);
      if (error) throw error;
      toast.success(`Deleted ${label} and purged synced data`);
      refresh();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add Tally Company</CardTitle>
          <CardDescription>
            New companies are added to the sync list. Use the exact company name as it appears in Tally.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 max-w-xl">
            <Input
              placeholder="e.g. RUKMINI ISPAT DELHI"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCompany()}
              disabled={busy}
            />
            <Button onClick={addCompany} disabled={busy}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Companies ({companies.length})</CardTitle>
          <CardDescription>
            Toggle a company off to skip it in future syncs (historical data is preserved).
            Use <b>Purge</b> to wipe already-synced vouchers, ledgers, groups and stock for a company.
            <b> Delete</b> removes the company from this list <i>and</i> purges its synced data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead className="w-[140px]">Active</TableHead>
                  <TableHead className="w-[180px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.company_name}</TableCell>
                    <TableCell>
                      <Switch
                        checked={!!c.is_active}
                        onCheckedChange={(v) => toggleActive(c.id, v)}
                        disabled={busy}
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={busy} title="Purge synced data">
                            <Eraser className="h-4 w-4 text-amber-600" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Purge synced data for {c.company_name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently deletes all vouchers, ledger balances, groups, stock items and sync logs for <b>{c.company_name}</b> from the database. The company entry stays in this list. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => purge(c.company_name)}>
                              Purge
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={busy} title="Delete company & purge data">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {c.company_name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes <b>{c.company_name}</b> from the sync list and permanently deletes all of its synced vouchers, ledgers, groups, stock items and sync logs. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeWithPurge(c.id, c.company_name)}>
                              Delete & Purge
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {companies.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No companies yet. Add one above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
