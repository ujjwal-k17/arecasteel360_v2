CREATE TABLE IF NOT EXISTS public.tally_sync_control (
  sync_type text PRIMARY KEY,
  is_paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tally_sync_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tally sync control"
ON public.tally_sync_control
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can create tally sync control"
ON public.tally_sync_control
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update tally sync control"
ON public.tally_sync_control
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_tally_sync_control_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_tally_sync_control_updated_at ON public.tally_sync_control;
CREATE TRIGGER update_tally_sync_control_updated_at
BEFORE UPDATE ON public.tally_sync_control
FOR EACH ROW
EXECUTE FUNCTION public.update_tally_sync_control_updated_at();

INSERT INTO public.tally_sync_control (sync_type, is_paused)
VALUES ('historical', false)
ON CONFLICT (sync_type) DO NOTHING;