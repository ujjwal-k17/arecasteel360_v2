
CREATE TABLE public.fg_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fg_item_id UUID REFERENCES public.fg_items(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT,
  order_id TEXT,
  quantity NUMERIC DEFAULT 0,
  sales_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fg_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to fg_sales" ON public.fg_sales FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.fg_defectives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fg_item_id UUID REFERENCES public.fg_items(id) ON DELETE CASCADE NOT NULL,
  defect_type TEXT NOT NULL,
  quantity NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fg_defectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to fg_defectives" ON public.fg_defectives FOR ALL USING (true) WITH CHECK (true);
