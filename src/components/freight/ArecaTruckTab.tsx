import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, IndianRupee, Truck, Trash2, TrendingUp } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTruckTrips, useTruckExpenses, useInsertTruckTrip, useInsertTruckExpense, useDeleteTruckTrip } from '@/hooks/useTruckTrips';
import { useSubmitApproval } from '@/hooks/useActionLog';
import { useAuth } from '@/contexts/AuthContext';
import { useCashEntries } from '@/hooks/useCashBook';

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
  const deleteTrip = useDeleteTruckTrip();
  const submitApproval = useSubmitApproval();
  const { isAdmin } = useAuth();

  const [tripDialog, setTripDialog] = useState(false);
  const [tripForm, setTripForm] = useState({ trip_type: 'Sales', trip_date: new Date().toISOString().slice(0, 10), document_number: '', source_destination: '', quantity: '' });

  const [expDialog, setExpDialog] = useState<{ open: boolean; trip: UnifiedTrip | null }>({ open: false, trip: null });
  const [expForm, setExpForm] = useState({ expense_date: new Date().toISOString().slice(0, 10), driver_expense: '', cng_amount: '', toll_parking: '', truck_expense: '', truck_expense_desc: '', other_expense: '', other_expense_desc: '' });
  const [detailsDialog, setDetailsDialog] = useState<{ open: boolean; trip: UnifiedTrip | null }>({ open: false, trip: null });
  const [incomeDialog, setIncomeDialog] = useState<{ open: boolean; trip: UnifiedTrip | null }>({ open: false, trip: null });
  const [incomeForm, setIncomeForm] = useState({ entry_date: new Date().toISOString().slice(0, 10), amount: '', comments: '' });
  const [savingIncome, setSavingIncome] = useState(false);
  const qc = useQueryClient();

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
    // Sort ascending by date for deterministic per-month counters
    const asc = [...combined].sort((a, b) => (a.trip_date || '').localeCompare(b.trip_date || ''));
    const counters: Record<string, number> = {};
    const withIds = asc.map(t => {
      const d = t.trip_date ? new Date(t.trip_date) : null;
      const monthKey = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : '------';
      counters[monthKey] = (counters[monthKey] || 0) + 1;
      if (t.trip_id) return t; // manual trips already have trip_id
      const monthPrefix = d
        ? `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`
        : '----';
      const seq = String(counters[monthKey]).padStart(2, '0');
      return { ...t, trip_id: `${monthPrefix}/${truckSuffix}/${seq}` };
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

  const { data: cashEntries = [] } = useCashEntries();
  const incomeByKey = useMemo(() => {
    const map: Record<string, number> = {};
    (cashEntries as any[]).forEach((e: any) => {
      if (e.source_type !== 'truck_income') return;
      const m = typeof e.comments === 'string' ? e.comments.match(/\[trip:([^\]]+)\]/) : null;
      const key = m ? m[1] : (e.source_id ? `manual:${e.source_id}` : null);
      if (!key) return;
      map[key] = (map[key] || 0) + Number(e.amount || 0);
    });
    return map;
  }, [cashEntries]);

  const handleAddTrip = async () => {
    if (!tripForm.trip_type) { toast.error('Trip type required'); return; }
    if (!tripForm.trip_date) { toast.error('Trip date required'); return; }
    if (!tripForm.document_number.trim()) { toast.error('Document number required'); return; }
    if (!tripForm.source_destination.trim()) { toast.error('Source/Destination required'); return; }
    const qtyNum = Number(tripForm.quantity);
    if (!tripForm.quantity || isNaN(qtyNum) || qtyNum <= 0) { toast.error('Quantity required (must be > 0)'); return; }
    // Normalize: strip ALL whitespace + lowercase, so "ASU/26-27/093" === "ASU/26-27/ 093" === "asu /26 -27/093"
    const normalizeDoc = (s: string | null | undefined) => (s || '').replace(/\s+/g, '').toLowerCase();
    const docClean = tripForm.document_number.trim();
    const docNorm = normalizeDoc(docClean);
    // First char of cleaned doc — used as a coarse server-side filter (ilike) before normalized match in JS
    const firstChar = docClean.charAt(0);
    const ilikePattern = firstChar ? `${firstChar}%` : '%';

    // Local check: all Areca trips currently shown (this truck)
    const dupLocal = allTrips.find(t => normalizeDoc(t.document_number) === docNorm);
    if (dupLocal) {
      toast.error(`Document # already exists for trip ${dupLocal.trip_id || dupLocal.document_number} (${dupLocal.trip_type})`);
      return;
    }

    // Global check across both Areca trucks (truck_trips) + Transporter listing (invoice_details / transporter_freight).
    // Cannot rely on exact ilike (spaces/punctuation may differ) — fetch by coarse first-char filter, then compare normalized in JS.
    const [tripsRes, freightRes, invDetRes] = await Promise.all([
      (supabase as any).from('truck_trips').select('document_number, truck_number, trip_id').ilike('document_number', ilikePattern),
      (supabase as any).from('transporter_freight').select('invoice_number').ilike('invoice_number', ilikePattern),
      (supabase as any).from('invoice_details').select('invoice_number, purchase_invoice_number, dispatch_type').or(`invoice_number.ilike.${ilikePattern},purchase_invoice_number.ilike.${ilikePattern}`),
    ]);
    const tripDup = (tripsRes.data || []).find((r: any) => normalizeDoc(r.document_number) === docNorm);
    if (tripDup) {
      toast.error(`Document # already used in truck ${tripDup.truck_number} (${tripDup.trip_id})`);
      return;
    }
    const freightDup = (freightRes.data || []).find((r: any) => normalizeDoc(r.invoice_number) === docNorm);
    if (freightDup) {
      toast.error(`Document # already exists in Transporter freight (${freightDup.invoice_number})`);
      return;
    }
    const protectedDispatchTypes = ['Transporter', 'Areca 0720', 'Areca 2720'];
    const invDup = (invDetRes.data || []).find((r: any) => {
      if (!protectedDispatchTypes.includes(r.dispatch_type)) return false;
      return normalizeDoc(r.invoice_number) === docNorm || normalizeDoc(r.purchase_invoice_number) === docNorm;
    });
    if (invDup) {
      const dispatchLabel = invDup.dispatch_type === 'Transporter'
        ? 'Transporter'
        : invDup.dispatch_type === 'Areca 0720'
          ? 'UP14KT0750'
          : invDup.dispatch_type === 'Areca 2720'
            ? 'UP14QT2750'
            : invDup.dispatch_type;
      toast.error(`Document # already listed under ${dispatchLabel} (${invDup.invoice_number || invDup.purchase_invoice_number})`);
      return;
    }

    await insertTrip.mutateAsync({
      truck_number: truckNumber,
      trip_type: tripForm.trip_type as any,
      trip_date: tripForm.trip_date,
      // Save the cleaned (whitespace-stripped) form so future comparisons stay consistent
      document_number: docClean.replace(/\s+/g, ''),
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

  const handleAddIncome = async () => {
    if (!incomeDialog.trip) return;
    const amt = Number(incomeForm.amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    const trip = incomeDialog.trip;
    setSavingIncome(true);
    const { error } = await (supabase as any).from('cash_entries').insert({
      direction: 'in',
      status: 'receivable',
      entry_date: incomeForm.entry_date,
      amount: amt,
      category: 'Truck Income',
      sub_category: trip.trip_type,
      comments: `[trip:${trip.key}] ${truckNumber} · ${trip.trip_id || trip.document_number}${incomeForm.comments ? ` · ${incomeForm.comments}` : ''}`,
      source_type: 'truck_income',
      source_id: trip.manual_id || null,
    });
    setSavingIncome(false);
    if (error) { toast.error(error.message || 'Failed to add income'); return; }
    toast.success('Income recorded · added to Cash In Receivable');
    qc.invalidateQueries({ queryKey: ['cash_entries'] });
    setIncomeDialog({ open: false, trip: null });
    setIncomeForm({ entry_date: new Date().toISOString().slice(0, 10), amount: '', comments: '' });
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
            <TableHead className="text-xs font-semibold">Income</TableHead>
            <TableHead className="text-xs font-semibold">Action</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {allTrips.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No trips yet.</TableCell></TableRow>}
            {allTrips.map(t => {
              const exp = expenseByKey[t.key] || 0;
              const inc = incomeByKey[t.key] || 0;
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
                  <TableCell className="text-xs font-mono-num">
                    {inc > 0 ? <span className="text-green-600 dark:text-green-400">₹{inc.toFixed(2)}</span> : '-'}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setExpDialog({ open: true, trip: t })}>
                        <IndianRupee className="h-3 w-3" /> Expense
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setIncomeDialog({ open: true, trip: t })}>
                        <TrendingUp className="h-3 w-3" /> Income
                      </Button>
                      {t.source !== 'manual' && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => onMoveBack(t)}>
                          ← Move Back
                        </Button>
                      )}
                      {t.source === 'manual' && t.manual_id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          disabled={deleteTrip.isPending || submitApproval.isPending}
                          onClick={() => {
                            if (isAdmin) {
                              if (confirm(`Delete trip ${t.trip_id}? Any linked expenses and cash entries will also be removed.`)) {
                                deleteTrip.mutate(t.manual_id!, { onSuccess: () => toast.success('Trip deleted') });
                              }
                            } else {
                              if (confirm(`Submit deletion of trip ${t.trip_id} for admin approval?`)) {
                                submitApproval.mutate({
                                  action_type: 'delete',
                                  entity_type: 'truck_trip',
                                  entity_id: t.manual_id!,
                                  description: `Delete truck trip ${t.trip_id} (${truckNumber})`,
                                  metadata: { trip_id: t.trip_id, truck_number: truckNumber, document_number: t.document_number },
                                }, { onSuccess: () => toast.success('Delete request sent for admin approval') });
                              }
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
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

      {/* Expense Details Dialog */}
      <Dialog open={detailsDialog.open} onOpenChange={o => setDetailsDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Expense Details — {detailsDialog.trip?.trip_id || detailsDialog.trip?.document_number}</DialogTitle></DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-muted/50">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs text-right">Driver</TableHead>
                <TableHead className="text-xs text-right">CNG</TableHead>
                <TableHead className="text-xs text-right">Toll/Parking</TableHead>
                <TableHead className="text-xs text-right">Truck</TableHead>
                <TableHead className="text-xs text-right">Other</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(() => {
                  const list = (detailsDialog.trip ? expensesByKey[detailsDialog.trip.key] : []) || [];
                  if ((list as any[]).length === 0) return <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-4">No expenses recorded.</TableCell></TableRow>;
                  const rows: JSX.Element[] = [];
                  (list as any[]).forEach((e: any) => {
                    rows.push(
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{new Date(e.expense_date).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell className="text-xs text-right font-mono-num">{Number(e.driver_expense || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-mono-num">{Number(e.cng_amount || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-mono-num">{Number(e.toll_parking || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-mono-num">{Number(e.truck_expense || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-mono-num">{Number(e.other_expense || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-mono-num font-semibold">₹{Number(e.total_amount || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    );
                    if (e.truck_expense_desc || e.other_expense_desc) {
                      rows.push(
                        <TableRow key={`${e.id}-desc`}>
                          <TableCell colSpan={7} className="text-[11px] text-muted-foreground italic">
                            {e.truck_expense_desc && <span>Truck: {e.truck_expense_desc}</span>}
                            {e.truck_expense_desc && e.other_expense_desc && <span> · </span>}
                            {e.other_expense_desc && <span>Other: {e.other_expense_desc}</span>}
                          </TableCell>
                        </TableRow>
                      );
                    }
                  });
                  return rows;
                })()}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailsDialog({ open: false, trip: null })}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Income Dialog */}
      <Dialog open={incomeDialog.open} onOpenChange={o => setIncomeDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Income — {incomeDialog.trip?.trip_id || incomeDialog.trip?.document_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Date</Label><Input type="date" value={incomeForm.entry_date} onChange={e => setIncomeForm(f => ({ ...f, entry_date: e.target.value }))} /></div>
            <div><Label className="text-xs">Amount (₹)</Label><Input type="number" value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div><Label className="text-xs">Comments</Label><Textarea rows={3} value={incomeForm.comments} onChange={e => setIncomeForm(f => ({ ...f, comments: e.target.value }))} placeholder="Optional notes" /></div>
            <p className="text-[11px] text-muted-foreground">This creates a Cash In · Receivable entry under category "Truck Income".</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIncomeDialog({ open: false, trip: null })}>Cancel</Button>
            <Button onClick={handleAddIncome} disabled={savingIncome}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
