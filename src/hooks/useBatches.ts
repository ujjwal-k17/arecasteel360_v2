import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type Batch = Tables<'batches'>;
export type BatchInsert = TablesInsert<'batches'>;
export type BatchUpdate = TablesUpdate<'batches'>;
export type InventoryAction = Tables<'inventory_actions'>;

export function useBatches(statusFilter?: string) {
  return useQuery({
    queryKey: ['batches', statusFilter],
    queryFn: async () => {
      let q = supabase.from('batches').select('*').order('created_at', { ascending: false });
      if (statusFilter) q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useAllBatches() {
  return useQuery({
    queryKey: ['batches', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('batches').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useBatchActions(batchId?: string) {
  return useQuery({
    queryKey: ['inventory_actions', batchId],
    queryFn: async () => {
      let q = supabase.from('inventory_actions').select('*');
      if (batchId) q = q.eq('batch_id', batchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useAllActions() {
  return useQuery({
    queryKey: ['inventory_actions', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory_actions').select('*, batches(*)');
      if (error) throw error;
      return data;
    },
  });
}

export function useInsertBatches() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batches: BatchInsert[]) => {
      const { data, error } = await supabase.from('batches').insert(batches).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batches'] }),
  });
}

export function useUpdateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...update }: BatchUpdate & { id: string }) => {
      const { data, error } = await supabase.from('batches').update(update).eq('id', id).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batches'] }),
  });
}

export function useInsertAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: Omit<InventoryAction, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('inventory_actions').insert(action as any).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory_actions'] });
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
  });
}

// Balance calculations
export function calcBalanceQty(batch: Batch, actions: InventoryAction[]): number {
  const batchActions = actions.filter(a => a.batch_id === batch.id);
  const salesScrap = batchActions
    .filter(a => a.action_type === 'sales' || a.action_type === 'scrap')
    .reduce((sum, a) => sum + (a.net_weight || 0), 0);
  return (batch.gross_weight || 0) + 80 - salesScrap;
}

export function calcUsableBalanceQty(batch: Batch, actions: InventoryAction[]): number {
  const batchActions = actions.filter(a => a.batch_id === batch.id);
  const totalDeductions = batchActions.reduce((sum, a) => sum + (a.net_weight || 0), 0);
  return (batch.gross_weight || 0) + 80 - totalDeductions;
}

// SKU key
export function getSKUKey(b: Batch): string {
  return [b.make, b.grade, b.thickness, b.width, b.gsm, b.colour].filter(Boolean).join(' × ');
}
