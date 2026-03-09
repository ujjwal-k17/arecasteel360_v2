-- Fix ALL tables to use PERMISSIVE policies instead of RESTRICTIVE

DROP POLICY IF EXISTS "Allow all access to batches" ON public.batches;
CREATE POLICY "Allow all access to batches" ON public.batches FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to defective_sales" ON public.defective_sales;
CREATE POLICY "Allow all access to defective_sales" ON public.defective_sales FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to fg_defectives" ON public.fg_defectives;
CREATE POLICY "Allow all access to fg_defectives" ON public.fg_defectives FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to fg_items" ON public.fg_items;
CREATE POLICY "Allow all access to fg_items" ON public.fg_items FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to fg_sales" ON public.fg_sales;
CREATE POLICY "Allow all access to fg_sales" ON public.fg_sales FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to processing_output_items" ON public.processing_output_items;
CREATE POLICY "Allow all access to processing_output_items" ON public.processing_output_items FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to processing_records" ON public.processing_records;
CREATE POLICY "Allow all access to processing_records" ON public.processing_records FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to scrap_sales" ON public.scrap_sales;
CREATE POLICY "Allow all access to scrap_sales" ON public.scrap_sales FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to wip_items" ON public.wip_items;
CREATE POLICY "Allow all access to wip_items" ON public.wip_items FOR ALL TO public USING (true) WITH CHECK (true);