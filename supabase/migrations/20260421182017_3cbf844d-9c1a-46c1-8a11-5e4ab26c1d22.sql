
-- ============== CASH ENTRIES ==============
CREATE TABLE public.cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('receivable', 'received')),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  category text,
  sub_category text,
  comments text,
  debtor_name text,           -- for receivable
  buyer_name text,            -- copied from source (scrap cash sale)
  source_type text,           -- 'scrap_sale' | 'truck_expense' | 'manual'
  source_id uuid,             -- pointer to scrap_sales.id or truck_trip_expenses.id
  received_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cash_entries_direction_status ON public.cash_entries (direction, status);
CREATE INDEX idx_cash_entries_source ON public.cash_entries (source_type, source_id);
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to cash_entries" ON public.cash_entries FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_cash_entries_updated_at BEFORE UPDATE ON public.cash_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== TRUCK TRIPS ==============
CREATE TABLE public.truck_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_number text NOT NULL,            -- e.g. 'UP14KT0750'
  trip_id text NOT NULL,                 -- DDMMYY/XX
  trip_type text NOT NULL CHECK (trip_type IN ('Purchase', 'Sales', 'Job Work Out', 'Job Work Return')),
  trip_date date NOT NULL,
  document_number text,
  source_destination text,
  quantity numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (truck_number, trip_id)
);
CREATE INDEX idx_truck_trips_truck_date ON public.truck_trips (truck_number, trip_date);
ALTER TABLE public.truck_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to truck_trips" ON public.truck_trips FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_truck_trips_updated_at BEFORE UPDATE ON public.truck_trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== TRUCK TRIP EXPENSES ==============
CREATE TABLE public.truck_trip_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_trip_id uuid REFERENCES public.truck_trips(id) ON DELETE CASCADE,
  -- For trips that come from purchases/dispatches (no truck_trips row), allow free-form keys:
  source_kind text NOT NULL DEFAULT 'manual_trip' CHECK (source_kind IN ('manual_trip', 'purchase', 'dispatch')),
  source_ref text,                       -- e.g. invoice_number / batch_number for purchase/dispatch
  truck_number text NOT NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  driver_expense numeric DEFAULT 0,
  cng_amount numeric DEFAULT 0,
  toll_parking numeric DEFAULT 0,
  truck_expense numeric DEFAULT 0,
  truck_expense_desc text,
  other_expense numeric DEFAULT 0,
  other_expense_desc text,
  total_amount numeric GENERATED ALWAYS AS (
    COALESCE(driver_expense,0) + COALESCE(cng_amount,0) + COALESCE(toll_parking,0)
    + COALESCE(truck_expense,0) + COALESCE(other_expense,0)
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_truck_trip_expenses_trip ON public.truck_trip_expenses (truck_trip_id);
CREATE INDEX idx_truck_trip_expenses_source ON public.truck_trip_expenses (source_kind, source_ref);
ALTER TABLE public.truck_trip_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to truck_trip_expenses" ON public.truck_trip_expenses FOR ALL USING (true) WITH CHECK (true);

-- ============== SEED CASH BOOK DROPDOWN CATEGORIES ==============
INSERT INTO public.dropdown_options (category, value, parent_value, sort_order) VALUES
  ('cash_category', 'Scrap Sales', NULL, 10),
  ('cash_category', 'Truck Expense', NULL, 20),
  ('cash_category', 'Salary', NULL, 30),
  ('cash_category', 'Utilities', NULL, 40),
  ('cash_category', 'Office', NULL, 50),
  ('cash_category', 'Travel', NULL, 60),
  ('cash_category', 'Misc', NULL, 99),
  -- Sub-categories
  ('cash_subcategory', 'Driver', 'Truck Expense', 10),
  ('cash_subcategory', 'CNG', 'Truck Expense', 20),
  ('cash_subcategory', 'Toll / Parking', 'Truck Expense', 30),
  ('cash_subcategory', 'Truck Maintenance', 'Truck Expense', 40),
  ('cash_subcategory', 'Other', 'Truck Expense', 50),
  ('cash_subcategory', 'Cash Sale', 'Scrap Sales', 10),
  ('cash_subcategory', 'Electricity', 'Utilities', 10),
  ('cash_subcategory', 'Water', 'Utilities', 20),
  ('cash_subcategory', 'Internet', 'Utilities', 30),
  ('cash_subcategory', 'Stationery', 'Office', 10),
  ('cash_subcategory', 'Cleaning', 'Office', 20),
  ('cash_subcategory', 'Staff Salary', 'Salary', 10),
  ('cash_subcategory', 'Local', 'Travel', 10),
  ('cash_subcategory', 'Outstation', 'Travel', 20),
  ('cash_subcategory', 'Other', 'Misc', 99);
