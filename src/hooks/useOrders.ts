import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ---------- Customers ----------
export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('customer_name');
      if (error) throw error;
      return data;
    },
  });
}

export function useInsertCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customer: {
      customer_name: string;
      reference?: string;
      credit_terms?: string;
      customer_address?: string;
      customer_type: string;
      gst_number?: string;
    }) => {
      const { data, error } = await supabase.from('customers').insert(customer).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

// ---------- Orders ----------
export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(customer_name), order_items(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useInsertOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      order: { order_number: string; customer_id: string; comments?: string; order_date?: string };
      items: Array<{
        material?: string;
        form?: string;
        thickness?: number;
        width?: number;
        length?: number;
        coating?: string;
        grade?: string;
        net_weight?: number;
        comments?: string;
      }>;
    }) => {
      const { data: order, error: oErr } = await supabase
        .from('orders')
        .insert(payload.order)
        .select()
        .single();
      if (oErr) throw oErr;

      if (payload.items.length > 0) {
        const items = payload.items.map(i => ({ ...i, order_id: order.id }));
        const { error: iErr } = await supabase.from('order_items').insert(items);
        if (iErr) throw iErr;
      }
      return order;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      orderId: string;
      order: { order_number?: string; customer_id?: string; comments?: string; order_date?: string };
      items: Array<{
        id?: string;
        material?: string;
        form?: string;
        thickness?: number;
        width?: number;
        length?: number;
        coating?: string;
        grade?: string;
        net_weight?: number;
        comments?: string;
      }>;
    }) => {
      // Update order header
      const { error: oErr } = await supabase
        .from('orders')
        .update(payload.order)
        .eq('id', payload.orderId);
      if (oErr) throw oErr;

      // Delete existing items and re-insert
      const { error: dErr } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', payload.orderId);
      if (dErr) throw dErr;

      if (payload.items.length > 0) {
        const items = payload.items.map(i => {
          const { id: _id, ...rest } = i;
          return { ...rest, order_id: payload.orderId };
        });
        const { error: iErr } = await supabase.from('order_items').insert(items);
        if (iErr) throw iErr;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

// ---------- Dispatches ----------
interface DispatchRow {
  id: string;
  order_item_id: string;
  dispatch_qty: number;
  dispatch_date: string | null;
  invoice_number: string | null;
  created_at: string;
}

export function useOrderDispatches(orderItemIds: string[]) {
  return useQuery({
    queryKey: ['order_dispatches', orderItemIds],
    queryFn: async () => {
      if (orderItemIds.length === 0) return [] as DispatchRow[];
      const { data, error } = await supabase
        .from('order_dispatches' as any)
        .select('*')
        .in('order_item_id', orderItemIds);
      if (error) throw error;
      return (data || []) as unknown as DispatchRow[];
    },
    enabled: orderItemIds.length > 0,
  });
}

export function useAllDispatches() {
  return useQuery({
    queryKey: ['all_order_dispatches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_dispatches' as any)
        .select('*');
      if (error) throw error;
      return (data || []) as DispatchRow[];
    },
  });
}

export function useInsertDispatches() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dispatches: Array<{
      order_item_id: string;
      dispatch_qty: number;
      dispatch_date?: string;
      invoice_number?: string;
    }>) => {
      const { error } = await supabase.from('order_dispatches' as any).insert(dispatches as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all_order_dispatches'] });
      qc.invalidateQueries({ queryKey: ['order_dispatches'] });
    },
  });
}
