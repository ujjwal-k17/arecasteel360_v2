
-- Table: debtor_master
CREATE TABLE IF NOT EXISTS public.debtor_master (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text NOT NULL,
  ledger_name text NOT NULL,
  gstin text,
  address text,
  contact text,
  credit_period_days integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debtor_master_company_ledger_unique UNIQUE (company_name, ledger_name)
);

ALTER TABLE public.debtor_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read debtor_master"
  ON public.debtor_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert debtor_master"
  ON public.debtor_master FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update debtor_master"
  ON public.debtor_master FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete debtor_master"
  ON public.debtor_master FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_debtor_master_updated_at
  BEFORE UPDATE ON public.debtor_master
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_debtor_master_company ON public.debtor_master(company_name);
CREATE INDEX IF NOT EXISTS idx_debtor_master_ledger ON public.debtor_master(ledger_name);

-- Table: invoice_credit_periods
CREATE TABLE IF NOT EXISTS public.invoice_credit_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_number text NOT NULL,
  company_name text NOT NULL,
  credit_period_days integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_credit_periods_company_voucher_unique UNIQUE (company_name, voucher_number)
);

ALTER TABLE public.invoice_credit_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read invoice_credit_periods"
  ON public.invoice_credit_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert invoice_credit_periods"
  ON public.invoice_credit_periods FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update invoice_credit_periods"
  ON public.invoice_credit_periods FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete invoice_credit_periods"
  ON public.invoice_credit_periods FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_invoice_credit_periods_updated_at
  BEFORE UPDATE ON public.invoice_credit_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_icp_company ON public.invoice_credit_periods(company_name);
CREATE INDEX IF NOT EXISTS idx_icp_voucher ON public.invoice_credit_periods(voucher_number);
