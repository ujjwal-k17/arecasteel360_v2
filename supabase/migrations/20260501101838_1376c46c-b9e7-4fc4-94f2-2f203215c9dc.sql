DROP POLICY IF EXISTS "Authenticated can create tally sync control" ON public.tally_sync_control;
DROP POLICY IF EXISTS "Authenticated can update tally sync control" ON public.tally_sync_control;

CREATE POLICY "Signed in users can create tally sync control"
ON public.tally_sync_control
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Signed in users can update tally sync control"
ON public.tally_sync_control
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);