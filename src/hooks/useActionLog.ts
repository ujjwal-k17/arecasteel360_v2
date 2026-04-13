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
          // Move FG item back — reverse ALL processing impacts on the source batch
          const { data: fgItem } = await supabase.from('fg_items').select('*').eq('id', entityId).single();
          if (fgItem) {
            const procRecId = (fgItem as any).processing_record_id;
            let batchId: string | null = null;

            if (procRecId) {
              // Get the source batch from the processing record
              const { data: procRec } = await supabase
                .from('processing_records')
                .select('batch_id')
                .eq('id', procRecId)
                .maybeSingle();
              batchId = procRec ? (procRec as any).batch_id : null;
            }

            // If we found the batch, reverse ALL impacts on it
            if (batchId) {
              // 1. Find ALL processing records for this batch
              const { data: allProcs } = await supabase
                .from('processing_records')
                .select('id')
                .eq('batch_id', batchId);
              const allProcIds = (allProcs || []).map((p: any) => p.id);

              if (allProcIds.length > 0) {
                // 2. Delete ALL FG items tied to these processing records
                await supabase.from('fg_items').delete().in('processing_record_id', allProcIds);

                // 3. Delete ALL WIP defectives for WIP items tied to these processing records
                const { data: wipItemsForBatch } = await supabase
                  .from('wip_items')
                  .select('id')
                  .in('processing_record_id', allProcIds);
                const wipIds = (wipItemsForBatch || []).map((w: any) => w.id);
                if (wipIds.length > 0) {
                  await supabase.from('wip_defectives' as any).delete().in('wip_item_id', wipIds);
                }

                // 4. Delete ALL WIP items tied to these processing records
                await supabase.from('wip_items').delete().in('processing_record_id', allProcIds);

                // 5. Delete ALL processing output items
                await supabase.from('processing_output_items').delete().in('processing_record_id', allProcIds);

                // 6. Delete ALL processing records for this batch
                await supabase.from('processing_records').delete().in('id', allProcIds);
              }

              // 7. Delete ALL scrap, defective, and trimming inventory_actions for this batch
              await supabase
                .from('inventory_actions')
                .delete()
                .eq('batch_id', batchId)
                .in('action_type', ['scrap', 'defective']);

              // 8. Reset batch_status
              await supabase.from('batches').update({ batch_status: null } as any).eq('id', batchId);

              // 9. Also dismiss any other pending approvals for FG items from the same batch
              if (allProcIds.length > 0) {
                const { data: relatedApprovals } = await supabase
                  .from('pending_approvals' as any)
                  .select('id, metadata')
                  .eq('status', 'pending')
                  .eq('action_type', 'move_back')
                  .eq('entity_type', 'fg_item');
                if (relatedApprovals) {
                  const idsToReject = (relatedApprovals as any[])
                    .filter((a: any) => a.metadata?.processing_record_id && allProcIds.includes(a.metadata.processing_record_id) && a.id !== id)
                    .map((a: any) => a.id);
                  if (idsToReject.length > 0) {
                    await supabase
                      .from('pending_approvals' as any)
                      .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() } as any)
                      .in('id', idsToReject);
                  }
                }
              }
            } else {
              // Fallback: no batch found, just delete the single FG item
              await supabase.from('fg_items').delete().eq('id', entityId);
            }
          }
        } else if (actionType === 'move_back' && entityType === 'wip_item') {
          // Move WIP item back to Coil Inventory
          const { data: wipItem } = await supabase.from('wip_items').select('*').eq('id', entityId).maybeSingle();
          if (wipItem) {
            const procRecId = (wipItem as any).processing_record_id;
            const sourceBatchId = (wipItem as any).source_batch_id;

            // Delete related defectives first (FK constraint)
            await supabase.from('wip_defectives' as any).delete().eq('wip_item_id', entityId);

            // Delete the WIP item
            const { error: delErr } = await supabase.from('wip_items').delete().eq('id', entityId);
            if (delErr) throw new Error(`Failed to delete WIP item: ${delErr.message}`);

            if (procRecId) {
              // Check if any other WIP items still reference this processing record
              const { data: remainingWip } = await supabase
                .from('wip_items')
                .select('id')
                .eq('processing_record_id', procRecId);

              if (!remainingWip || remainingWip.length === 0) {
                // Last WIP item moved back — clean up processing record, output items, and associated scrap/defective actions
                await supabase.from('processing_output_items').delete().eq('processing_record_id', procRecId);

                // Get the processing record to find the batch_id
                const { data: procRec } = await supabase
                  .from('processing_records')
                  .select('batch_id, created_at')
                  .eq('id', procRecId)
                  .maybeSingle();

                await supabase.from('processing_records').delete().eq('id', procRecId);

                // Delete scrap/defective actions that were created during this processing
                if (procRec && (procRec as any).batch_id) {
                  const batchId = (procRec as any).batch_id;
                  const procTime = new Date((procRec as any).created_at).getTime();
                  const { data: batchActions } = await supabase
                    .from('inventory_actions')
                    .select('*')
                    .eq('batch_id', batchId)
                    .in('action_type', ['scrap', 'defective']);

                  if (batchActions) {
                    const idsToDelete = batchActions
                      .filter((a: any) => Math.abs(new Date(a.created_at).getTime() - procTime) < 5000)
                      .map((a: any) => a.id);
                    if (idsToDelete.length > 0) {
                      await supabase.from('inventory_actions').delete().in('id', idsToDelete);
                    }
                  }

                  // Reset batch_status if no other processing records reference this batch
                  const { data: otherProcs } = await supabase
                    .from('processing_records')
                    .select('id')
                    .eq('batch_id', batchId);
                  if (!otherProcs || otherProcs.length === 0) {
                    await supabase.from('batches').update({ batch_status: null } as any).eq('id', batchId);
                  }
                }
              }
            }
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
      qc.invalidateQueries({ queryKey: ['wip_items'] });
      qc.invalidateQueries({ queryKey: ['fg_items'] });
      qc.invalidateQueries({ queryKey: ['processing_records'] });
    },
  });
}
