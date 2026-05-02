import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the set of company_name values from tally_companies.
 * Any voucher / ledger whose party_name (or ledger_name) exactly matches
 * one of these is considered an intracompany transaction and is normally
 * excluded from sales / purchase / debtor / creditor analysis.
 */
export function useIntracompanyParties() {
  return useQuery({
    queryKey: ['business-overview', 'intracompany-parties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tally_companies')
        .select('company_name');
      if (error) throw error;
      return new Set<string>((data ?? []).map((r: any) => r.company_name));
    },
    staleTime: 5 * 60 * 1000,
  });
}
