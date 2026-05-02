import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useTallyCompanies() {
  return useQuery({
    queryKey: ['business-overview', 'companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tally_companies')
        .select('id, company_name, is_active')
        .eq('is_active', true)
        .order('company_name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLastSyncAt() {
  return useQuery({
    queryKey: ['business-overview', 'last-sync'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tally_sync_log')
        .select('completed_at, started_at, status')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.completed_at ?? data?.started_at ?? null;
    },
    refetchInterval: 60_000,
  });
}
