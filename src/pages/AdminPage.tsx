import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserManagementTab from '@/components/admin/UserManagementTab';
import IPWhitelistTab from '@/components/admin/IPWhitelistTab';
import ActionLogsTab from '@/components/admin/ActionLogsTab';
import { usePendingApprovals } from '@/hooks/useActionLog';
import { Badge } from '@/components/ui/badge';

export default function AdminPage() {
  const { data: pending } = usePendingApprovals();
  const pendingCount = (pending || []).length;

  return (
    <div className="container py-6">
      <h1 className="text-2xl font-semibold mb-6">Admin Configuration</h1>
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="ips">IP Whitelist</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            Logs & Approvals
            {pendingCount > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">{pendingCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UserManagementTab />
        </TabsContent>
        <TabsContent value="ips">
          <IPWhitelistTab />
        </TabsContent>
        <TabsContent value="logs">
          <ActionLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
