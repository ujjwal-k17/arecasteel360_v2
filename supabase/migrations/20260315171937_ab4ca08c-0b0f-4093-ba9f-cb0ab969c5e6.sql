
-- Add order_date to orders (may already exist from failed migration)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_date date DEFAULT CURRENT_DATE;

-- Create order_dispatches table if not exists
CREATE TABLE IF NOT EXISTS public.order_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  dispatch_qty numeric DEFAULT 0,
  dispatch_date date,
  invoice_number text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.order_dispatches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_dispatches' AND policyname = 'Allow all access to order_dispatches') THEN
    CREATE POLICY "Allow all access to order_dispatches"
      ON public.order_dispatches FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;
