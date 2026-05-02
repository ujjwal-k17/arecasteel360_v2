-- Add sales_rep to debtor_master
ALTER TABLE public.debtor_master ADD COLUMN IF NOT EXISTS sales_rep text;

-- Create sales_reps table
CREATE TABLE IF NOT EXISTS public.sales_reps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_reps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sales_reps"
ON public.sales_reps FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert sales_reps"
ON public.sales_reps FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update sales_reps"
ON public.sales_reps FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete sales_reps"
ON public.sales_reps FOR DELETE TO authenticated USING (true);

-- Ensure debtor_master has unique constraint on (company_name, ledger_name) for upserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'debtor_master_company_ledger_unique'
  ) THEN
    ALTER TABLE public.debtor_master
    ADD CONSTRAINT debtor_master_company_ledger_unique UNIQUE (company_name, ledger_name);
  END IF;
END$$;

-- Ensure invoice_credit_periods has unique constraint on (company_name, voucher_number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_credit_periods_company_voucher_unique'
  ) THEN
    ALTER TABLE public.invoice_credit_periods
    ADD CONSTRAINT invoice_credit_periods_company_voucher_unique UNIQUE (company_name, voucher_number);
  END IF;
END$$;
