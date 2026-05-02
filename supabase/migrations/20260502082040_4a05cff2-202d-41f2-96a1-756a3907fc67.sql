-- Groups master
CREATE TABLE IF NOT EXISTS public.tally_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  group_name text NOT NULL,
  parent_group text,
  ultimate_parent text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_name, group_name)
);

CREATE INDEX IF NOT EXISTS idx_tally_groups_company ON public.tally_groups(company_name);
CREATE INDEX IF NOT EXISTS idx_tally_groups_ultimate ON public.tally_groups(company_name, ultimate_parent);

ALTER TABLE public.tally_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tally_groups"
  ON public.tally_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tally_groups"
  ON public.tally_groups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tally_groups"
  ON public.tally_groups FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Add ultimate_group to ledger balances
ALTER TABLE public.tally_ledger_balances
  ADD COLUMN IF NOT EXISTS ultimate_group text;

CREATE INDEX IF NOT EXISTS idx_tally_ledger_balances_ultimate
  ON public.tally_ledger_balances(company_name, ultimate_group);
