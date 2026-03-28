
CREATE TABLE public.steel_pallet_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pallet_size text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.steel_pallet_skus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to steel_pallet_skus" ON public.steel_pallet_skus FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.steel_pallet_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pallet_sku_id uuid NOT NULL REFERENCES public.steel_pallet_skus(id) ON DELETE CASCADE,
  purchase_date date NOT NULL,
  weight_kg numeric NOT NULL DEFAULT 0,
  num_pcs integer NOT NULL DEFAULT 0,
  rate_per_kg numeric DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.steel_pallet_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to steel_pallet_purchases" ON public.steel_pallet_purchases FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.steel_pallet_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pallet_sku_id uuid NOT NULL REFERENCES public.steel_pallet_skus(id) ON DELETE CASCADE,
  consumption_date date NOT NULL,
  weight_kg numeric NOT NULL DEFAULT 0,
  num_pcs integer NOT NULL DEFAULT 0,
  order_id text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.steel_pallet_consumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to steel_pallet_consumptions" ON public.steel_pallet_consumptions FOR ALL USING (true) WITH CHECK (true);
