import { supabase } from '@/integrations/supabase/client';

/**
 * Upserts a SKU using the database function and returns the SKU id.
 * Fields: material, thickness, width, length, coating, grade
 */
export async function upsertSku(params: {
  material?: string | null;
  thickness?: number | null;
  width?: number | null;
  length?: number | null;
  coating?: string | null;
  grade?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_sku' as any, {
    p_material: params.material || null,
    p_thickness: params.thickness ?? null,
    p_width: params.width ?? null,
    p_length: params.length ?? null,
    p_coating: params.coating || null,
    p_grade: params.grade || null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Generates a human-readable SKU label from fields.
 */
export function getSkuLabel(item: {
  material?: string | null;
  form?: string | null;
  thickness?: number | null;
  width?: number | null;
  length?: number | null;
  coating?: string | null;
  grade?: string | null;
}): string {
  const parts = [
    item.material,
    item.form,
    item.thickness ? `${item.thickness}mm` : null,
    item.width ? `${item.width}W` : null,
    item.length ? `${item.length}L` : null,
    item.coating,
    item.grade,
  ].filter(Boolean);
  return parts.join(' | ') || '-';
}
