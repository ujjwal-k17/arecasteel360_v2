import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useActionLog() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (log: {
      action_type: string;
      entity_type: string;
      entity_id?: string;
      description: string;
      metadata?: Record<string, any>;
    }) => {
      if (!user) return;
      const { error } = await supabase.from('action_logs' as any).insert({
        user_id: user.id,
        user_email: user.email,
        ...log,
        metadata: log.metadata || {},
      } as any);
      if (error) throw error;
    },
  });
}

export function useAllActionLogs() {
  return useQuery({
    queryKey: ['action_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('action_logs' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['pending_approvals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_approvals' as any)
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useAllApprovals() {
  return useQuery({
    queryKey: ['all_approvals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_approvals' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useSubmitApproval() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (approval: {
      action_type: string;
      entity_type: string;
      entity_id: string;
      description: string;
      metadata?: Record<string, any>;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('pending_approvals' as any).insert({
        requested_by: user.id,
        requested_by_email: user.email,
        ...approval,
        metadata: approval.metadata || {},
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending_approvals'] }),
  });
}

export function useReviewApproval() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      if (!user) throw new Error('Not authenticated');

      // Get the approval details
      const { data: approval, error: fetchErr } = await supabase
        .from('pending_approvals' as any)
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      if (status === 'approved') {
        // Execute the actual action
        const meta = (approval as any).metadata || {};
        const entityType = (approval as any).entity_type;
        const entityId = (approval as any).entity_id;
        const actionType = (approval as any).action_type;

        if (actionType === 'move_back' && entityType === 'fg_item') {
          // Move FG item back to WIP or Coil
          const { data: fgItem } = await supabase.from('fg_items').select('*').eq('id', entityId).single();
          if (fgItem) {
            if (meta.source_type === 'wip' && meta.source_id) {
              const { data: wipItem } = await supabase.from('wip_items').select('qty, status').eq('id', meta.source_id).single();
              if (wipItem) {
                const newQty = ((wipItem as any).qty || 0) + ((fgItem as any).qty || 0);
                await supabase.from('wip_items').update({ qty: newQty, status: 'active' } as any).eq('id', meta.source_id);
              }
            }
            if ((fgItem as any).processing_record_id) {
              await supabase.from('processing_output_items').delete().eq('processing_record_id', (fgItem as any).processing_record_id);
              const { data: otherFGs } = await supabase.from('fg_items').select('id').eq('processing_record_id', (fgItem as any).processing_record_id).neq('id', entityId);
              if (!otherFGs || otherFGs.length === 0) {
                await supabase.from('processing_records').delete().eq('id', (fgItem as any).processing_record_id);
              }
            }
            await supabase.from('fg_items').delete().eq('id', entityId);
          }
        } else if (actionType === 'move_back' && entityType === 'wip_item') {
          // Move WIP item back to Coil Inventory
          const { data: wipItem } = await supabase.from('wip_items').select('*').eq('id', entityId).single();
          if (wipItem) {
            if ((wipItem as any).processing_record_id) {
              await supabase.from('processing_output_items').delete().eq('processing_record_id', (wipItem as any).processing_record_id);
              await supabase.from('processing_records').delete().eq('id', (wipItem as any).processing_record_id);
            }
            await supabase.from('wip_items').delete().eq('id', entityId);
          }
        } else if (entityType === 'order') {
          // Delete order items first, then the order
          const { data: items } = await supabase.from('order_items').select('id').eq('order_id', entityId);
          if (items && items.length > 0) {
            const ids = items.map((i: any) => i.id);
            await supabase.from('order_dispatches' as any).delete().in('order_item_id', ids);
          }
          await supabase.from('order_items').delete().eq('order_id', entityId);
          await supabase.from('orders').delete().eq('id', entityId);
        } else if (entityType === 'batch') {
          await supabase.from('inventory_actions').delete().eq('batch_id', entityId);
          await supabase.from('batches').delete().eq('id', entityId);
        }
      }

      // Update approval status
      const { error } = await supabase
        .from('pending_approvals' as any)
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending_approvals'] });
      qc.invalidateQueries({ queryKey: ['all_approvals'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['inventory_actions'] });
    },
  });
}
