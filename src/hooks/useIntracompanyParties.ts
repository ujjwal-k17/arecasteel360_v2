import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface IntracompanyMatcher {
  /** Returns true when the given party/ledger name should be excluded as intracompany. */
  isIntracompany: (name: string | null | undefined) => boolean;
  /** Backwards compat: behaves like a Set — supports `.has(name)`. */
  has: (name: string | null | undefined) => boolean;
  /** Raw company names from tally_companies. */
  companies: string[];
  /** Manually flagged ledger names from debtor_master.is_intracompany. */
  manualLedgers: Set<string>;
}

/**
 * Smart intracompany detection. A ledger / party is considered intracompany if ANY of:
 *   1. Exactly matches a company_name in tally_companies (case-insensitive)
 *   2. Its name contains a tally_companies company_name as a substring (ILIKE %name%)
 *      e.g. "Areca Indocorp Llp" matches company "Areca Indocorp"
 *      Tokens shorter than 4 chars are skipped to avoid false positives.
 *   3. Manually flagged via debtor_master.is_intracompany = true
 */
export function useIntracompanyParties() {
  return useQuery<IntracompanyMatcher>({
    queryKey: ['business-overview', 'intracompany-parties', 'v2'],
    queryFn: async () => {
      const [{ data: cos, error: e1 }, { data: dm, error: e2 }] = await Promise.all([
        supabase.from('tally_companies').select('company_name').limit(10000),
        supabase.from('debtor_master').select('ledger_name').eq('is_intracompany', true).limit(10000),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const companies = (cos ?? []).map((r: any) => String(r.company_name ?? '')).filter(Boolean);
      const manualLedgers = new Set<string>(
        (dm ?? []).map((r: any) => String(r.ledger_name ?? '').toLowerCase()).filter(Boolean),
      );

      // Pre-normalize company names for matching
      const normalizedCompanies = companies
        .map(c => c.toLowerCase().trim())
        .filter(c => c.length >= 4);

      const isIntracompany = (raw: string | null | undefined): boolean => {
        if (!raw) return false;
        const n = String(raw).toLowerCase().trim();
        if (!n) return false;
        if (manualLedgers.has(n)) return true;
        for (const c of normalizedCompanies) {
          if (n === c) return true;
          if (n.includes(c)) return true;
        }
        return false;
      };

      return {
        isIntracompany,
        has: isIntracompany, // Set-compatible API
        companies,
        manualLedgers,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
