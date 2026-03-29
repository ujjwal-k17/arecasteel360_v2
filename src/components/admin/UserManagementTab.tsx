import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw, Plus, Shield, Trash2, Settings } from 'lucide-react';
import { toast } from 'sonner';

const APP_PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'consumables', label: 'Consumables' },
  { key: 'order-book', label: 'Order Book' },
  { key: 'working-capital', label: 'Working Capital' },
  { key: 'petty-cash', label: 'Cash Book' },
  { key: 'freight', label: 'Freight' },
];

export default function UserManagementTab() {
  const queryClient = useQueryClient();
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'user' });
  const [addingUser, setAddingUser] = useState(false);
  const [permDialog, setPermDialog] = useState<{ userId: string; email: string } | null>(null);
  const [permState, setPermState] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>({});
  const [savingPerms, setSavingPerms] = useState(false);

  // Fetch users with roles
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin_users'],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, created_at');
      if (error) throw error;

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      return (profiles || []).map((p: any) => ({
        ...p,
        role: roles?.find((r: any) => r.user_id === p.id)?.role || 'user',
      }));
    },
  });

  // Fetch permissions for dialog
  const { data: userPerms } = useQuery({
    queryKey: ['user_permissions', permDialog?.userId],
    enabled: !!permDialog,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_permissions')
        .select('page, can_view, can_edit')
        .eq('user_id', permDialog!.userId);
      return data || [];
    },
  });

  const openPermDialog = (userId: string, email: string) => {
    setPermDialog({ userId, email });
  };

  // Sync permState when userPerms loads
  const initPermState = () => {
    const state: Record<string, { can_view: boolean; can_edit: boolean }> = {};
    APP_PAGES.forEach(p => {
      const existing = userPerms?.find((up: any) => up.page === p.key);
      state[p.key] = {
        can_view: existing?.can_view ?? false,
        can_edit: existing?.can_edit ?? false,
      };
    });
    return state;
  };

  // When permDialog opens and perms load, init state
  if (permDialog && userPerms && Object.keys(permState).length === 0) {
    setPermState(initPermState());
  }

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password) {
      toast.error('Email and password are required');
      return;
    }
    if (newUser.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setAddingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email: newUser.email, password: newUser.password, role: newUser.role },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Failed to create user');
        return;
      }

      toast.success(`User ${newUser.email} created`);
      setShowAddUser(false);
      setNewUser({ email: '', password: '', role: 'user' });
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Failed');
        return;
      }
      toast.success('User deleted');
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    } catch {
      toast.error('Failed to delete user');
    }
  };

  const handleSavePermissions = async () => {
    if (!permDialog) return;
    setSavingPerms(true);
    try {
      // Delete existing permissions for this user
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', permDialog.userId);

      // Insert new permissions
      const inserts = APP_PAGES
        .filter(p => permState[p.key]?.can_view || permState[p.key]?.can_edit)
        .map(p => ({
          user_id: permDialog.userId,
          page: p.key,
          can_view: permState[p.key]?.can_view ?? false,
          can_edit: permState[p.key]?.can_edit ?? false,
        }));

      if (inserts.length > 0) {
        const { error } = await supabase.from('user_permissions').insert(inserts);
        if (error) throw error;
      }

      toast.success('Permissions saved');
      setPermDialog(null);
      setPermState({});
      queryClient.invalidateQueries({ queryKey: ['user_permissions'] });
    } catch {
      toast.error('Failed to save permissions');
    } finally {
      setSavingPerms(false);
    }
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    toast.success('Refreshed');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button size="sm" onClick={() => setShowAddUser(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold">Email</TableHead>
              <TableHead className="text-xs font-semibold">Role</TableHead>
              <TableHead className="text-xs font-semibold">Created</TableHead>
              <TableHead className="text-xs font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            )}
            {!isLoading && (!users || users.length === 0) && (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No users found.</TableCell></TableRow>
            )}
            {(users || []).map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="text-sm">{u.email}</TableCell>
                <TableCell>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {u.role}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {u.role !== 'admin' && (
                      <>
                        <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => { openPermDialog(u.id, u.email); }}>
                          <Settings className="h-3 w-3" /> Permissions
                        </Button>
                        <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive hover:text-destructive" onClick={() => handleDeleteUser(u.id, u.email)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    {u.role === 'admin' && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> Full access</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Email *</Label>
              <Input value={newUser.email} onChange={e => setNewUser(v => ({ ...v, email: e.target.value }))} placeholder="user@example.com" />
            </div>
            <div>
              <Label className="text-xs">Password *</Label>
              <Input type="password" value={newUser.password} onChange={e => setNewUser(v => ({ ...v, password: e.target.value }))} placeholder="Min 6 characters" />
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={newUser.role} onValueChange={v => setNewUser(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddUser(false)}>Cancel</Button>
            <Button onClick={handleAddUser} disabled={addingUser}>
              {addingUser ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={!!permDialog} onOpenChange={() => { setPermDialog(null); setPermState({}); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Permissions — {permDialog?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr,80px,80px] gap-2 text-xs font-semibold text-muted-foreground pb-1 border-b">
              <span>Page</span>
              <span className="text-center">View</span>
              <span className="text-center">Edit</span>
            </div>
            {APP_PAGES.map(page => (
              <div key={page.key} className="grid grid-cols-[1fr,80px,80px] gap-2 items-center py-1.5">
                <span className="text-sm">{page.label}</span>
                <div className="flex justify-center">
                  <Checkbox
                    checked={permState[page.key]?.can_view ?? false}
                    onCheckedChange={checked => setPermState(s => ({
                      ...s,
                      [page.key]: { ...s[page.key], can_view: !!checked, can_edit: !checked ? false : s[page.key]?.can_edit ?? false },
                    }))}
                  />
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={permState[page.key]?.can_edit ?? false}
                    onCheckedChange={checked => setPermState(s => ({
                      ...s,
                      [page.key]: { ...s[page.key], can_edit: !!checked, can_view: checked ? true : s[page.key]?.can_view ?? false },
                    }))}
                  />
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPermDialog(null); setPermState({}); }}>Cancel</Button>
            <Button onClick={handleSavePermissions} disabled={savingPerms}>
              {savingPerms ? 'Saving...' : 'Save Permissions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
