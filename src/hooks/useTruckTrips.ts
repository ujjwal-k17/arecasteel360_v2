import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TruckTrip {
  id: string;
  truck_number: string;
  trip_id: string;
  trip_type: 'Purchase' | 'Sales' | 'Job Work Out' | 'Job Work Return';
  trip_date: string;
  document_number: string | null;
  source_destination: string | null;
  quantity: number | null;
  created_at: string;
  updated_at: string;
}

export interface TruckTripExpense {
  id: string;
  truck_trip_id: string | null;
  source_kind: 'manual_trip' | 'purchase' | 'dispatch';
  source_ref: string | null;
  truck_number: string;
  expense_date: string;
  driver_expense: number | null;
  cng_amount: number | null;
  toll_parking: number | null;
  truck_expense: number | null;
  truck_expense_desc: string | null;
  other_expense: number | null;
  other_expense_desc: string | null;
  total_amount: number | null;
  created_at: string;
}

const sb = supabase as any;

export function useTruckTrips() {
  return useQuery({
    queryKey: ['truck_trips'],
    queryFn: async () => {
      const { data, error } = await sb.from('truck_trips').select('*').order('trip_date', { ascending: false });
      if (error) throw error;
      return (data || []) as TruckTrip[];
    },
  });
}

export function useTruckExpenses() {
  return useQuery({
    queryKey: ['truck_trip_expenses'],
    queryFn: async () => {
      const { data, error } = await sb.from('truck_trip_expenses').select('*').order('expense_date', { ascending: false });
      if (error) throw error;
      return (data || []) as TruckTripExpense[];
    },
  });
}

export function useInsertTruckTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (trip: Partial<TruckTrip>) => {
      const dateObj = new Date(trip.trip_date as string);
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const yy = String(dateObj.getFullYear()).slice(-2);
      const datePrefix = `${dd}${mm}${yy}`;

      const { data: existing, error: countErr } = await sb
        .from('truck_trips')
        .select('trip_id')
        .eq('truck_number', trip.truck_number as string)
        .eq('trip_date', trip.trip_date as string);
      if (countErr) throw countErr;
      const next = String(((existing as any[])?.length || 0) + 1).padStart(2, '0');
      const trip_id = `${datePrefix}/${next}`;

      const { data, error } = await sb.from('truck_trips').insert({ ...trip, trip_id }).select().single();
      if (error) throw error;
      return data as TruckTrip;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['truck_trips'] }),
    onError: (e: any) => toast.error(e.message || 'Failed to add trip'),
  });
}

export function useInsertTruckExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { expense: Partial<TruckTripExpense>; trip_label: string }) => {
      const { expense, trip_label } = payload;
      const { data, error } = await sb.from('truck_trip_expenses').insert(expense).select().single();
      if (error) throw error;
      const exp = data as TruckTripExpense;

      const lines: Array<{ subCat: string; amount: number; desc?: string | null }> = [
        { subCat: 'Driver', amount: exp.driver_expense || 0 },
        { subCat: 'CNG', amount: exp.cng_amount || 0 },
        { subCat: 'Toll / Parking', amount: exp.toll_parking || 0 },
        { subCat: 'Truck Maintenance', amount: exp.truck_expense || 0, desc: exp.truck_expense_desc },
        { subCat: 'Other', amount: exp.other_expense || 0, desc: exp.other_expense_desc },
      ].filter(l => l.amount > 0);

      if (lines.length > 0) {
        const cashRows = lines.map(l => ({
          direction: 'out',
          status: 'received',
          entry_date: exp.expense_date,
          amount: l.amount,
          category: 'Truck Expense',
          sub_category: l.subCat,
          comments: `${exp.truck_number} · ${trip_label}${l.desc ? ` · ${l.desc}` : ''}`,
          source_type: 'truck_expense',
          source_id: exp.id,
        }));
        const { error: cashErr } = await sb.from('cash_entries').insert(cashRows);
        if (cashErr) throw cashErr;
      }
      return exp;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['truck_trip_expenses'] });
      qc.invalidateQueries({ queryKey: ['cash_entries'] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to record expense'),
  });
}
