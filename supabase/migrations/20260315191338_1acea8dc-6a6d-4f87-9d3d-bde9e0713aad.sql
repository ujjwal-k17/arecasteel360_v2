
CREATE TABLE public.invoice_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  invoice_amount numeric DEFAULT 0,
  credit_period integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to invoice_details"
  ON public.invoice_details FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE TABLE public.inward_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.inward_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to inward_payments"
  ON public.inward_payments FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
