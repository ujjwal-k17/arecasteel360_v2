-- Clean up duplicate processing record and related data for batch 4262AC200G
DELETE FROM pallet_consumptions WHERE processing_record_id = '3bd228c1-6ba8-4206-b3d7-34033e0aa403';
DELETE FROM fg_items WHERE processing_record_id = '3bd228c1-6ba8-4206-b3d7-34033e0aa403';
DELETE FROM processing_output_items WHERE processing_record_id = '3bd228c1-6ba8-4206-b3d7-34033e0aa403';
DELETE FROM processing_records WHERE id = '3bd228c1-6ba8-4206-b3d7-34033e0aa403';