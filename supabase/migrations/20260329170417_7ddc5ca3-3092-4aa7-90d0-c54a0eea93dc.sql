
CREATE TABLE public.transporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transporters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to transporters" ON public.transporters FOR ALL TO public USING (true) WITH CHECK (true);

CREATE TABLE public.transporter_freight (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  transporter_id uuid REFERENCES public.transporters(id) ON DELETE SET NULL,
  total_freight numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transporter_freight ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to transporter_freight" ON public.transporter_freight FOR ALL TO public USING (true) WITH CHECK (true);
