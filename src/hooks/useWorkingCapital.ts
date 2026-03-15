import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useInvoiceDetails() {
  return useQuery({
    queryKey: ['invoice_details'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_details')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertInvoiceDetail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { invoice_number: string; invoice_amount: number; credit_period: number }) => {
      // Check if exists
      const { data: existing } = await supabase
        .from('invoice_details')
        .select('id')
        .eq('invoice_number', row.invoice_number)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('invoice_details')
          .update({ invoice_amount: row.invoice_amount, credit_period: row.credit_period })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('invoice_details')
          .insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice_details'] });
      toast.success('Invoice details saved');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useInwardPayments() {
  return useQuery({
    queryKey: ['inward_payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inward_payments')
        .select('*, customers(customer_name)')
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useInsertInwardPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { customer_id: string; amount: number; payment_date: string }) => {
      const { error } = await supabase.from('inward_payments').insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inward_payments'] });
      toast.success('Payment recorded');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
