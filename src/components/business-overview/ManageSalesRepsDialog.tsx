import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

export function useSalesReps() {
  return useQuery({
    queryKey: ['sales-reps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_reps')
        .select('*')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function ManageSalesRepsDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const reps = useSalesReps();

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.from('sales_reps').insert({ name, is_active: true });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Sales rep added');
    setNewName('');
    qc.invalidateQueries({ queryKey: ['sales-reps'] });
  };

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from('sales_reps').update({ is_active: !current }).eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ['sales-reps'] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('sales_reps').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Removed');
    qc.invalidateQueries({ queryKey: ['sales-reps'] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-3.5 w-3.5 mr-1.5" />
          Manage Sales Reps
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sales Reps</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="New sales rep name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <Button onClick={add} disabled={busy || !newName.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="border rounded-md divide-y max-h-[360px] overflow-y-auto">
          {(reps.data ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">No sales reps yet.</p>
          ) : (
            (reps.data ?? []).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <span className={r.is_active ? '' : 'text-muted-foreground line-through'}>{r.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    Active
                    <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r.id, r.is_active)} />
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => remove(r.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
