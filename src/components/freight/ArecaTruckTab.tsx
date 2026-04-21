import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, IndianRupee, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useTruckTrips, useTruckExpenses, useInsertTruckTrip, useInsertTruckExpense } from '@/hooks/useTruckTrips';

export interface UnifiedTrip {
  key: string;
  source: 'manual' | 'purchase' | 'dispatch';
  trip_id: string | null;
  document_number: string;
  trip_date: string;
  source_destination: string;
  total_qty: number;
  trip_type: string;
  truck_number: string;
  source_ref?: string;
  manual_id?: string;
}

interface Props {
  truckNumber: string;          // e.g. UP14KT0750
  internalKey: 'Areca 0720' | 'Areca 2720'; // matches dispatch_type / purchase_type
  externalDispatches: UnifiedTrip[];
  externalPurchases: UnifiedTrip[];
  onMoveBack: (trip: UnifiedTrip) => void;
}

export function ArecaTruckTab({ truckNumber, internalKey, externalDispatches, externalPurchases, onMoveBack }: Props) {
  const { data: trips = [] } = useTruckTrips();
  const { data: expenses = [] } = useTruckExpenses();
  const insertTrip = useInsertTruckTrip();
  const insertExpense = useInsertTruckExpense();

  const [tripDialog, setTripDialog] = useState(false);
  const [tripForm, setTripForm] = useState({ trip_type: 'Sales', trip_date: new Date().toISOString().slice(0, 10), document_number: '', source_destination: '', quantity: '' });

  const [expDialog, setExpDialog] = useState<{ open: boolean; trip: UnifiedTrip | null }>({ open: false, trip: null });
  const [expForm, setExpForm] = useState({ expense_date: new Date().toISOString().slice(0, 10), driver_expense: '', cng_amount: '', toll_parking: '', truck_expense: '', truck_expense_desc: '', other_expense: '', other_expense_desc: '' });
  const [detailsDialog, setDetailsDialog] = useState<{ open: boolean; trip: UnifiedTrip | null }>({ open: false, trip: null });

  const manualTrips: UnifiedTrip[] = useMemo(() =>
    trips.filter(t => t.truck_number === truckNumber).map(t => ({
      key: `manual:${t.id}`,
      source: 'manual',
      trip_id: t.trip_id,
      document_number: t.document_number || '-',
      trip_date: t.trip_date,
      source_destination: t.source_destination || '-',
      total_qty: Number(t.quantity || 0),
      trip_type: t.trip_type,
      truck_number: t.truck_number,
      manual_id: t.id,
    })), [trips, truckNumber]);

  const truckSuffix = truckNumber.slice(-4); // last 4 chars of truck plate as ref

  const allTrips = useMemo(() => {
    const combined = [...manualTrips, ...externalDispatches, ...externalPurchases];
    // Sort ascending by date first to assign deterministic per-day counters
    const asc = [...combined].sort((a, b) => (a.trip_date || '').localeCompare(b.trip_date || ''));
    const counters: Record<string, number> = {};
    const withIds = asc.map(t => {
      const dateKey = t.trip_date || '';
      counters[dateKey] = (counters[dateKey] || 0) + 1;
      if (t.trip_id) return t; // manual trips already have trip_id
      const d = dateKey ? new Date(dateKey) : null;
      const datePrefix = d
        ? `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getFullYear()).slice(-2)}`
        : '------';
      const seq = String(counters[dateKey]).padStart(2, '0');
      return { ...t, trip_id: `${datePrefix}/${truckSuffix}/${seq}` };
    });
    return withIds.sort((a, b) => (b.trip_date || '').localeCompare(a.trip_date || ''));
  }, [manualTrips, externalDispatches, externalPurchases, truckSuffix]);

  const expensesByKey = useMemo(() => {
    const map: Record<string, typeof expenses> = {};
    expenses.forEach(e => {
      const key = e.truck_trip_id
        ? `manual:${e.truck_trip_id}`
        : (e.source_ref ? `${e.source_kind}:${e.source_ref}` : null);
      if (!key) return;
      if (!map[key]) map[key] = [] as any;
      (map[key] as any).push(e);
    });
    return map;
  }, [expenses]);

  const expenseByKey = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(expensesByKey).forEach(([k, list]) => {
      map[k] = (list as any[]).reduce((s, e) => s + Number(e.total_amount || 0), 0);
    });
    return map;
  }, [expensesByKey]);

  const handleAddTrip = async () => {
    if (!tripForm.document_number.trim()) { toast.error('Document number required'); return; }
    if (!tripForm.source_destination.trim()) { toast.error('Source/Destination required'); return; }
    await insertTrip.mutateAsync({
      truck_number: truckNumber,
      trip_type: tripForm.trip_type as any,
      trip_date: tripForm.trip_date,
      document_number: tripForm.document_number,
      source_destination: tripForm.source_destination,
      quantity: tripForm.quantity ? Number(tripForm.quantity) : 0,
    });
    toast.success('Trip added');
    setTripDialog(false);
    setTripForm({ trip_type: 'Sales', trip_date: new Date().toISOString().slice(0, 10), document_number: '', source_destination: '', quantity: '' });
  };

  const handleAddExpense = async () => {
    if (!expDialog.trip) return;
    const trip = expDialog.trip;
    const total = ['driver_expense','cng_amount','toll_parking','truck_expense','other_expense'].reduce((s, k) => s + (Number((expForm as any)[k]) || 0), 0);
    if (total <= 0) { toast.error('Enter at least one amount'); return; }
    await insertExpense.mutateAsync({
      expense: {
        truck_trip_id: trip.source === 'manual' ? trip.manual_id : null,
        source_kind: trip.source === 'manual' ? 'manual_trip' : trip.source,
        source_ref: trip.source !== 'manual' ? (trip.document_number || trip.source_ref || null) : null,
        truck_number: truckNumber,
        expense_date: expForm.expense_date,
        driver_expense: Number(expForm.driver_expense) || 0,
        cng_amount: Number(expForm.cng_amount) || 0,
        toll_parking: Number(expForm.toll_parking) || 0,
        truck_expense: Number(expForm.truck_expense) || 0,
        truck_expense_desc: expForm.truck_expense_desc || null,
        other_expense: Number(expForm.other_expense) || 0,
        other_expense_desc: expForm.other_expense_desc || null,
      } as any,
      trip_label: `${trip.trip_id || trip.document_number} · ${trip.trip_type}`,
    });
    toast.success('Expense recorded · Cash Out updated');
    setExpDialog({ open: false, trip: null });
    setExpForm({ expense_date: new Date().toISOString().slice(0, 10), driver_expense: '', cng_amount: '', toll_parking: '', truck_expense: '', truck_expense_desc: '', other_expense: '', other_expense_desc: '' });
  };

  const isPurchaseLike = tripForm.trip_type === 'Purchase' || tripForm.trip_type === 'Job Work Return';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{truckNumber}</span>
          <span className="text-muted-foreground">· {allTrips.length} trips</span>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setTripDialog(true)}><Plus className="h-4 w-4" /> Add Trip</Button>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow className="bg-muted/50">
            <TableHead className="text-xs font-semibold">Trip ID</TableHead>
            <TableHead className="text-xs font-semibold">Document #</TableHead>
            <TableHead className="text-xs font-semibold">Trip Date</TableHead>
            <TableHead className="text-xs font-semibold">Source / Destination</TableHead>
            <TableHead className="text-xs font-semibold">Total Qty (Kg)</TableHead>
            <TableHead className="text-xs font-semibold">Trip Type</TableHead>
            <TableHead className="text-xs font-semibold">Expenses</TableHead>
            <TableHead className="text-xs font-semibold">Action</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {allTrips.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No trips yet.</TableCell></TableRow>}
            {allTrips.map(t => {
              const exp = expenseByKey[t.key] || 0;
              return (
                <TableRow key={t.key}>
                  <TableCell className="text-xs font-mono">{t.trip_id || '-'}</TableCell>
                  <TableCell className="text-xs">{t.document_number}</TableCell>
                  <TableCell className="text-xs">{t.trip_date ? new Date(t.trip_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                  <TableCell className="text-xs">{t.source_destination}</TableCell>
                  <TableCell className="text-xs font-mono-num">{t.total_qty.toFixed(2)}</TableCell>
                  <TableCell className="text-xs">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted">{t.trip_type}</span>
                  </TableCell>
                  <TableCell className="text-xs font-mono-num">
                    {exp > 0 ? (
                      <button className="text-primary hover:underline" onClick={() => setDetailsDialog({ open: true, trip: t })}>
                        ₹{exp.toFixed(2)}
                      </button>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setExpDialog({ open: true, trip: t })}>
                        <IndianRupee className="h-3 w-3" /> Expense
                      </Button>
                      {t.source !== 'manual' && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => onMoveBack(t)}>
                          ← Move Back
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Add Trip Dialog */}
      <Dialog open={tripDialog} onOpenChange={setTripDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Trip — {truckNumber}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={tripForm.trip_type} onValueChange={v => setTripForm(f => ({ ...f, trip_type: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Purchase">Purchase</SelectItem>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="Job Work Out">Job Work Out</SelectItem>
                  <SelectItem value="Job Work Return">Job Work Return</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Trip Date</Label><Input type="date" value={tripForm.trip_date} onChange={e => setTripForm(f => ({ ...f, trip_date: e.target.value }))} /></div>
            <div><Label className="text-xs">Document Number (Inv. / Challan)</Label><Input value={tripForm.document_number} onChange={e => setTripForm(f => ({ ...f, document_number: e.target.value }))} /></div>
            <div><Label className="text-xs">{isPurchaseLike ? 'Source' : 'Destination'}</Label><Input value={tripForm.source_destination} onChange={e => setTripForm(f => ({ ...f, source_destination: e.target.value }))} /></div>
            <div><Label className="text-xs">Quantity (Kg)</Label><Input type="number" value={tripForm.quantity} onChange={e => setTripForm(f => ({ ...f, quantity: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTripDialog(false)}>Cancel</Button>
            <Button onClick={handleAddTrip} disabled={insertTrip.isPending}>Add Trip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Expense Dialog */}
      <Dialog open={expDialog.open} onOpenChange={o => setExpDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Expense — {expDialog.trip?.trip_id || expDialog.trip?.document_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Expense Date</Label><Input type="date" value={expForm.expense_date} onChange={e => setExpForm(f => ({ ...f, expense_date: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Driver Expense (₹)</Label><Input type="number" value={expForm.driver_expense} onChange={e => setExpForm(f => ({ ...f, driver_expense: e.target.value }))} /></div>
              <div><Label className="text-xs">CNG Amount (₹)</Label><Input type="number" value={expForm.cng_amount} onChange={e => setExpForm(f => ({ ...f, cng_amount: e.target.value }))} /></div>
              <div><Label className="text-xs">Toll / Parking (₹)</Label><Input type="number" value={expForm.toll_parking} onChange={e => setExpForm(f => ({ ...f, toll_parking: e.target.value }))} /></div>
              <div><Label className="text-xs">Truck Expense (₹)</Label><Input type="number" value={expForm.truck_expense} onChange={e => setExpForm(f => ({ ...f, truck_expense: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Truck Expense Description</Label><Input value={expForm.truck_expense_desc} onChange={e => setExpForm(f => ({ ...f, truck_expense_desc: e.target.value }))} placeholder="Maintenance, repair, etc." /></div>
            <div className="grid grid-cols-1 gap-3">
              <div><Label className="text-xs">Other Expense (₹)</Label><Input type="number" value={expForm.other_expense} onChange={e => setExpForm(f => ({ ...f, other_expense: e.target.value }))} /></div>
              <div><Label className="text-xs">Other Expense Description</Label><Input value={expForm.other_expense_desc} onChange={e => setExpForm(f => ({ ...f, other_expense_desc: e.target.value }))} /></div>
            </div>
            <p className="text-[11px] text-muted-foreground">Each expense line will auto-create a Cash Out entry under category "Truck Expense".</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExpDialog({ open: false, trip: null })}>Cancel</Button>
            <Button onClick={handleAddExpense} disabled={insertExpense.isPending}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
