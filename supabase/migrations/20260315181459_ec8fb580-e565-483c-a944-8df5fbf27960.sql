
-- Create SKUs table with unique combination of key fields
CREATE TABLE IF NOT EXISTS public.skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material text,
  thickness numeric,
  width numeric,
  length numeric,
  coating text,
  grade text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (material, thickness, width, length, coating, grade)
);

-- Enable RLS
ALTER TABLE public.skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to skus" ON public.skus FOR ALL USING (true) WITH CHECK (true);

-- Add sku_id to order_items
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS sku_id uuid REFERENCES public.skus(id);

-- Add sku_id to fg_items
ALTER TABLE public.fg_items ADD COLUMN IF NOT EXISTS sku_id uuid REFERENCES public.skus(id);

-- Create a function to upsert a SKU and return its id
CREATE OR REPLACE FUNCTION public.upsert_sku(
  p_material text,
  p_thickness numeric,
  p_width numeric,
  p_length numeric,
  p_coating text,
  p_grade text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Try to find existing SKU (treating nulls as equal)
  SELECT id INTO v_id FROM public.skus
  WHERE material IS NOT DISTINCT FROM p_material
    AND thickness IS NOT DISTINCT FROM p_thickness
    AND width IS NOT DISTINCT FROM p_width
    AND length IS NOT DISTINCT FROM p_length
    AND coating IS NOT DISTINCT FROM p_coating
    AND grade IS NOT DISTINCT FROM p_grade;

  IF v_id IS NULL THEN
    INSERT INTO public.skus (material, thickness, width, length, coating, grade)
    VALUES (p_material, p_thickness, p_width, p_length, p_coating, p_grade)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;
