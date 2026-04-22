-- 1. Restrict permissive "Allow all access" policies to authenticated users only
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'Allow all access to %'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      'Authenticated full access to ' || r.tablename,
      r.schemaname,
      r.tablename
    );
  END LOOP;
END $$;

-- 2. Add admin guard to cascade_dropdown_rename
CREATE OR REPLACE FUNCTION public.cascade_dropdown_rename(p_category text, p_old_value text, p_new_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  IF p_category = 'material' THEN
    UPDATE batches SET material = p_new_value WHERE material = p_old_value;
    UPDATE wip_items SET material = p_new_value WHERE material = p_old_value;
    UPDATE fg_items SET material = p_new_value WHERE material = p_old_value;
    UPDATE order_items SET material = p_new_value WHERE material = p_old_value;
    UPDATE skus SET material = p_new_value WHERE material = p_old_value;
    UPDATE scrap_sales SET material = p_new_value WHERE material = p_old_value;
  ELSIF p_category = 'make' THEN
    UPDATE batches SET make = p_new_value WHERE make = p_old_value;
    UPDATE wip_items SET make = p_new_value WHERE make = p_old_value;
    UPDATE fg_items SET make = p_new_value WHERE make = p_old_value;
  ELSIF p_category = 'grade' THEN
    UPDATE batches SET grade = p_new_value WHERE grade = p_old_value;
    UPDATE wip_items SET grade = p_new_value WHERE grade = p_old_value;
    UPDATE fg_items SET grade = p_new_value WHERE grade = p_old_value;
    UPDATE order_items SET grade = p_new_value WHERE grade = p_old_value;
    UPDATE skus SET grade = p_new_value WHERE grade = p_old_value;
  ELSIF p_category = 'coating' THEN
    UPDATE batches SET coating = p_new_value WHERE coating = p_old_value;
    UPDATE wip_items SET coating = p_new_value WHERE coating = p_old_value;
    UPDATE fg_items SET coating = p_new_value WHERE coating = p_old_value;
    UPDATE order_items SET coating = p_new_value WHERE coating = p_old_value;
    UPDATE skus SET coating = p_new_value WHERE coating = p_old_value;
  ELSIF p_category = 'form' THEN
    UPDATE batches SET form = p_new_value WHERE form = p_old_value;
    UPDATE order_items SET form = p_new_value WHERE form = p_old_value;
  END IF;

  IF p_category = 'material' THEN
    UPDATE dropdown_options SET parent_value = p_new_value WHERE parent_value = p_old_value;
  END IF;
END;
$function$;

-- 3. Lock down weight-slips bucket
UPDATE storage.buckets SET public = false WHERE id = 'weight-slips';

DROP POLICY IF EXISTS "Anyone can upload weight slips" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view weight slips" ON storage.objects;

CREATE POLICY "Authenticated users can upload weight slips"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'weight-slips');

CREATE POLICY "Authenticated users can view weight slips"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'weight-slips');

CREATE POLICY "Authenticated users can update weight slips"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'weight-slips');

CREATE POLICY "Authenticated users can delete weight slips"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'weight-slips');