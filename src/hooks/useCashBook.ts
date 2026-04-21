import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

export type CashEntry = Tables<'cash_entries'>;

export function useCashEntries() {
  return useQuery({
    queryKey: ['cash_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_entries')
        .select('*')
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return data as CashEntry[];
    },
  });
}

export function useInsertCashEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Partial<CashEntry>) => {
      const { data, error } = await supabase.from('cash_entries').insert(entry as any).select().single();
      if (error) throw error;
      return data as CashEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash_entries'] }),
    onError: (e: any) => toast.error(e.message || 'Failed to save'),
  });
}

export function useUpdateCashEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<CashEntry> & { id: string }) => {
      const { error } = await supabase.from('cash_entries').update(rest as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash_entries'] }),
    onError: (e: any) => toast.error(e.message || 'Failed to update'),
  });
}

export function useCashCategories() {
  return useQuery({
    queryKey: ['dropdown_options', 'cash'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dropdown_options')
        .select('*')
        .in('category', ['cash_category', 'cash_subcategory'])
        .eq('is_active', true)
        .order('sort_order')
        .order('value');
      if (error) throw error;
      const categories = (data || []).filter((o: any) => o.category === 'cash_category').map((o: any) => o.value);
      const subByParent: Record<string, string[]> = {};
      (data || []).filter((o: any) => o.category === 'cash_subcategory').forEach((o: any) => {
        const key = o.parent_value || '_';
        if (!subByParent[key]) subByParent[key] = [];
        subByParent[key].push(o.value);
      });
      return { categories, subByParent };
    },
  });
}
