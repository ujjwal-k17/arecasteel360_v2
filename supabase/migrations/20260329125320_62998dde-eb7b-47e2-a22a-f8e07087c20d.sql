
-- Create storage bucket for database backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('db-backups', 'db-backups', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: only service role can access backups
CREATE POLICY "Service role full access on db-backups"
ON storage.objects
FOR ALL
USING (bucket_id = 'db-backups')
WITH CHECK (bucket_id = 'db-backups');

-- Enable pg_cron and pg_net for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
