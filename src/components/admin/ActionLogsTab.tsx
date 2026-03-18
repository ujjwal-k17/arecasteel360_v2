import { useState } from 'react';
import { useAllActionLogs, useAllApprovals, useReviewApproval } from '@/hooks/useActionLog';
import { useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RefreshCw, Check, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ActionLogsTab() {
  const { data: logs, isLoading: logsLoading } = useAllActionLogs();
  const { data: approvals, isLoading: approvalsLoading } = useAllApprovals();
  const reviewApproval = useReviewApproval();
  const qc = useQueryClient();

  const pendingApprovals = (approvals || []).filter((a: any) => a.status === 'pending');
  const reviewedApprovals = (approvals || []).filter((a: any) => a.status !== 'pending');

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await reviewApproval.mutateAsync({ id, status });
      toast.success(`Request ${status}`);
    } catch (e: any) {
      toast.error(e.message || `Failed to ${status} request`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Logs & Approvals</h2>
        <Button variant="outline" size="sm" onClick={() => {
          qc.invalidateQueries({ queryKey: ['action_logs'] });
          qc.invalidateQueries({ queryKey: ['all_approvals'] });
          qc.invalidateQueries({ queryKey: ['pending_approvals'] });
        }}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            Pending Approvals
            {pendingApprovals.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">{pendingApprovals.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          <TabsTrigger value="logs">Activity Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApprovals.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No pending approvals</TableCell></TableRow>
                ) : pendingApprovals.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{format(new Date(a.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                    <TableCell className="text-xs">{a.requested_by_email || '-'}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px]">{a.action_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{a.description}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => handleReview(a.id, 'approved')} disabled={reviewApproval.isPending}>
                          <Check className="h-3 w-3" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={() => handleReview(a.id, 'rejected')} disabled={reviewApproval.isPending}>
                          <X className="h-3 w-3" /> Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="reviewed">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Reviewed At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewedApprovals.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No reviewed approvals</TableCell></TableRow>
                ) : reviewedApprovals.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{format(new Date(a.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                    <TableCell className="text-xs">{a.requested_by_email || '-'}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px]">{a.action_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{a.description}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={a.status === 'approved' ? 'default' : 'destructive'} className="text-[10px]">
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{a.reviewed_at ? format(new Date(a.reviewed_at), 'dd/MM/yyyy HH:mm') : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="text-xs">Entity</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                ) : (logs || []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No activity logs yet</TableCell></TableRow>
                ) : (logs || []).map((log: any) => (
                  <TableRow key={log.id} className={log.is_undone ? 'opacity-50' : ''}>
                    <TableCell className="text-xs">{format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                    <TableCell className="text-xs">{log.user_email || '-'}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px]">{log.action_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{log.entity_type}</TableCell>
                    <TableCell className="text-xs">{log.description}</TableCell>
                    <TableCell className="text-xs">
                      {log.is_undone ? (
                        <Badge variant="secondary" className="text-[10px]">Undone</Badge>
                      ) : (
                        <Badge variant="default" className="text-[10px]">Active</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
