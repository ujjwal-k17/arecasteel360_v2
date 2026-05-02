import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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

  const remove = async (id: string, label: string) => {
    const { error } = await supabase.from('tally_companies').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Deleted ${label}`);
    refresh();
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
            Toggle a company off to skip it in future syncs without deleting historical data.
            Deleting a company only removes the entry from this list — synced vouchers remain.
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
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
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
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {c.company_name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the company from the sync list. Already-synced vouchers and ledgers will remain in the database but new syncs will not pull data for this company. Consider toggling Active off instead if you want to preserve the entry.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(c.id, c.company_name)}>
                              Delete
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
