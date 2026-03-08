
-- Add batch_status column to batches
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS batch_status text;
UPDATE public.batches SET batch_status = COALESCE(form, 'Pack coil') WHERE batch_status IS NULL;

-- Processing records table
CREATE TABLE public.processing_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  process_type text NOT NULL,
  output_type text NOT NULL,
  input_qty numeric DEFAULT 0,
  order_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.processing_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to processing_records" ON public.processing_records FOR ALL USING (true) WITH CHECK (true);

-- Processing output items (slit widths, CTL lengths)
CREATE TABLE public.processing_output_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_record_id uuid NOT NULL REFERENCES public.processing_records(id) ON DELETE CASCADE,
  width numeric,
  length numeric,
  qty_kg numeric DEFAULT 0,
  num_pcs integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.processing_output_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to processing_output_items" ON public.processing_output_items FOR ALL USING (true) WITH CHECK (true);

-- WIP inventory items
CREATE TABLE public.wip_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_batch_id uuid REFERENCES public.batches(id),
  processing_record_id uuid REFERENCES public.processing_records(id),
  material text,
  make text,
  process text,
  width numeric,
  length numeric,
  coating text,
  grade text,
  qty numeric DEFAULT 0,
  num_pcs integer,
  order_id text,
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wip_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to wip_items" ON public.wip_items FOR ALL USING (true) WITH CHECK (true);

-- FG inventory items
CREATE TABLE public.fg_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid,
  source_type text,
  processing_record_id uuid REFERENCES public.processing_records(id),
  material text,
  make text,
  process text,
  width numeric,
  length numeric,
  coating text,
  grade text,
  qty numeric DEFAULT 0,
  num_pcs integer,
  order_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fg_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to fg_items" ON public.fg_items FOR ALL USING (true) WITH CHECK (true);
