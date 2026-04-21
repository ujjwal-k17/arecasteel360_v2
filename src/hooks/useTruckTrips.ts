import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

export type TruckTrip = Tables<'truck_trips'>;
export type TruckTripExpense = Tables<'truck_trip_expenses'>;

export function useTruckTrips() {
  return useQuery({
    queryKey: ['truck_trips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('truck_trips')
        .select('*')
        .order('trip_date', { ascending: false });
      if (error) throw error;
      return data as TruckTrip[];
    },
  });
}

export function useTruckExpenses() {
  return useQuery({
    queryKey: ['truck_trip_expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('truck_trip_expenses')
        .select('*')
        .order('expense_date', { ascending: false });
      if (error) throw error;
      return data as TruckTripExpense[];
    },
  });
}

export function useInsertTruckTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (trip: Partial<TruckTrip>) => {
      // Generate unique trip ID for the day per truck
      const dateObj = new Date(trip.trip_date as string);
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const yy = String(dateObj.getFullYear()).slice(-2);
      const datePrefix = `${dd}${mm}${yy}`;

      // Count existing trips for this truck on this date
      const { data: existing, error: countErr } = await supabase
        .from('truck_trips')
        .select('trip_id')
        .eq('truck_number', trip.truck_number as string)
        .eq('trip_date', trip.trip_date as string);
      if (countErr) throw countErr;
      const next = String((existing?.length || 0) + 1).padStart(2, '0');
      const trip_id = `${datePrefix}/${next}`;

      const { data, error } = await supabase.from('truck_trips').insert({ ...trip, trip_id } as any).select().single();
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
    mutationFn: async (payload: {
      expense: Partial<TruckTripExpense>;
      trip_label: string; // "Trip ID / Doc number" for cash entry comments
    }) => {
      const { expense, trip_label } = payload;
      const { data, error } = await supabase.from('truck_trip_expenses').insert(expense as any).select().single();
      if (error) throw error;
      const exp = data as TruckTripExpense;

      // Auto-create Cash Out entries for each non-zero expense line
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
        const { error: cashErr } = await supabase.from('cash_entries').insert(cashRows as any);
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
