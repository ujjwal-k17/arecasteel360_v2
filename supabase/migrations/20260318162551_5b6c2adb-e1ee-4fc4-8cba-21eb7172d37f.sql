
-- Action logs table
CREATE TABLE public.action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_undone boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all logs" ON public.action_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own logs" ON public.action_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update logs" ON public.action_logs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Pending approvals table
CREATE TABLE public.pending_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL,
  requested_by_email text,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do all on pending_approvals" ON public.pending_approvals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own approvals" ON public.pending_approvals
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Users can read own approvals" ON public.pending_approvals
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
