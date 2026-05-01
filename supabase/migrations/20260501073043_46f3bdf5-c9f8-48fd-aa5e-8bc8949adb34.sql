-- Table 1: tally_vouchers
CREATE TABLE public.tally_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  voucher_number text NOT NULL,
  voucher_type text,
  date date,
  party_name text,
  amount numeric DEFAULT 0,
  narration text,
  line_items jsonb DEFAULT '[]'::jsonb,
  sync_type text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tally_vouchers_company_voucher_unique UNIQUE (company_name, voucher_number)
);
CREATE INDEX idx_tally_vouchers_company_date ON public.tally_vouchers(company_name, date DESC);
CREATE INDEX idx_tally_vouchers_type ON public.tally_vouchers(voucher_type);

ALTER TABLE public.tally_vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tally_vouchers" ON public.tally_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tally_vouchers" ON public.tally_vouchers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tally_vouchers" ON public.tally_vouchers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Table 2: tally_ledger_balances
CREATE TABLE public.tally_ledger_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  ledger_name text NOT NULL,
  ledger_group text,
  closing_balance numeric DEFAULT 0,
  as_of_date date NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tally_ledger_balances_unique UNIQUE (company_name, ledger_name, as_of_date)
);
CREATE INDEX idx_tally_ledger_balances_company_group ON public.tally_ledger_balances(company_name, ledger_group);
CREATE INDEX idx_tally_ledger_balances_date ON public.tally_ledger_balances(as_of_date DESC);

ALTER TABLE public.tally_ledger_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tally_ledger_balances" ON public.tally_ledger_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tally_ledger_balances" ON public.tally_ledger_balances FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tally_ledger_balances" ON public.tally_ledger_balances FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Table 3: tally_stock_items
CREATE TABLE public.tally_stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  item_name text NOT NULL,
  closing_qty numeric DEFAULT 0,
  closing_value numeric DEFAULT 0,
  unit text,
  as_of_date date NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tally_stock_items_unique UNIQUE (company_name, item_name, as_of_date)
);
CREATE INDEX idx_tally_stock_items_company ON public.tally_stock_items(company_name);
CREATE INDEX idx_tally_stock_items_date ON public.tally_stock_items(as_of_date DESC);

ALTER TABLE public.tally_stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tally_stock_items" ON public.tally_stock_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tally_stock_items" ON public.tally_stock_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tally_stock_items" ON public.tally_stock_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Table 4: tally_sync_log
CREATE TABLE public.tally_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text,
  sync_type text,
  status text NOT NULL DEFAULT 'running',
  chunk_label text,
  records_fetched integer DEFAULT 0,
  last_successful_chunk text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX idx_tally_sync_log_started ON public.tally_sync_log(started_at DESC);
CREATE INDEX idx_tally_sync_log_company_status ON public.tally_sync_log(company_name, status);

ALTER TABLE public.tally_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tally_sync_log" ON public.tally_sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tally_sync_log" ON public.tally_sync_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tally_sync_log" ON public.tally_sync_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Table 5: tally_companies
CREATE TABLE public.tally_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL UNIQUE,
  tally_url text NOT NULL DEFAULT 'http://103.239.89.153:9000',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tally_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tally_companies" ON public.tally_companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tally_companies" ON public.tally_companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tally_companies" ON public.tally_companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete tally_companies" ON public.tally_companies FOR DELETE TO authenticated USING (true);