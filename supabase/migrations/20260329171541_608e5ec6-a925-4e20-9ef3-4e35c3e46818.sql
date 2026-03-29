
CREATE TABLE public.transporter_freight_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transporter_freight_id uuid REFERENCES public.transporter_freight(id) ON DELETE CASCADE NOT NULL,
  user_email text NOT NULL,
  comment text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.transporter_freight_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to transporter_freight_comments"
  ON public.transporter_freight_comments
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
