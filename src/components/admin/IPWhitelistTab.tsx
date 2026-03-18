import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function IPWhitelistTab() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ip: '', description: '' });

  const { data: ips, isLoading } = useQuery({
    queryKey: ['allowed_ips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allowed_ips')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Get current IP
  const { data: currentIp } = useQuery({
    queryKey: ['current_ip'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('check-ip');
      return data?.ip || 'Unknown';
    },
  });

  const insertIp = useMutation({
    mutationFn: async (entry: { ip_address: string; description: string | null }) => {
      const { error } = await supabase.from('allowed_ips').insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowed_ips'] });
      toast.success('IP added');
    },
  });

  const deleteIp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('allowed_ips').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowed_ips'] });
      toast.success('IP removed');
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('allowed_ips').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allowed_ips'] }),
  });

  const handleAdd = async () => {
    if (!form.ip.trim()) { toast.error('IP address is required'); return; }
    try {
      await insertIp.mutateAsync({ ip_address: form.ip.trim(), description: form.description || null });
      setShowAdd(false);
      setForm({ ip: '', description: '' });
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ['allowed_ips'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add IP
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          Your current IP: <span className="font-mono font-medium">{currentIp || '...'}</span>
        </div>
      </div>

      <div className="rounded-md border p-3 bg-muted/20 text-xs text-muted-foreground">
        <strong>Note:</strong> If no IPs are added or all are disabled, access is unrestricted. When at least one active IP is configured, only those IPs can log in.
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold">IP Address</TableHead>
              <TableHead className="text-xs font-semibold">Description</TableHead>
              <TableHead className="text-xs font-semibold">Active</TableHead>
              <TableHead className="text-xs font-semibold">Added</TableHead>
              <TableHead className="text-xs font-semibold w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            )}
            {!isLoading && (!ips || ips.length === 0) && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No IPs configured. All networks can access the app.</TableCell></TableRow>
            )}
            {(ips || []).map((ip: any) => (
              <TableRow key={ip.id}>
                <TableCell className="text-sm font-mono">{ip.ip_address}</TableCell>
                <TableCell className="text-sm">{ip.description || '-'}</TableCell>
                <TableCell>
                  <Switch
                    checked={ip.is_active}
                    onCheckedChange={checked => toggleActive.mutate({ id: ip.id, is_active: checked })}
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(ip.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7" onClick={() => deleteIp.mutate(ip.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add IP Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Allowed IP</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">IP Address *</Label>
              <Input value={form.ip} onChange={e => setForm(v => ({ ...v, ip: e.target.value }))} placeholder="e.g., 203.0.113.42" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} placeholder="e.g., Office WiFi" />
            </div>
            {currentIp && (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setForm(v => ({ ...v, ip: currentIp }))}>
                Use my current IP ({currentIp})
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={insertIp.isPending}>
              {insertIp.isPending ? 'Adding...' : 'Add IP'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
