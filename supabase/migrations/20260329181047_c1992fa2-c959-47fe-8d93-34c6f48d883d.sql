
CREATE TABLE public.transporter_freight_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transporter_freight_id uuid NOT NULL REFERENCES public.transporter_freight(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  user_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transporter_freight_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to transporter_freight_payments"
  ON public.transporter_freight_payments FOR ALL
  USING (true) WITH CHECK (true);
