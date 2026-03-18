import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserManagementTab from '@/components/admin/UserManagementTab';
import IPWhitelistTab from '@/components/admin/IPWhitelistTab';

export default function AdminPage() {
  return (
    <div className="container py-6">
      <h1 className="text-2xl font-semibold mb-6">Admin Configuration</h1>
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="ips">IP Whitelist</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UserManagementTab />
        </TabsContent>
        <TabsContent value="ips">
          <IPWhitelistTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
