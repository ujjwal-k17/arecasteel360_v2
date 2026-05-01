ALTER TABLE public.tally_vouchers
  DROP CONSTRAINT IF EXISTS tally_vouchers_company_voucher_unique;

CREATE UNIQUE INDEX IF NOT EXISTS tally_vouchers_unique_voucher_identity
  ON public.tally_vouchers (company_name, voucher_type, voucher_number, date) NULLS NOT DISTINCT;