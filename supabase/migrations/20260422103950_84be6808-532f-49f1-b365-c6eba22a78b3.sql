
-- inventory_actions
CREATE INDEX IF NOT EXISTS idx_inventory_actions_batch_id ON public.inventory_actions(batch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_actions_order_id ON public.inventory_actions(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_actions_action_type ON public.inventory_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_inventory_actions_invoice_number ON public.inventory_actions(invoice_number);

-- fg_items
CREATE INDEX IF NOT EXISTS idx_fg_items_order_id ON public.fg_items(order_id);
CREATE INDEX IF NOT EXISTS idx_fg_items_processing_record_id ON public.fg_items(processing_record_id);
CREATE INDEX IF NOT EXISTS idx_fg_items_sku_id ON public.fg_items(sku_id);

-- fg_sales
CREATE INDEX IF NOT EXISTS idx_fg_sales_fg_item_id ON public.fg_sales(fg_item_id);
CREATE INDEX IF NOT EXISTS idx_fg_sales_order_id ON public.fg_sales(order_id);
CREATE INDEX IF NOT EXISTS idx_fg_sales_invoice_number ON public.fg_sales(invoice_number);

-- fg_defectives
CREATE INDEX IF NOT EXISTS idx_fg_defectives_fg_item_id ON public.fg_defectives(fg_item_id);

-- wip_items
CREATE INDEX IF NOT EXISTS idx_wip_items_source_batch_id ON public.wip_items(source_batch_id);
CREATE INDEX IF NOT EXISTS idx_wip_items_processing_record_id ON public.wip_items(processing_record_id);
CREATE INDEX IF NOT EXISTS idx_wip_items_order_id ON public.wip_items(order_id);
CREATE INDEX IF NOT EXISTS idx_wip_items_status ON public.wip_items(status);

-- wip_defectives
CREATE INDEX IF NOT EXISTS idx_wip_defectives_wip_item_id ON public.wip_defectives(wip_item_id);

-- order_items / order_dispatches / orders
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku_id ON public.order_items(sku_id);
CREATE INDEX IF NOT EXISTS idx_order_dispatches_order_item_id ON public.order_dispatches(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_dispatches_invoice_number ON public.order_dispatches(invoice_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- processing
CREATE INDEX IF NOT EXISTS idx_processing_records_batch_id ON public.processing_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_processing_records_order_id ON public.processing_records(order_id);
CREATE INDEX IF NOT EXISTS idx_processing_output_items_processing_record_id ON public.processing_output_items(processing_record_id);

-- invoice_details / freight
CREATE INDEX IF NOT EXISTS idx_invoice_details_invoice_number ON public.invoice_details(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_details_dispatch_type ON public.invoice_details(dispatch_type);
CREATE INDEX IF NOT EXISTS idx_transporter_freight_transporter_id ON public.transporter_freight(transporter_id);
CREATE INDEX IF NOT EXISTS idx_transporter_freight_invoice_number ON public.transporter_freight(invoice_number);
CREATE INDEX IF NOT EXISTS idx_tpt_freight_comments_tf_id ON public.transporter_freight_comments(transporter_freight_id);
CREATE INDEX IF NOT EXISTS idx_tpt_freight_payments_tf_id ON public.transporter_freight_payments(transporter_freight_id);

-- defective_sales
CREATE INDEX IF NOT EXISTS idx_defective_sales_batch_id ON public.defective_sales(batch_id);
CREATE INDEX IF NOT EXISTS idx_defective_sales_order_id ON public.defective_sales(order_id);

-- pallet consumptions/purchases
CREATE INDEX IF NOT EXISTS idx_pallet_consumptions_pallet_sku_id ON public.pallet_consumptions(pallet_sku_id);
CREATE INDEX IF NOT EXISTS idx_pallet_consumptions_order_id ON public.pallet_consumptions(order_id);
CREATE INDEX IF NOT EXISTS idx_pallet_purchases_pallet_sku_id ON public.pallet_purchases(pallet_sku_id);
CREATE INDEX IF NOT EXISTS idx_steel_pallet_consumptions_sku_id ON public.steel_pallet_consumptions(pallet_sku_id);
CREATE INDEX IF NOT EXISTS idx_steel_pallet_purchases_sku_id ON public.steel_pallet_purchases(pallet_sku_id);

-- inward_payments
CREATE INDEX IF NOT EXISTS idx_inward_payments_customer_id ON public.inward_payments(customer_id);

-- batches
CREATE INDEX IF NOT EXISTS idx_batches_status ON public.batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_purchase_date ON public.batches(purchase_date);

-- action_logs
CREATE INDEX IF NOT EXISTS idx_action_logs_user_id ON public.action_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_entity ON public.action_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON public.action_logs(created_at DESC);

-- ANALYZE to refresh planner stats
ANALYZE public.inventory_actions;
ANALYZE public.fg_items;
ANALYZE public.fg_sales;
ANALYZE public.fg_defectives;
ANALYZE public.wip_items;
ANALYZE public.wip_defectives;
ANALYZE public.order_items;
ANALYZE public.order_dispatches;
ANALYZE public.orders;
ANALYZE public.processing_records;
ANALYZE public.processing_output_items;
ANALYZE public.invoice_details;
ANALYZE public.transporter_freight;
ANALYZE public.defective_sales;
ANALYZE public.pallet_consumptions;
ANALYZE public.batches;
