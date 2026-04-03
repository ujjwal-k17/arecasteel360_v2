
CREATE TABLE public.wip_defectives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wip_item_id UUID NOT NULL REFERENCES public.wip_items(id),
  defect_type TEXT NOT NULL,
  quantity NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.wip_defectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to wip_defectives" ON public.wip_defectives FOR ALL USING (true) WITH CHECK (true);
