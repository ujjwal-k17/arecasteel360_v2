import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type ScrapSale = Tables<'scrap_sales'>;
export type DefectiveSale = Tables<'defective_sales'>;

export function useScrapSales() {
  return useQuery({
    queryKey: ['scrap_sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('scrap_sales').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useInsertScrapSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sale: Omit<ScrapSale, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('scrap_sales').insert(sale as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scrap_sales'] }),
  });
}

export function useDefectiveSales() {
  return useQuery({
    queryKey: ['defective_sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('defective_sales').select('*, batches(*)').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useInsertDefectiveSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sale: Omit<DefectiveSale, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('defective_sales').insert(sale as any).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['defective_sales'] }),
  });
}
