import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeCoating } from '@/lib/utils';
import { upsertSku } from '@/lib/sku-utils';

function normalizeItemCoating<T extends { coating?: string | null }>(items: T[]): T[] {
  return items.map(i => ({ ...i, coating: normalizeCoating(i.coating) || i.coating }));
}

export function useAllProcessingRecords() {
  return useQuery({
    queryKey: ['processing_records', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processing_records' as any)
        .select('*, processing_output_items(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useWIPItems() {
  return useQuery({
    queryKey: ['wip_items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wip_items' as any)
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return normalizeItemCoating(data as any[]);
    },
  });
}

export function useFGItems() {
  return useQuery({
    queryKey: ['fg_items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fg_items' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useInsertProcessing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      batchId: string;
      processType: string;
      outputType: string;
      inputQty: number;
      orderId: string;
      outputItems: { width?: number; length?: number; qty_kg: number; num_pcs?: number }[];
      batch: any;
    }) => {
      const { data: procRec, error: procErr } = await supabase
        .from('processing_records' as any)
        .insert({
          batch_id: params.batchId,
          process_type: params.processType,
          output_type: params.outputType,
          input_qty: params.inputQty,
          order_id: params.orderId || null,
        })
        .select()
        .single();
      if (procErr) throw procErr;

      if (params.outputItems.length > 0) {
        const items = params.outputItems.map(item => ({
          processing_record_id: (procRec as any).id,
          width: item.width ?? null,
          length: item.length ?? null,
          qty_kg: item.qty_kg,
          num_pcs: item.num_pcs ?? null,
        }));
        const { error: outErr } = await supabase.from('processing_output_items' as any).insert(items);
        if (outErr) throw outErr;
      }

      const batch = params.batch;
      const targetTable = params.outputType === 'WIP' ? 'wip_items' : 'fg_items';

      if (params.outputItems.length > 0) {
        const inventoryItems = await Promise.all(params.outputItems.map(async (item) => {
          const base: any = {
            processing_record_id: (procRec as any).id,
            material: batch.material,
            make: batch.make,
            process: params.processType === 'Slit' ? 'Slit Coil' : params.processType,
            width: item.width ?? batch.width,
            length: item.length ?? null,
            thickness: batch.thickness,
            coating: batch.coating,
            grade: batch.grade,
            qty: item.qty_kg,
            num_pcs: item.num_pcs ?? null,
            order_id: params.orderId || null,
          };
          if (targetTable === 'wip_items') {
            base.source_batch_id = params.batchId;
            base.status = 'active';
          } else {
            base.source_id = params.batchId;
            base.source_type = 'coil';
            base.sku_id = await upsertSku({ material: batch.material, thickness: batch.thickness, width: item.width ?? batch.width, length: item.length ?? null, coating: batch.coating, grade: batch.grade });
          }
          return base;
        }));
        const { error: invErr } = await supabase.from(targetTable as any).insert(inventoryItems);
        if (invErr) throw invErr;
      } else {
        const item: any = {
          processing_record_id: (procRec as any).id,
          material: batch.material,
          make: batch.make,
          process: params.processType,
          width: batch.width,
          thickness: batch.thickness,
          coating: batch.coating,
          grade: batch.grade,
          qty: params.inputQty,
          order_id: params.orderId || null,
        };
        if (targetTable === 'wip_items') {
          item.source_batch_id = params.batchId;
          item.status = 'active';
        } else {
          item.source_id = params.batchId;
          item.source_type = 'coil';
        }
        const { error: singleErr } = await supabase.from(targetTable as any).insert([item]);
        if (singleErr) throw singleErr;
      }

      await supabase.from('batches').update({ batch_status: 'loose' } as any).eq('id', params.batchId);

      return procRec;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processing_records'] });
      qc.invalidateQueries({ queryKey: ['wip_items'] });
      qc.invalidateQueries({ queryKey: ['fg_items'] });
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
  });
}

export function usePackCoilSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { batchId: string; usableQty: number; orderId?: string; invoiceNumber?: string; salesDate?: string }) => {
      console.log('Pack Coil Sale params:', JSON.stringify(params));
      const insertPayload = {
        batch_id: params.batchId,
        action_type: 'pack_coil_sale',
        net_weight: params.usableQty,
        gross_weight: null,
        order_id: params.orderId || null,
        sales_date: params.salesDate || new Date().toISOString().slice(0, 10),
        invoice_number: params.invoiceNumber || null,
        defect_type: null,
        scrap_type: null,
      };
      console.log('Insert payload:', JSON.stringify(insertPayload));
      const { error: insertError } = await supabase.from('inventory_actions').insert(insertPayload as any);
      console.log('Insert result error:', insertError);
      if (insertError) throw insertError;
      const { error: updateError } = await supabase.from('batches').update({ batch_status: 'sold' } as any).eq('id', params.batchId);
      console.log('Update result error:', updateError);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['inventory_actions'] });
    },
  });
}

