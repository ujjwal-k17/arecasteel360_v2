import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Check, X, Monitor } from 'lucide-react';
import { toast } from 'sonner';

export default function DeviceManagementTab() {
  const qc = useQueryClient();

  const { data: devices, isLoading } = useQuery({
    queryKey: ['admin_devices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_devices')
        .select('*')
        .order('last_seen_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['admin_users'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, email');
      return data || [];
    },
  });

  const emailMap = new Map((profiles || []).map((p: any) => [p.id, p.email]));

  // Group devices by user
  const devicesByUser = (devices || []).reduce((acc: Record<string, any[]>, d: any) => {
    const email = emailMap.get(d.user_id) || d.user_id;
    if (!acc[email]) acc[email] = [];
    acc[email].push(d);
    return acc;
  }, {});

  const handleApprove = async (id: string, approve: boolean) => {
    const { error } = await supabase
      .from('user_devices')
      .update({ is_approved: approve })
      .eq('id', id);
    if (error) { toast.error('Failed'); return; }
    toast.success(approve ? 'Device approved' : 'Device revoked');
    qc.invalidateQueries({ queryKey: ['admin_devices'] });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this device record?')) return;
    const { error } = await supabase.from('user_devices').delete().eq('id', id);
    if (error) { toast.error('Failed'); return; }
    toast.success('Device removed');
    qc.invalidateQueries({ queryKey: ['admin_devices'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ['admin_devices'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <span className="text-sm text-muted-foreground">{(devices || []).length} device(s) tracked</span>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : Object.keys(devicesByUser).length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No devices tracked yet.</div>
      ) : (
        Object.entries(devicesByUser).map(([email, userDevices]) => (
          <div key={email} className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              <span className="font-medium text-sm">{email}</span>
              <Badge variant="secondary" className="text-[10px]">{(userDevices as any[]).length} device(s)</Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Device</TableHead>
                  <TableHead className="text-xs">Browser</TableHead>
                  <TableHead className="text-xs">OS</TableHead>
                  <TableHead className="text-xs">Last Seen</TableHead>
                  <TableHead className="text-xs">First Seen</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(userDevices as any[]).map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs">{d.device_name || '-'}</TableCell>
                    <TableCell className="text-xs">{d.browser || '-'}</TableCell>
                    <TableCell className="text-xs">{d.os || '-'}</TableCell>
                    <TableCell className="text-xs">{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('en-IN') : '-'}</TableCell>
                    <TableCell className="text-xs">{d.created_at ? new Date(d.created_at).toLocaleString('en-IN') : '-'}</TableCell>
                    <TableCell>
                      <Badge variant={d.is_approved ? 'default' : 'destructive'} className="text-[10px]">
                        {d.is_approved ? 'Approved' : 'Pending'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {!d.is_approved ? (
                          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-green-600" onClick={() => handleApprove(d.id, true)}>
                            <Check className="h-3 w-3" /> Approve
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-amber-600" onClick={() => handleApprove(d.id, false)}>
                            Revoke
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive" onClick={() => handleDelete(d.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))
      )}
    </div>
  );
}
