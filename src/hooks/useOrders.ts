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
      order: { order_number: string; customer_id: string; comments?: string };
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