export function useWIPProcessing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      wipItemId: string;
      wipItem: any;
      outputItems: { length: number; qty_kg: number; num_pcs: number }[];
      defectives?: { type: string; weight: number }[];
      orderId?: string;
    }) => {
      const defectiveTotal = (params.defectives || []).reduce((s, d) => s + d.weight, 0);
      const totalQty = params.outputItems.reduce((s, i) => s + i.qty_kg, 0) + defectiveTotal;
      const { data: procRec, error: procErr } = await supabase
        .from('processing_records' as any)
        .insert({
          batch_id: params.wipItem.source_batch_id,
          process_type: 'CTL',
          output_type: 'FG',
          input_qty: totalQty,
          order_id: params.orderId || null,
          source_type: 'wip',
        })
        .select()
        .single();
      if (procErr) throw procErr;

      if (params.outputItems.length > 0) {
        const items = params.outputItems.map(item => ({
          processing_record_id: (procRec as any).id,
          width: params.wipItem.width,
          length: item.length,
          qty_kg: item.qty_kg,
          num_pcs: item.num_pcs,
        }));
        await supabase.from('processing_output_items' as any).insert(items);
      }

      const fgItems = await Promise.all(params.outputItems.map(async (item) => {
        const sku_id = await upsertSku({ material: params.wipItem.material, thickness: params.wipItem.thickness, width: params.wipItem.width, length: item.length, coating: params.wipItem.coating, grade: params.wipItem.grade });
        return {
          source_id: params.wipItemId,
          source_type: 'wip',
          processing_record_id: (procRec as any).id,
          material: params.wipItem.material,
          make: params.wipItem.make,
          process: 'CTL',
          width: params.wipItem.width,
          thickness: params.wipItem.thickness ?? null,
          length: item.length,
          coating: params.wipItem.coating,
          grade: params.wipItem.grade,
          qty: item.qty_kg,
          num_pcs: item.num_pcs,
          order_id: params.orderId || null,
          sku_id,
        };
      }));
      if (fgItems.length > 0) {
        await supabase.from('fg_items' as any).insert(fgItems);
      }

      // Defectives from WIP processing are tracked via the WIP item qty reduction
      // and the processing record's input_qty. No need to insert against original coil batch
      // as that would cause double counting in balance calculations.

      // Calculate remaining qty
      const totalUsed = params.outputItems.reduce((s, i) => s + i.qty_kg, 0) + defectiveTotal;
      const remainingQty = (params.wipItem.qty || 0) - totalUsed;

      if (remainingQty > 0.01) {
        // Partial processing: reduce qty, keep active
        await supabase.from('wip_items' as any).update({ qty: Math.round(remainingQty * 100) / 100 }).eq('id', params.wipItemId);
      } else {
        // Fully processed
        await supabase.from('wip_items' as any).update({ status: 'processed' }).eq('id', params.wipItemId);
      }

      return procRec;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processing_records'] });
      qc.invalidateQueries({ queryKey: ['wip_items'] });
      qc.invalidateQueries({ queryKey: ['fg_items'] });
      qc.invalidateQueries({ queryKey: ['inventory_actions'] });
    },
  });
}
