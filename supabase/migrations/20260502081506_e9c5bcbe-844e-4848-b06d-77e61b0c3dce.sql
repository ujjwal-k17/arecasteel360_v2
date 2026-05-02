-- Allow deletes for this migration on the two read-only tables, then restrict again
CREATE POLICY "tmp_delete_vouchers" ON public.tally_vouchers FOR DELETE TO authenticated USING (true);
CREATE POLICY "tmp_delete_ledger" ON public.tally_ledger_balances FOR DELETE TO authenticated USING (true);
CREATE POLICY "tmp_delete_stock" ON public.tally_stock_items FOR DELETE TO authenticated USING (true);
CREATE POLICY "tmp_delete_synclog" ON public.tally_sync_log FOR DELETE TO authenticated USING (true);

DELETE FROM public.tally_vouchers WHERE company_name IN ('Areca Indocorp LLP (Gzb.) FY-2022-23','Areca Indocorp LLP (Delhi) - FY-2022-23');
DELETE FROM public.tally_ledger_balances WHERE company_name IN ('Areca Indocorp LLP (Gzb.) FY-2022-23','Areca Indocorp LLP (Delhi) - FY-2022-23');
DELETE FROM public.tally_stock_items WHERE company_name IN ('Areca Indocorp LLP (Gzb.) FY-2022-23','Areca Indocorp LLP (Delhi) - FY-2022-23');
DELETE FROM public.debtor_master WHERE company_name IN ('Areca Indocorp LLP (Gzb.) FY-2022-23','Areca Indocorp LLP (Delhi) - FY-2022-23');
DELETE FROM public.invoice_credit_periods WHERE company_name IN ('Areca Indocorp LLP (Gzb.) FY-2022-23','Areca Indocorp LLP (Delhi) - FY-2022-23');
DELETE FROM public.tally_sync_log WHERE company_name IN ('Areca Indocorp LLP (Gzb.) FY-2022-23','Areca Indocorp LLP (Delhi) - FY-2022-23');
DELETE FROM public.tally_companies WHERE company_name IN ('Areca Indocorp LLP (Gzb.) FY-2022-23','Areca Indocorp LLP (Delhi) - FY-2022-23');

DROP POLICY "tmp_delete_vouchers" ON public.tally_vouchers;
DROP POLICY "tmp_delete_ledger" ON public.tally_ledger_balances;
DROP POLICY "tmp_delete_stock" ON public.tally_stock_items;
DROP POLICY "tmp_delete_synclog" ON public.tally_sync_log;