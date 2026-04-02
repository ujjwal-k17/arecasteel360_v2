import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface DropdownOption {
  id: string;
  category: string;
  value: string;
  parent_value: string | null;
  is_active: boolean;
  sort_order: number | null;
}

export function useDropdownOptions() {
  return useQuery({
    queryKey: ['dropdown_options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dropdown_options')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('sort_order')
        .order('value');
      if (error) throw error;
      return data as DropdownOption[];
    },
    staleTime: 30_000,
  });
}

/** Derive the lists/maps that components need from raw dropdown_options rows */
export function useDerivedOptions() {
  const { data: options, isLoading } = useDropdownOptions();

  const byCategory = (cat: string) =>
    (options || []).filter(o => o.category === cat).map(o => o.value);

  const byParent = (cat: string) => {
    const map: Record<string, string[]> = {};
    (options || []).filter(o => o.category === cat).forEach(o => {
      const parent = o.parent_value || '__none__';
      if (!map[parent]) map[parent] = [];
      map[parent].push(o.value);
    });
    return map;
  };

  const materials = byCategory('material');
  const makes = byCategory('make');
  const forms = byCategory('form');
  const coatingByMaterial = byParent('coating');
  const gradeByMaterial = byParent('grade');

  return { materials, makes, forms, coatingByMaterial, gradeByMaterial, isLoading };
}
