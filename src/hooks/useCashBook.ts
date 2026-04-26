import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CashEntry {
  id: string;
  direction: 'in' | 'out';
  status: 'receivable' | 'received';
  entry_date: string;
  amount: number;
  category: string | null;
  sub_category: string | null;
  comments: string | null;
  debtor_name: string | null;
  buyer_name: string | null;
  source_type: string | null;
  source_id: string | null;
  received_date: string | null;
  created_at: string;
  updated_at: string;
}

const sb = supabase as any;

export function useCashEntries() {
  return useQuery({
    queryKey: ['cash_entries'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('cash_entries')
        .select('*')
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return (data || []) as CashEntry[];
    },
  });
}

export function useInsertCashEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Partial<CashEntry>) => {
      const { data, error } = await sb.from('cash_entries').insert(entry).select().single();
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
      const { error } = await sb.from('cash_entries').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash_entries'] }),
    onError: (e: any) => toast.error(e.message || 'Failed to update'),
  });
}

export function useCashCategories(direction: 'in' | 'out' = 'in') {
  const catCategory = direction === 'in' ? 'cash_in_category' : 'cash_out_category';
  const subCategory = direction === 'in' ? 'cash_in_subcategory' : 'cash_out_subcategory';
  // Include legacy categories as fallback so existing data still works
  const legacyCat = 'cash_category';
  const legacySub = 'cash_subcategory';
  return useQuery({
    queryKey: ['dropdown_options', 'cash', direction],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dropdown_options')
        .select('*')
        .in('category', [catCategory, subCategory, legacyCat, legacySub])
        .eq('is_active', true)
        .order('sort_order')
        .order('value');
      if (error) throw error;
      const rows = data || [];
      let categories = rows.filter((o: any) => o.category === catCategory).map((o: any) => o.value);
      if (categories.length === 0) {
        categories = rows.filter((o: any) => o.category === legacyCat).map((o: any) => o.value);
      }
      const subByParent: Record<string, string[]> = {};
      const subRows = rows.filter((o: any) => o.category === subCategory);
      const useSubRows = subRows.length > 0 ? subRows : rows.filter((o: any) => o.category === legacySub);
      useSubRows.forEach((o: any) => {
        const key = o.parent_value || '_';
        if (!subByParent[key]) subByParent[key] = [];
        subByParent[key].push(o.value);
      });
      return { categories, subByParent };
    },
  });
}
