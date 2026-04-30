ALTER TABLE public.tally_debtor_overrides ADD COLUMN IF NOT EXISTS sales_rep text;

INSERT INTO public.dropdown_options (category, value, sort_order, is_active) VALUES
  ('sales_rep', 'SP Gupta', 1, true),
  ('sales_rep', 'Shivam', 2, true),
  ('sales_rep', 'Vinod', 3, true),
  ('sales_rep', 'Siyaram', 4, true),
  ('sales_rep', 'Self', 5, true),
  ('sales_rep', 'IntraCompany', 6, true)
ON CONFLICT DO NOTHING;