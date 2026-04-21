
ALTER TABLE public.scrap_sales
  ADD COLUMN IF NOT EXISTS sales_type text CHECK (sales_type IN ('cash','invoice')),
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS buyer_name text;
