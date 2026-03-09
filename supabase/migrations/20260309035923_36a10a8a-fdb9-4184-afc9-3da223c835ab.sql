-- Pallet SKUs table
CREATE TABLE public.pallet_skus (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pallet_size TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pallet_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to pallet_skus"
ON public.pallet_skus
FOR ALL
USING (true)
WITH CHECK (true);

-- Pallet purchases table
CREATE TABLE public.pallet_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pallet_sku_id UUID NOT NULL REFERENCES public.pallet_skus(id) ON DELETE CASCADE,
  purchase_date DATE NOT NULL,
  supplier TEXT,
  weight_kg NUMERIC NOT NULL DEFAULT 0,
  num_pcs INTEGER NOT NULL DEFAULT 0,
  rate_per_kg NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pallet_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to pallet_purchases"
ON public.pallet_purchases
FOR ALL
USING (true)
WITH CHECK (true);

-- Pallet consumptions table
CREATE TABLE public.pallet_consumptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pallet_sku_id UUID NOT NULL REFERENCES public.pallet_skus(id) ON DELETE CASCADE,
  consumption_date DATE NOT NULL,
  order_id TEXT,
  weight_kg NUMERIC NOT NULL DEFAULT 0,
  num_pcs INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pallet_consumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to pallet_consumptions"
ON public.pallet_consumptions
FOR ALL
USING (true)
WITH CHECK (true);