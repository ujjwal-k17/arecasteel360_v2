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

export function useDeleteBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('inventory_actions').delete().eq('batch_id', id);
      const { error } = await supabase.from('batches').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['inventory_actions'] });
    },
  });
}

export function useBulkDeleteBatches() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from('inventory_actions').delete().in('batch_id', ids);
      const { error } = await supabase.from('batches').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['inventory_actions'] });
    },
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

// Updated formulas:
// Processed Qty = all material removed: sales + scrap + defective + pack_coil_sale + processing input
// Usable = GW + 80 - Processed Qty
// Balance = GW + 80 - Processed Qty + Defective Qty (defective is physically present)

export function calcProcessedQty(batch: Batch, actions: InventoryAction[], processingRecords?: any[]): number {
  const batchActions = actions.filter(a => a.batch_id === batch.id);
  const actionDeductions = batchActions
    .filter(a => ['sales', 'scrap', 'defective', 'pack_coil_sale'].includes(a.action_type))
    .reduce((sum, a) => sum + (a.net_weight || 0), 0);
  const processingInput = (processingRecords || [])
    .filter((p: any) => p.batch_id === batch.id && (p.source_type || 'coil') === 'coil')
    .reduce((sum: number, p: any) => sum + (p.input_qty || 0), 0);
  return actionDeductions + processingInput;
}

export function calcUsableBalanceQty(batch: Batch, actions: InventoryAction[], processingRecords?: any[]): number {
  return (batch.gross_weight || 0) + 80 - calcProcessedQty(batch, actions, processingRecords);
}

export function calcBalanceQty(batch: Batch, actions: InventoryAction[], processingRecords?: any[]): number {
  const batchActions = actions.filter(a => a.batch_id === batch.id);
  const defectiveQty = batchActions
    .filter(a => a.action_type === 'defective')
    .reduce((sum, a) => sum + (a.net_weight || 0), 0);
  return calcUsableBalanceQty(batch, actions, processingRecords) + defectiveQty;
}

// SKU key
export function getSKUKey(b: Batch): string {
  return [b.make, b.grade, b.thickness, b.width, (b as any).gsm].filter(Boolean).join(' × ');
}
