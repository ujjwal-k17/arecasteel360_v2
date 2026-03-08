
-- Timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- In-transit batches (Tab 1)
CREATE TABLE public.batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_number TEXT NOT NULL,
  material TEXT,
  make TEXT,
  thickness NUMERIC,
  width NUMERIC,
  length NUMERIC,
  coating TEXT,
  grade TEXT,
  gsm NUMERIC,
  colour TEXT,
  gross_weight NUMERIC DEFAULT 0,
  net_weight NUMERIC DEFAULT 0,
  coil_number TEXT,
  purchase_date DATE,
  purchase_from TEXT,
  status TEXT NOT NULL DEFAULT 'in-transit' CHECK (status IN ('in-transit', 'received')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to batches" ON public.batches FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inventory actions (Sales, Defective, Scrap per batch)
CREATE TABLE public.inventory_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('sales', 'defective', 'scrap')),
  -- Sales fields
  order_id TEXT,
  sales_date DATE,
  invoice_number TEXT,
  -- Defective fields
  defect_type TEXT CHECK (defect_type IN ('End pcs', 'Scratch/ Dent', 'Waviness', 'Other')),
  -- Scrap fields
  scrap_type TEXT CHECK (scrap_type IN ('End Pcs', 'Trimming', 'Metal Cover', 'Non metal cover', 'Short qty')),
  -- Common
  net_weight NUMERIC DEFAULT 0,
  gross_weight NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to inventory_actions" ON public.inventory_actions FOR ALL USING (true) WITH CHECK (true);

-- Scrap sales (Tab 3)
CREATE TABLE public.scrap_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scrap_type TEXT NOT NULL,
  material TEXT,
  qty_sold NUMERIC DEFAULT 0,
  sales_date DATE,
  weight_slip_url TEXT,
  amount_received NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scrap_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to scrap_sales" ON public.scrap_sales FOR ALL USING (true) WITH CHECK (true);

-- Defective sales (Tab 4)
CREATE TABLE public.defective_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  order_id TEXT,
  invoice_number TEXT,
  sales_date DATE,
  quantity NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.defective_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to defective_sales" ON public.defective_sales FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for weight slips
INSERT INTO storage.buckets (id, name, public) VALUES ('weight-slips', 'weight-slips', true);
CREATE POLICY "Anyone can upload weight slips" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'weight-slips');
CREATE POLICY "Anyone can view weight slips" ON storage.objects FOR SELECT USING (bucket_id = 'weight-slips');
