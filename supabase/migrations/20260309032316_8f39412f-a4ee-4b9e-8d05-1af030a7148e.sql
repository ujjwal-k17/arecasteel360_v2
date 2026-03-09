
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Allow all access to inventory_actions" ON public.inventory_actions;

-- Create a permissive policy instead
CREATE POLICY "Allow all access to inventory_actions" ON public.inventory_actions
FOR ALL
TO public
USING (true)
WITH CHECK (true);
