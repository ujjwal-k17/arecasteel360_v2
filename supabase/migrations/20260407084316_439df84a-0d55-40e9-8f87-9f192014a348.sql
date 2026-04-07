ALTER TABLE public.batches ADD COLUMN from_intransit boolean NOT NULL DEFAULT false;
UPDATE public.batches SET from_intransit = true WHERE status = 'in-transit';