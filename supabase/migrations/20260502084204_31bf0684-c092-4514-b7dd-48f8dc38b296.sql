CREATE POLICY "Authenticated can delete tally_sync_log"
  ON public.tally_sync_log
  FOR DELETE
  TO authenticated
  USING (true);