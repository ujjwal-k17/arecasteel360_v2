import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RefreshCw, Download, Truck, ChevronDown, ChevronUp, Plus, IndianRupee, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { FreightDetailsDialog } from '@/components/freight/FreightDetailsDialog';
import { ArecaTruckTab, type UnifiedTrip } from '@/components/freight/ArecaTruckTab';

const DISPATCH_TYPES = [
  { value: 'Ex-Sales', label: 'Ex-Sales' },
  { value: 'Transporter', label: 'Transporter' },
  { value: 'Areca 0720', label: 'UP14KT0750' },
  { value: 'Areca 2720', label: 'UP14QT2750' },
] as const;

const PURCHASE_TYPES = [
  { value: 'FOR Purchase', label: 'FOR Purchase' },
  { value: 'Transporter', label: 'Transporter' },
  { value: 'Areca 0720', label: 'UP14KT0750' },
  { value: 'Areca 2720', label: 'UP14QT2750' },
] as const;

interface InvoiceSummary {
  invoice_number: string;
  invoice_date: string | null;
  order_id: string | null;
  customer_name: string | null;
  total_qty: number;
  dispatch_type: string | null;
  source_type: string; // 'sales' | 'purchase' | 'manual'
  trip_type?: string | null; // 'Purchase' | 'Sales' | 'Job Work' (manual trips only)
}

interface PurchaseSummary {
  batch_number: string;
  purchase_date: string | null;
  purchase_from: string | null;
  material: string | null;
  gross_weight: number;
  purchase_type: string | null;
  purchase_invoice_number: string | null;
}

function FreightPage() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [freightDialog, setFreightDialog] = useState<{ open: boolean; invoice: string }>({ open: false, invoice: '' });
  const [commentDialog, setCommentDialog] = useState<{ open: boolean; freightId: string; comment: string }>({ open: false, freightId: '', comment: '' });
  const [paymentDialog, setPaymentDialog] = useState<{ open: boolean; freightId: string; amount: string; invoiceNumber: string }>({ open: false, freightId: '', amount: '', invoiceNumber: '' });

  const { data: orders } = useQuery({
    queryKey: ['freight_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, customers(customer_name)');
      if (error) throw error;
      return data;
    },
  });

  const orderMap = useMemo(() => {
    const map: Record<string, { order_number: string; customer_name: string }> = {};
    (orders || []).forEach((o: any) => {
      const entry = { order_number: o.order_number, customer_name: o.customers?.customer_name || '-' };
      map[o.id] = entry;
      if (o.order_number) map[o.order_number] = entry;
    });
    return map;
  }, [orders]);

  const { data: invoiceDetails } = useQuery({
    queryKey: ['freight_invoice_details'],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoice_details').select('*');
      if (error) throw error;
      return data;
    },
  });

  const invoiceDetailMap = useMemo(() => {
    const map: Record<string, any> = {};
    (invoiceDetails || []).forEach((d: any) => { map[d.invoice_number] = d; });
    return map;
  }, [invoiceDetails]);

  const { data: inventoryActions } = useQuery({
    queryKey: ['freight_inv_actions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_actions')
        .select('invoice_number, sales_date, order_id, net_weight')
        .in('action_type', ['pack_coil_sale', 'loose_coil_sale', 'sales']);
      if (error) throw error;
      return data;
    },
  });

  const { data: fgSales } = useQuery({
    queryKey: ['freight_fg_sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fg_sales').select('invoice_number, sales_date, order_id, quantity');
      if (error) throw error;
      return data;
    },
  });

  const { data: defectiveSales } = useQuery({
    queryKey: ['freight_defective_sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('defective_sales').select('invoice_number, sales_date, order_id, quantity');
      if (error) throw error;
      return data;
    },
  });

  // Purchases tab - only batches NOT from in-transit (directly added to coils)
  const { data: batches } = useQuery({
    queryKey: ['freight_batches'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('batches')
        .select('batch_number, purchase_date, purchase_from, material, gross_weight') as any)
        .eq('status', 'received')
        .eq('from_intransit', false)
        .order('purchase_date', { ascending: false });
      if (error) throw error;
      return data as { batch_number: string; purchase_date: string | null; purchase_from: string | null; material: string | null; gross_weight: number | null }[];
    },
  });

  // In-transit batches go directly to Ex-Sales / FOR Purchases
  const { data: intransitBatches } = useQuery({
    queryKey: ['freight_intransit_batches'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('batches')
        .select('batch_number, purchase_date, purchase_from, material, gross_weight') as any)
        .eq('from_intransit', true)
        .order('purchase_date', { ascending: false });
      if (error) throw error;
      return data as { batch_number: string; purchase_date: string | null; purchase_from: string | null; material: string | null; gross_weight: number | null }[];
    },
  });

  const { data: transporters } = useQuery({
    queryKey: ['transporters_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transporters').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: transporterFreightMap } = useQuery({
    queryKey: ['transporter_freight_map'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transporter_freight').select('*, transporters(name)');
      if (error) throw error;
      const map: Record<string, any> = {};
      (data || []).forEach((r: any) => { map[r.invoice_number] = r; });
      return map;
    },
  });

  const { data: freightComments } = useQuery({
    queryKey: ['transporter_freight_comments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transporter_freight_comments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: freightPayments } = useQuery({
    queryKey: ['transporter_freight_payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transporter_freight_payments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Manual transporter trips (added via 'Add Trip' button in Transporter tab — not derived from a dispatch/purchase)
  const { data: manualTransporterTrips } = useQuery({
    queryKey: ['manual_transporter_trips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('truck_trips')
        .select('*')
        .eq('truck_number', 'Transporter');
      if (error) throw error;
      return data || [];
    },
  });

  const commentsByFreightId = useMemo(() => {
    const map: Record<string, any[]> = {};
    (freightComments || []).forEach((c: any) => {
      if (!map[c.transporter_freight_id]) map[c.transporter_freight_id] = [];
      map[c.transporter_freight_id].push(c);
    });
    return map;
  }, [freightComments]);

  const paymentsByFreightId = useMemo(() => {
    const map: Record<string, any[]> = {};
    (freightPayments || []).forEach((p: any) => {
      if (!map[p.transporter_freight_id]) map[p.transporter_freight_id] = [];
      map[p.transporter_freight_id].push(p);
    });
    return map;
  }, [freightPayments]);

  const paidAmountByFreightId = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(paymentsByFreightId).forEach(([id, payments]) => {
      map[id] = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    });
    return map;
  }, [paymentsByFreightId]);

  // Sales invoice summaries
  const invoiceSummaries: InvoiceSummary[] = useMemo(() => {
    const map: Record<string, { invoice_date: string | null; order_ids: Set<string>; total_qty: number }> = {};
    const addRecord = (inv: string | null, date: string | null, orderId: string | null, qty: number) => {
      if (!inv) return;
      if (!map[inv]) map[inv] = { invoice_date: null, order_ids: new Set(), total_qty: 0 };
      if (date) map[inv].invoice_date = date;
      if (orderId) map[inv].order_ids.add(orderId);
      map[inv].total_qty += qty;
    };
    (inventoryActions || []).forEach((a: any) => addRecord(a.invoice_number, a.sales_date, a.order_id, a.net_weight || 0));
    (fgSales || []).forEach((s: any) => addRecord(s.invoice_number, s.sales_date, s.order_id, s.quantity || 0));
    (defectiveSales || []).forEach((s: any) => addRecord(s.invoice_number, s.sales_date, s.order_id, s.quantity || 0));

    return Object.entries(map).map(([inv, data]) => {
      const firstOrderId = [...data.order_ids][0] || null;
      const orderInfo = firstOrderId ? orderMap[firstOrderId] : null;
      const detail = invoiceDetailMap[inv];
      return {
        invoice_number: inv,
        invoice_date: data.invoice_date,
        order_id: orderInfo?.order_number || firstOrderId,
        customer_name: orderInfo?.customer_name || null,
        total_qty: data.total_qty,
        dispatch_type: detail?.dispatch_type || null,
        source_type: detail?.source_type || 'sales',
      };
    }).sort((a, b) => {
      if (!a.invoice_date) return 1;
      if (!b.invoice_date) return -1;
      return b.invoice_date.localeCompare(a.invoice_date);
    });
  }, [inventoryActions, fgSales, defectiveSales, orderMap, invoiceDetailMap]);

  // Purchase summaries from batches
  const purchaseSummaries: PurchaseSummary[] = useMemo(() => {
    return (batches || []).map((b: any) => {
      const detail = invoiceDetailMap[b.batch_number];
      return {
        batch_number: b.batch_number,
        purchase_date: b.purchase_date,
        purchase_from: b.purchase_from,
        material: b.material,
        gross_weight: b.gross_weight || 0,
        purchase_type: detail?.dispatch_type || null,
        purchase_invoice_number: detail?.purchase_invoice_number || null,
      };
    });
  }, [batches, invoiceDetailMap]);

  const filteredSummaries = useMemo(() => {
    return invoiceSummaries.filter(s => {
      if (!s.invoice_date) return !dateFrom && !dateTo;
      if (dateFrom && s.invoice_date < dateFrom) return false;
      if (dateTo && s.invoice_date > dateTo) return false;
      return true;
    });
  }, [invoiceSummaries, dateFrom, dateTo]);

  const filteredPurchases = useMemo(() => {
    return purchaseSummaries.filter(s => {
      if (!s.purchase_date) return !dateFrom && !dateTo;
      if (dateFrom && s.purchase_date < dateFrom) return false;
      if (dateTo && s.purchase_date > dateTo) return false;
      return true;
    });
  }, [purchaseSummaries, dateFrom, dateTo]);

  // Combined items for destination tabs (sales + purchases mapped to InvoiceSummary format)
  const allMappedItems: (InvoiceSummary & { purchaseBatches?: PurchaseSummary[] })[] = useMemo(() => {
    // Sales items that have a dispatch_type
    const salesItems: (InvoiceSummary & { purchaseBatches?: PurchaseSummary[] })[] = invoiceSummaries.filter(s => s.dispatch_type);

    // Purchase items grouped by purchase_invoice_number (FOR Purchase without invoice grouped by batch)
    const purchasesByInvoice: Record<string, PurchaseSummary[]> = {};
    purchaseSummaries
      .filter(p => p.purchase_type && (p.purchase_invoice_number || p.purchase_type === 'FOR Purchase'))
      .forEach(p => {
        const key = p.purchase_invoice_number || p.batch_number;
        if (!purchasesByInvoice[key]) purchasesByInvoice[key] = [];
        purchasesByInvoice[key].push(p);
      });

    const purchaseItems = Object.entries(purchasesByInvoice).map(([invNo, batches]) => {
      const first = batches[0];
      let mappedDispatchType = first.purchase_type;
      if (first.purchase_type === 'FOR Purchase') mappedDispatchType = 'Ex-Sales';
      return {
        invoice_number: invNo,
        invoice_date: first.purchase_date,
        order_id: null,
        customer_name: first.purchase_from,
        total_qty: batches.reduce((s, b) => s + b.gross_weight, 0),
        dispatch_type: mappedDispatchType,
        source_type: 'purchase',
        purchaseBatches: batches,
      } as InvoiceSummary & { purchaseBatches?: PurchaseSummary[] };
    });

    // In-transit batches go directly to Ex-Sales / FOR Purchases
    const intransitItems: (InvoiceSummary & { purchaseBatches?: PurchaseSummary[] })[] = (intransitBatches || []).map((b: any) => ({
      invoice_number: b.batch_number,
      invoice_date: b.purchase_date,
      order_id: null,
      customer_name: b.purchase_from,
      total_qty: b.gross_weight || 0,
      dispatch_type: 'Ex-Sales',
      source_type: 'purchase',
    }));

    // Manual transporter trips — surface as Transporter dispatches (not from sales/purchases)
    const manualItems: (InvoiceSummary & { purchaseBatches?: PurchaseSummary[] })[] = (manualTransporterTrips || []).map((t: any) => ({
      invoice_number: t.document_number || t.trip_id,
      invoice_date: t.trip_date,
      order_id: null,
      customer_name: t.source_destination,
      total_qty: t.quantity || 0,
      dispatch_type: 'Transporter',
      source_type: 'manual',
      trip_type: t.trip_type || 'Sales',
    }));

    return [...salesItems, ...purchaseItems, ...intransitItems, ...manualItems];
  }, [invoiceSummaries, purchaseSummaries, intransitBatches, manualTransporterTrips]);

  const filteredMappedItems = useMemo(() => {
    return allMappedItems.filter(s => {
      if (!s.invoice_date) return !dateFrom && !dateTo;
      if (dateFrom && s.invoice_date < dateFrom) return false;
      if (dateTo && s.invoice_date > dateTo) return false;
      return true;
    });
  }, [allMappedItems, dateFrom, dateTo]);

  const updateDispatchType = useMutation({
    mutationFn: async ({ invoice_number, dispatch_type, source_type, purchase_invoice_number }: { invoice_number: string; dispatch_type: string | null; source_type?: string; purchase_invoice_number?: string }) => {
      const existing = invoiceDetailMap[invoice_number];
      if (existing) {
        const updateData: any = { dispatch_type, source_type: source_type || existing.source_type || 'sales' };
        if (purchase_invoice_number !== undefined) updateData.purchase_invoice_number = purchase_invoice_number;
        const { error } = await supabase.from('invoice_details').update(updateData).eq('invoice_number', invoice_number);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('invoice_details').insert({
          invoice_number,
          dispatch_type,
          source_type: source_type || 'sales',
          purchase_invoice_number: purchase_invoice_number || null,
        });
        if (error) throw error;
      }

      // If moving back (dispatch_type is null), reset transporter freight data
      if (!dispatch_type) {
        const freightRecord = (transporterFreightMap || {})[invoice_number];
        if (freightRecord) {
          await supabase.from('transporter_freight').delete().eq('id', freightRecord.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freight_invoice_details'] });
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_map'] });
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_comments'] });
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_payments'] });
      toast.success('Type updated');
    },
    onError: () => toast.error('Failed to update type'),
  });

  const savePurchaseInvoiceNumber = useMutation({
    mutationFn: async ({ batch_number, purchase_invoice_number }: { batch_number: string; purchase_invoice_number: string }) => {
      const existing = invoiceDetailMap[batch_number];
      if (existing) {
        const { error } = await supabase.from('invoice_details').update({ purchase_invoice_number }).eq('invoice_number', batch_number);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('invoice_details').insert({
          invoice_number: batch_number,
          source_type: 'purchase',
          purchase_invoice_number,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freight_invoice_details'] });
      toast.success('Purchase invoice number saved');
    },
    onError: () => toast.error('Failed to save purchase invoice number'),
  });

  const saveFreightDetails = useMutation({
    mutationFn: async (data: { invoice_number: string; transporter_id: string; total_freight: number; gst: number; tds: number; lr_number: string }) => {
      const existing = (transporterFreightMap || {})[data.invoice_number];
      if (existing) {
        const { error } = await supabase.from('transporter_freight')
          .update({ transporter_id: data.transporter_id, total_freight: data.total_freight, gst: data.gst, tds: data.tds, lr_number: data.lr_number })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('transporter_freight')
          .insert({ invoice_number: data.invoice_number, transporter_id: data.transporter_id, total_freight: data.total_freight, gst: data.gst, tds: data.tds, lr_number: data.lr_number });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_map'] });
      toast.success('Freight details saved');
    },
    onError: () => toast.error('Failed to save freight details'),
  });

  const updateFreightStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('transporter_freight').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_map'] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const addComment = useMutation({
    mutationFn: async ({ transporter_freight_id, comment }: { transporter_freight_id: string; comment: string }) => {
      const { error } = await supabase.from('transporter_freight_comments').insert({
        transporter_freight_id,
        user_email: user?.email || 'unknown',
        comment,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_comments'] });
      toast.success('Comment added');
      setCommentDialog({ open: false, freightId: '', comment: '' });
    },
    onError: () => toast.error('Failed to add comment'),
  });

  const addPayment = useMutation({
    mutationFn: async ({ transporter_freight_id, amount }: { transporter_freight_id: string; amount: number }) => {
      const freightRecord = Object.values(transporterFreightMap || {}).find((r: any) => r.id === transporter_freight_id) as any;
      if (freightRecord) {
        const totalAmount = (freightRecord.total_freight || 0) + (freightRecord.gst || 0) - (freightRecord.tds || 0);
        const alreadyPaid = paidAmountByFreightId[transporter_freight_id] || 0;
        if (alreadyPaid + amount > totalAmount) {
          throw new Error(`Payment exceeds total amount. Remaining balance: ₹${(totalAmount - alreadyPaid).toLocaleString('en-IN')}`);
        }
      }
      const { error } = await supabase.from('transporter_freight_payments').insert({
        transporter_freight_id,
        amount,
        user_email: user?.email || 'unknown',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_payments'] });
      toast.success('Payment recorded');
      setPaymentDialog({ open: false, freightId: '', amount: '', invoiceNumber: '' });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to record payment'),
  });

  const refreshAll = () => {
    ['freight_inv_actions', 'freight_fg_sales', 'freight_defective_sales', 'freight_orders', 'freight_invoice_details', 'transporter_freight_map', 'transporters_list', 'transporter_freight_comments', 'transporter_freight_payments', 'freight_batches', 'freight_intransit_batches'].forEach(k =>
      queryClient.invalidateQueries({ queryKey: [k] })
    );
    toast.success('Refreshed');
  };

  const handleDownload = (data: InvoiceSummary[], label: string) => {
    if (data.length === 0) { toast.info('No data to download'); return; }
    const rows = data.map(s => ({
      'Invoice Number': s.invoice_number,
      'Invoice Date': s.invoice_date || '-',
      'Order ID': s.order_id || '-',
      'Customer Name': s.customer_name || '-',
      'Total Qty (Kg)': s.total_qty,
      'Purchase / Sales': s.source_type === 'purchase' ? 'Purchase' : 'Sales',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, label);
    XLSX.writeFile(wb, `${label.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="container py-6">
      <h1 className="text-2xl font-semibold mb-6">Freight</h1>
      <Tabs defaultValue="all-dispatches">
        <div className="space-y-2">
          <TabsList className="flex flex-wrap bg-transparent p-0 gap-2 h-auto justify-start w-full">
            <TabsTrigger
              value="all-dispatches"
              className="bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              All Dispatches
            </TabsTrigger>
            <TabsTrigger
              value="purchases"
              className="bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Purchases
            </TabsTrigger>
            <TabsTrigger
              value="transporter"
              className="bg-accent/10 text-accent data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
            >
              Transporter
            </TabsTrigger>
            <TabsTrigger
              value="areca-trucks"
              className="bg-accent/10 text-accent data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
            >
              Areca Trucks
            </TabsTrigger>
          </TabsList>
          <TabsList className="flex flex-wrap bg-transparent p-0 gap-2 h-auto justify-start w-full">
            <TabsTrigger
              value="ex-sales"
              className="h-7 px-2 text-xs bg-muted text-muted-foreground data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground"
            >
              Ex-Sales / FOR Purchases
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex items-center gap-3 flex-wrap my-4">
          <Button variant="outline" size="sm" onClick={refreshAll} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Input type="date" className="h-8 w-36 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" className="h-8 w-36 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</Button>
            )}
          </div>
        </div>

        {/* All Dispatches */}
        <TabsContent value="all-dispatches">
          <DispatchTable
            data={filteredSummaries.filter(s => !s.dispatch_type)}
            showDispatchType
            onDispatchTypeChange={(inv, type) => updateDispatchType.mutate({ invoice_number: inv, dispatch_type: type, source_type: 'sales' })}
            onDownload={() => handleDownload(filteredSummaries.filter(s => !s.dispatch_type), 'All Dispatches')}
          />
        </TabsContent>

        {/* Purchases */}
        <TabsContent value="purchases">
          <PurchasesTable
            data={filteredPurchases.filter(p => !p.purchase_type)}
            onPurchaseTypeChange={(batchNum, type) => updateDispatchType.mutate({
              invoice_number: batchNum,
              dispatch_type: type,
              source_type: 'purchase',
            })}
            onSavePurchaseInvoice={(batchNum, invNo) => savePurchaseInvoiceNumber.mutate({
              batch_number: batchNum,
              purchase_invoice_number: invNo,
            })}
          />
        </TabsContent>

        {/* Ex-Sales / FOR Purchases */}
        <TabsContent value="ex-sales">
          <DispatchTable
            data={filteredMappedItems.filter(s => s.dispatch_type === 'Ex-Sales')}
            showMoveBack
            showSourceColumn
            onMoveBack={(inv, item) => {
              if (item?.purchaseBatches) {
                // Reset all batches under this purchase invoice
                item.purchaseBatches.forEach(b => updateDispatchType.mutate({ invoice_number: b.batch_number, dispatch_type: null }));
              } else {
                updateDispatchType.mutate({ invoice_number: inv, dispatch_type: null });
              }
            }}
            onDownload={() => handleDownload(filteredMappedItems.filter(s => s.dispatch_type === 'Ex-Sales'), 'Ex-Sales_FOR_Purchases')}
          />
        </TabsContent>

        {/* Transporter */}
        <TabsContent value="transporter">
          <TransporterDispatchTable
            data={filteredMappedItems.filter(s => s.dispatch_type === 'Transporter')}
            isAdmin={isAdmin}
            onMoveBack={(inv) => {
              const item = filteredMappedItems.find(s => s.invoice_number === inv);
              if (item?.purchaseBatches) {
                item.purchaseBatches.forEach(b => updateDispatchType.mutate({ invoice_number: b.batch_number, dispatch_type: null }));
              } else {
                updateDispatchType.mutate({ invoice_number: inv, dispatch_type: null });
              }
            }}
            transporterFreightMap={transporterFreightMap || {}}
            commentsByFreightId={commentsByFreightId}
            paymentsByFreightId={paymentsByFreightId}
            paidAmountByFreightId={paidAmountByFreightId}
            onOpenFreightDialog={(inv) => setFreightDialog({ open: true, invoice: inv })}
            onStatusChange={(id, status) => updateFreightStatus.mutate({ id, status })}
            onAddComment={(freightId) => setCommentDialog({ open: true, freightId, comment: '' })}
            onAddPayment={(freightId, invoiceNumber) => setPaymentDialog({ open: true, freightId, amount: '', invoiceNumber })}
            onDownload={() => handleDownload(filteredMappedItems.filter(s => s.dispatch_type === 'Transporter'), 'Transporter')}
            onAddManualTrip={async (d) => {
              // Save manual transporter trip to truck_trips with truck_number='Transporter'.
              // Also block duplicates against existing truck_trips, transporter_freight, and invoice_details (Transporter dispatch type).
              const normalizeDoc = (s: string | null | undefined) => (s || '').replace(/\s+/g, '').toLowerCase();
              const docClean = d.document_number.replace(/\s+/g, '');
              const docNorm = normalizeDoc(docClean);
              if (!docNorm) { toast.error('Document number required'); return; }
              const ilikePattern = `${docNorm[0]}%`;
              const [tripsRes, freightRes, invDetRes] = await Promise.all([
                supabase.from('truck_trips').select('document_number, truck_number').ilike('document_number', ilikePattern),
                supabase.from('transporter_freight').select('invoice_number').ilike('invoice_number', ilikePattern),
                supabase.from('invoice_details').select('invoice_number, purchase_invoice_number, dispatch_type').or(`invoice_number.ilike.${ilikePattern},purchase_invoice_number.ilike.${ilikePattern}`),
              ]);
              const tripDup = (tripsRes.data || []).find((r: any) => normalizeDoc(r.document_number) === docNorm);
              if (tripDup) { toast.error(`Document # already exists${tripDup.truck_number ? ` under ${tripDup.truck_number}` : ''}`); return; }
              const freightDup = (freightRes.data || []).find((r: any) => normalizeDoc(r.invoice_number) === docNorm);
              if (freightDup) { toast.error('Document # already exists under Transporter'); return; }
              const protectedDispatchTypes = ['Transporter', 'Areca 0720', 'Areca 2720'];
              const invDup = (invDetRes.data || []).find((r: any) => protectedDispatchTypes.includes(r.dispatch_type) && (normalizeDoc(r.invoice_number) === docNorm || normalizeDoc(r.purchase_invoice_number) === docNorm));
              if (invDup) {
                const lbl = invDup.dispatch_type === 'Areca 0720' ? 'UP14KT0750' : invDup.dispatch_type === 'Areca 2720' ? 'UP14QT2750' : 'Transporter';
                toast.error(`Document # already listed under ${lbl}`);
                return;
              }
              const tripId = `TPT-${Date.now()}`;
              const { error } = await supabase.from('truck_trips').insert({
                trip_id: tripId,
                truck_number: 'Transporter',
                trip_type: d.trip_type,
                trip_date: d.trip_date,
                document_number: docClean,
                source_destination: d.source_destination,
                quantity: d.quantity,
              });
              if (error) { toast.error('Failed to add trip'); return; }
              toast.success('Trip added');
              queryClient.invalidateQueries({ queryKey: ['manual_transporter_trips'] });
            }}
          />
        </TabsContent>

        {/* Areca Trucks */}
        <TabsContent value="areca-trucks">
          {(() => {
            const buildTrips = (dispatchKey: 'Areca 0720' | 'Areca 2720', truckLabel: string) => {
              const items = filteredMappedItems.filter(s => s.dispatch_type === dispatchKey);
              const dispatches: UnifiedTrip[] = items.filter(i => i.source_type !== 'purchase').map(i => ({
                key: `dispatch:${i.invoice_number}`,
                source: 'dispatch',
                trip_id: null,
                document_number: i.invoice_number,
                trip_date: i.invoice_date || '',
                source_destination: i.customer_name || '-',
                total_qty: i.total_qty,
                trip_type: 'Sales',
                truck_number: truckLabel,
                source_ref: i.invoice_number,
              }));
              const purchases: UnifiedTrip[] = items.filter(i => i.source_type === 'purchase').map(i => ({
                key: `purchase:${i.invoice_number}`,
                source: 'purchase',
                trip_id: null,
                document_number: i.invoice_number,
                trip_date: i.invoice_date || '',
                source_destination: i.customer_name || '-',
                total_qty: i.total_qty,
                trip_type: 'Purchase',
                truck_number: truckLabel,
                source_ref: i.invoice_number,
              }));
              return { dispatches, purchases, items };
            };
            const moveBack = (dispatchKey: 'Areca 0720' | 'Areca 2720') => (t: UnifiedTrip) => {
              const item = filteredMappedItems.find(i => i.invoice_number === t.document_number && i.dispatch_type === dispatchKey);
              if (item?.purchaseBatches) {
                item.purchaseBatches.forEach(b => updateDispatchType.mutate({ invoice_number: b.batch_number, dispatch_type: null }));
              } else {
                updateDispatchType.mutate({ invoice_number: t.document_number, dispatch_type: null });
              }
            };
            const k = buildTrips('Areca 0720', 'UP14KT0750');
            const q = buildTrips('Areca 2720', 'UP14QT2750');
            return (
              <Tabs defaultValue="areca-0720" className="mt-2">
                <TabsList>
                  <TabsTrigger value="areca-0720">UP14KT0750</TabsTrigger>
                  <TabsTrigger value="areca-2720">UP14QT2750</TabsTrigger>
                </TabsList>
                <TabsContent value="areca-0720" className="mt-3">
                  <ArecaTruckTab
                    truckNumber="UP14KT0750"
                    internalKey="Areca 0720"
                    externalDispatches={k.dispatches}
                    externalPurchases={k.purchases}
                    onMoveBack={moveBack('Areca 0720')}
                  />
                </TabsContent>
                <TabsContent value="areca-2720" className="mt-3">
                  <ArecaTruckTab
                    truckNumber="UP14QT2750"
                    internalKey="Areca 2720"
                    externalDispatches={q.dispatches}
                    externalPurchases={q.purchases}
                    onMoveBack={moveBack('Areca 2720')}
                  />
                </TabsContent>
              </Tabs>
            );
          })()}
        </TabsContent>
      </Tabs>

      <FreightDetailsDialog
        open={freightDialog.open}
        onOpenChange={(o) => setFreightDialog(p => ({ ...p, open: o }))}
        invoiceNumber={freightDialog.invoice}
        transporters={(transporters || []).map((t: any) => ({ id: t.id, name: t.name }))}
        existingData={(transporterFreightMap || {})[freightDialog.invoice] || null}
        onSave={(data) => saveFreightDetails.mutate(data)}
      />

      {/* Add Comment Dialog */}
      <Dialog open={commentDialog.open} onOpenChange={o => setCommentDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Comment</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Your Comment</Label>
            <Textarea
              value={commentDialog.comment}
              onChange={e => setCommentDialog(p => ({ ...p, comment: e.target.value }))}
              placeholder="Type your comment..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Posting as: {user?.email}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommentDialog({ open: false, freightId: '', comment: '' })}>Cancel</Button>
            <Button
              onClick={() => addComment.mutate({ transporter_freight_id: commentDialog.freightId, comment: commentDialog.comment })}
              disabled={!commentDialog.comment.trim()}
            >
              Add Comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Payment Dialog */}
      <Dialog open={paymentDialog.open} onOpenChange={o => setPaymentDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Record Payment — {paymentDialog.invoiceNumber}</DialogTitle></DialogHeader>
          {(() => {
            const freightRecord = (transporterFreightMap || {})[paymentDialog.invoiceNumber];
            const totalAmount = freightRecord ? ((freightRecord.total_freight || 0) + (freightRecord.gst || 0) - (freightRecord.tds || 0)) : 0;
            const alreadyPaid = freightRecord ? (paidAmountByFreightId[freightRecord.id] || 0) : 0;
            const remaining = totalAmount - alreadyPaid;
            const enteredAmount = parseFloat(paymentDialog.amount) || 0;
            const exceedsBalance = enteredAmount > remaining;

            return (
              <>
                <div className="space-y-2 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Amount:</span>
                    <span className="font-semibold font-mono-num">₹{totalAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Already Paid:</span>
                    <span className="font-mono-num">₹{alreadyPaid.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Remaining Balance:</span>
                    <span className="font-semibold font-mono-num">₹{remaining.toLocaleString('en-IN')}</span>
                  </div>
                  <Label>Payment Amount (₹)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="Enter payment amount"
                      value={paymentDialog.amount}
                      onChange={e => setPaymentDialog(p => ({ ...p, amount: e.target.value }))}
                      className="flex-1"
                    />
                    {remaining > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-xs whitespace-nowrap"
                        onClick={() => setPaymentDialog(p => ({ ...p, amount: remaining.toString() }))}
                      >
                        Full Balance
                      </Button>
                    )}
                  </div>
                  {exceedsBalance && (
                    <p className="text-xs text-destructive">Amount exceeds remaining balance of ₹{remaining.toLocaleString('en-IN')}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Posting as: {user?.email}</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPaymentDialog({ open: false, freightId: '', amount: '', invoiceNumber: '' })}>Cancel</Button>
                  <Button
                    onClick={() => addPayment.mutate({ transporter_freight_id: paymentDialog.freightId, amount: enteredAmount })}
                    disabled={!paymentDialog.amount || enteredAmount <= 0 || exceedsBalance}
                  >
                    Record Payment
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Purchases Table ── */
function PurchasesTable({
  data,
  onPurchaseTypeChange,
  onSavePurchaseInvoice,
}: {
  data: PurchaseSummary[];
  onPurchaseTypeChange: (batchNumber: string, type: string) => void;
  onSavePurchaseInvoice: (batchNumber: string, invoiceNumber: string) => void;
}) {
  const [editingInvoice, setEditingInvoice] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSaveInvoice = (batchNumber: string) => {
    const val = editingInvoice[batchNumber]?.trim();
    if (val) {
      onSavePurchaseInvoice(batchNumber, val);
      setEditingInvoice(prev => { const n = { ...prev }; delete n[batchNumber]; return n; });
    }
  };

  const toggleOne = (batchNumber: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(batchNumber)) n.delete(batchNumber); else n.add(batchNumber);
      return n;
    });
  };

  const allSelected = data.length > 0 && data.every(p => selected.has(p.batch_number));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(data.map(p => p.batch_number)));
  };

  const handleBulkFOR = () => {
    selected.forEach(batchNumber => onPurchaseTypeChange(batchNumber, 'FOR Purchase'));
    setSelected(new Set());
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm flex-wrap">
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Batches:</span>{' '}
          <span className="font-semibold">{data.length}</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Weight:</span>{' '}
          <span className="font-semibold font-mono-num">{data.reduce((s, r) => s + r.gross_weight, 0).toFixed(2)} Kg</span>
        </div>
        {selected.size > 0 && (
          <>
            <div className="bg-muted/50 rounded-md px-3 py-1.5">
              <span className="text-muted-foreground">Selected:</span>{' '}
              <span className="font-semibold">{selected.size}</span>
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={handleBulkFOR}>
              Mark as FOR Purchase
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="text-xs font-semibold">#</TableHead>
              <TableHead className="text-xs font-semibold">Batch Number</TableHead>
              <TableHead className="text-xs font-semibold">Purchase Date</TableHead>
              <TableHead className="text-xs font-semibold">Supplier</TableHead>
              <TableHead className="text-xs font-semibold">Material</TableHead>
              <TableHead className="text-xs font-semibold">Gross Weight (Kg)</TableHead>
              <TableHead className="text-xs font-semibold">Purchase Type</TableHead>
              <TableHead className="text-xs font-semibold">Purchase Invoice No.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No unassigned purchases found.
                </TableCell>
              </TableRow>
            )}
            {data.map((p, idx) => {
              return (
                <TableRow key={p.batch_number} data-state={selected.has(p.batch_number) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(p.batch_number)}
                      onCheckedChange={() => toggleOne(p.batch_number)}
                      aria-label={`Select ${p.batch_number}`}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="text-sm font-medium">{p.batch_number}</TableCell>
                  <TableCell className="text-sm">{p.purchase_date ? new Date(p.purchase_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                  <TableCell className="text-sm">{p.purchase_from || '-'}</TableCell>
                  <TableCell className="text-sm">{p.material || '-'}</TableCell>
                  <TableCell className="text-sm font-mono-num">{p.gross_weight.toFixed(2)}</TableCell>
                  <TableCell className="text-sm">
                    <Select
                      value={p.purchase_type || ''}
                      onValueChange={v => onPurchaseTypeChange(p.batch_number, v)}
                    >
                      <SelectTrigger className="h-7 text-xs w-[130px]">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {PURCHASE_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.purchase_type === 'FOR Purchase' ? (
                      <span className="text-xs text-muted-foreground">Not required</span>
                    ) : p.purchase_invoice_number && editingInvoice[p.batch_number] === undefined ? (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{p.purchase_invoice_number}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingInvoice(prev => ({ ...prev, [p.batch_number]: p.purchase_invoice_number || '' }))}
                        >
                          ✎
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-7 text-xs w-[120px]"
                          placeholder="Invoice No."
                          value={editingInvoice[p.batch_number] ?? ''}
                          onChange={e => setEditingInvoice(prev => ({ ...prev, [p.batch_number]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveInvoice(p.batch_number); }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2"
                          disabled={!editingInvoice[p.batch_number]?.trim()}
                          onClick={() => handleSaveInvoice(p.batch_number)}
                        >
                          Save
                        </Button>
                        {p.purchase_invoice_number && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-1"
                            onClick={() => setEditingInvoice(prev => { const n = { ...prev }; delete n[p.batch_number]; return n; })}
                          >
                            ✕
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ── Transporter Dispatch Table with expandable rows, filters, sub-tabs ── */
function TransporterDispatchTable({
  data,
  isAdmin,
  onMoveBack,
  transporterFreightMap,
  commentsByFreightId,
  paymentsByFreightId,
  paidAmountByFreightId,
  onOpenFreightDialog,
  onStatusChange,
  onAddComment,
  onAddPayment,
  onDownload,
  onAddManualTrip,
  onDeleteManualTrip,
}: {
  data: (InvoiceSummary & { purchaseBatches?: PurchaseSummary[] })[];
  isAdmin: boolean;
  onMoveBack: (invoice: string) => void;
  transporterFreightMap: Record<string, any>;
  commentsByFreightId: Record<string, any[]>;
  paymentsByFreightId: Record<string, any[]>;
  paidAmountByFreightId: Record<string, number>;
  onOpenFreightDialog: (invoice: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onAddComment: (freightId: string) => void;
  onAddPayment: (freightId: string, invoiceNumber: string) => void;
  onDownload: () => void;
  onAddManualTrip: (data: { trip_type: string; trip_date: string; document_number: string; source_destination: string; quantity: number }) => Promise<void> | void;
  onDeleteManualTrip: (documentNumber: string) => Promise<void> | void;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [addTripOpen, setAddTripOpen] = useState(false);
  const [tripForm, setTripForm] = useState({
    trip_type: 'Sales',
    trip_date: new Date().toISOString().slice(0, 10),
    document_number: '',
    source_destination: '',
    quantity: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [subTab, setSubTab] = useState<'all' | 'open' | 'closed'>('all');
  const [filterInvoice, setFilterInvoice] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterTransporter, setFilterTransporter] = useState('');
  const [filterApproval, setFilterApproval] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');

  const toggleRow = (inv: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(inv)) next.delete(inv); else next.add(inv);
      return next;
    });
  };

  const getPaymentStatus = (freightData: any) => {
    if (!freightData) return 'Unpaid';
    const totalAmount = (freightData.total_freight || 0) + (freightData.gst || 0) - (freightData.tds || 0);
    if (totalAmount <= 0) return 'Unpaid';
    const paid = paidAmountByFreightId[freightData.id] || 0;
    if (paid <= 0) return 'Unpaid';
    if (paid >= totalAmount) return 'Full Paid';
    return 'Partial Paid';
  };

  const getApprovalStatus = (freightData: any) => {
    if (!freightData) return 'pending';
    return freightData.status || 'pending';
  };

  const isClosed = (s: InvoiceSummary) => {
    const freightData = transporterFreightMap[s.invoice_number];
    return getApprovalStatus(freightData) === 'approved' && getPaymentStatus(freightData) === 'Full Paid';
  };

  const subTabFiltered = useMemo(() => {
    if (subTab === 'closed') return data.filter(s => isClosed(s));
    if (subTab === 'open') return data.filter(s => !isClosed(s));
    return data;
  }, [data, subTab, transporterFreightMap, paidAmountByFreightId]);

  const uniqueInvoices = useMemo(() => [...new Set(subTabFiltered.map(s => s.invoice_number))].sort(), [subTabFiltered]);
  const uniqueDates = useMemo(() => [...new Set(subTabFiltered.filter(s => s.invoice_date).map(s => s.invoice_date!))].sort(), [subTabFiltered]);
  const uniqueCustomers = useMemo(() => [...new Set(subTabFiltered.filter(s => s.customer_name).map(s => s.customer_name!))].sort(), [subTabFiltered]);
  const uniqueTransporters = useMemo(() => {
    const names = new Set<string>();
    subTabFiltered.forEach(s => {
      const f = transporterFreightMap[s.invoice_number];
      if (f?.transporters?.name) names.add(f.transporters.name);
    });
    return [...names].sort();
  }, [subTabFiltered, transporterFreightMap]);

  const filtered = useMemo(() => {
    return subTabFiltered.filter(s => {
      if (filterInvoice && s.invoice_number !== filterInvoice) return false;
      if (filterDate && s.invoice_date !== filterDate) return false;
      if (filterCustomer && s.customer_name !== filterCustomer) return false;
      const f = transporterFreightMap[s.invoice_number];
      if (filterTransporter && f?.transporters?.name !== filterTransporter) return false;
      if (filterApproval) {
        const approval = getApprovalStatus(f);
        if (filterApproval !== approval) return false;
      }
      if (filterPaymentStatus) {
        const ps = getPaymentStatus(f);
        if (filterPaymentStatus !== ps) return false;
      }
      if (filterSource) {
        const src = s.source_type === 'manual'
          ? (s.trip_type || 'Sales')
          : (s.source_type === 'purchase' ? 'Purchase' : 'Sales');
        if (filterSource !== src) return false;
      }
      return true;
    });
  }, [subTabFiltered, filterInvoice, filterDate, filterCustomer, filterTransporter, filterApproval, filterPaymentStatus, filterSource, transporterFreightMap, paidAmountByFreightId]);

  const totalFreight = filtered.reduce((s, r) => {
    const f = transporterFreightMap[r.invoice_number];
    return s + (f?.total_freight || 0) + (f?.gst || 0) - (f?.tds || 0);
  }, 0);

  const hasAnyFilter = filterInvoice || filterDate || filterCustomer || filterTransporter || filterApproval || filterPaymentStatus || filterSource;

  return (
    <div className="space-y-3">
      <Tabs value={subTab} onValueChange={v => setSubTab(v as any)}>
        <TabsList className="h-8">
          <TabsTrigger value="all" className="text-xs h-7 px-3">All ({data.length})</TabsTrigger>
          <TabsTrigger value="open" className="text-xs h-7 px-3">Open ({data.filter(s => !isClosed(s)).length})</TabsTrigger>
          <TabsTrigger value="closed" className="text-xs h-7 px-3">Closed ({data.filter(s => isClosed(s)).length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-4 text-sm flex-wrap">
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Invoices:</span>{' '}
          <span className="font-semibold">{filtered.length}</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Qty:</span>{' '}
          <span className="font-semibold font-mono-num">{filtered.reduce((s, r) => s + r.total_qty, 0).toFixed(2)} Kg</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Freight:</span>{' '}
          <span className="font-semibold font-mono-num">₹{totalFreight.toLocaleString('en-IN')}</span>
        </div>
        {hasAnyFilter && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
            setFilterInvoice(''); setFilterDate(''); setFilterCustomer(''); setFilterTransporter(''); setFilterApproval(''); setFilterPaymentStatus(''); setFilterSource('');
          }}>Clear Filters</Button>
        )}
        <Button size="sm" className="ml-auto gap-2 h-8" onClick={() => setAddTripOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Trip
        </Button>
        <Button variant="outline" size="sm" onClick={onDownload} className="gap-2 h-8">
          <Download className="h-3.5 w-3.5" /> Download Excel
        </Button>
      </div>

      {/* Add Manual Transporter Trip Dialog */}
      <Dialog open={addTripOpen} onOpenChange={(o) => { setAddTripOpen(o); if (!o) setTripForm({ trip_type: 'Sales', trip_date: new Date().toISOString().slice(0, 10), document_number: '', source_destination: '', quantity: '' }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Trip — Transporter</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Trip Type <span className="text-destructive">*</span></Label>
              <Select value={tripForm.trip_type} onValueChange={v => setTripForm(f => ({ ...f, trip_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Purchase">Purchase</SelectItem>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="Job Work">Job Work</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Trip Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={tripForm.trip_date} onChange={e => setTripForm(f => ({ ...f, trip_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Document Number (Inv. / Challan) <span className="text-destructive">*</span></Label>
              <Input value={tripForm.document_number} onChange={e => setTripForm(f => ({ ...f, document_number: e.target.value }))} placeholder="Enter invoice / challan #" maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tripForm.trip_type === 'Purchase' ? 'Source' : 'Destination'} <span className="text-destructive">*</span></Label>
              <Input value={tripForm.source_destination} onChange={e => setTripForm(f => ({ ...f, source_destination: e.target.value }))} placeholder="From / To" maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quantity (Kg) <span className="text-destructive">*</span></Label>
              <Input type="number" value={tripForm.quantity} onChange={e => setTripForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTripOpen(false)} disabled={submitting}>Cancel</Button>
            <Button
              disabled={submitting || !tripForm.trip_type || !tripForm.trip_date || !tripForm.document_number.trim() || !tripForm.source_destination.trim() || !tripForm.quantity || Number(tripForm.quantity) <= 0}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onAddManualTrip({
                    trip_type: tripForm.trip_type,
                    trip_date: tripForm.trip_date,
                    document_number: tripForm.document_number.trim(),
                    source_destination: tripForm.source_destination.trim(),
                    quantity: Number(tripForm.quantity),
                  });
                  setAddTripOpen(false);
                  setTripForm({ trip_type: 'Sales', trip_date: new Date().toISOString().slice(0, 10), document_number: '', source_destination: '', quantity: '' });
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? 'Saving…' : 'Add Trip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold w-8"></TableHead>
              <TableHead className="text-xs font-semibold">#</TableHead>
              <TableHead className="text-xs font-semibold">Invoice</TableHead>
              <TableHead className="text-xs font-semibold">Customer Name</TableHead>
              <TableHead className="text-xs font-semibold">Total Qty (Kg)</TableHead>
              <TableHead className="text-xs font-semibold">Purchase / Sales</TableHead>
              <TableHead className="text-xs font-semibold">Transporter Name</TableHead>
              <TableHead className="text-xs font-semibold">LR #</TableHead>
              <TableHead className="text-xs font-semibold">Total Amount (₹)</TableHead>
              <TableHead className="text-xs font-semibold">Paid Amount (₹)</TableHead>
              <TableHead className="text-xs font-semibold">Approval / Payment</TableHead>
              <TableHead className="text-xs font-semibold">Comments / Action</TableHead>
            </TableRow>
            {/* Filter row */}
            <TableRow>
              <TableHead></TableHead>
              <TableHead></TableHead>
              <TableHead>
                <div className="flex flex-col gap-1">
                  <Select value={filterDate} onValueChange={v => setFilterDate(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-6 text-[10px] w-[110px]"><SelectValue placeholder="Date" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Dates</SelectItem>
                      {uniqueDates.map(v => <SelectItem key={v} value={v}>{new Date(v).toLocaleDateString('en-IN')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterInvoice} onValueChange={v => setFilterInvoice(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-6 text-[10px] w-[110px]"><SelectValue placeholder="Invoice #" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Invoices</SelectItem>
                      {uniqueInvoices.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </TableHead>
              <TableHead>
                <Select value={filterCustomer} onValueChange={v => setFilterCustomer(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-6 text-[10px] w-[100px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {uniqueCustomers.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead></TableHead>
              <TableHead>
                <Select value={filterSource} onValueChange={v => setFilterSource(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-6 text-[10px] w-[80px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    <SelectItem value="Purchase">Purchase</SelectItem>
                    <SelectItem value="Sales">Sales</SelectItem>
                    <SelectItem value="Job Work">Job Work</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead>
                <Select value={filterTransporter} onValueChange={v => setFilterTransporter(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-6 text-[10px] w-[100px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {uniqueTransporters.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
              <TableHead>
                <div className="flex flex-col gap-1">
                  <Select value={filterApproval} onValueChange={v => setFilterApproval(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-6 text-[10px] w-[110px]"><SelectValue placeholder="Approval" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Approval</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="hold">Hold</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterPaymentStatus} onValueChange={v => setFilterPaymentStatus(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-6 text-[10px] w-[110px]"><SelectValue placeholder="Payment" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Payment</SelectItem>
                      <SelectItem value="Unpaid">Unpaid</SelectItem>
                      <SelectItem value="Partial Paid">Partial Paid</SelectItem>
                      <SelectItem value="Full Paid">Full Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  No transporter dispatches found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((s, idx) => {
              const freightData = transporterFreightMap[s.invoice_number];
              const isExpanded = expandedRows.has(s.invoice_number);
              const comments = freightData ? (commentsByFreightId[freightData.id] || []) : [];
              const payments = freightData ? (paymentsByFreightId[freightData.id] || []) : [];
              const paidAmount = freightData ? (paidAmountByFreightId[freightData.id] || 0) : 0;
              const totalAmount = freightData ? ((freightData.total_freight || 0) + (freightData.gst || 0) - (freightData.tds || 0)) : 0;
              const paymentStatus = getPaymentStatus(freightData);
              const approvalStatus = getApprovalStatus(freightData);

              return (
                <>
                  <TableRow key={s.invoice_number} className="cursor-pointer" onClick={() => toggleRow(s.invoice_number)}>
                    <TableCell className="text-sm px-2">
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col leading-tight">
                        <span className="text-xs text-muted-foreground">{s.invoice_date ? new Date(s.invoice_date).toLocaleDateString('en-IN') : '-'}</span>
                        <span className="font-medium">{s.invoice_number}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{s.customer_name || '-'}</TableCell>
                    <TableCell className="text-sm font-mono-num">{s.total_qty.toFixed(2)}</TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        const label = s.source_type === 'manual'
                          ? (s.trip_type || 'Sales')
                          : (s.source_type === 'purchase' ? 'Purchase' : 'Sales');
                        const cls = label === 'Purchase'
                          ? 'bg-blue-100 text-blue-700'
                          : label === 'Job Work'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700';
                        return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
                      })()}
                    </TableCell>
                    <TableCell className="text-sm">{freightData?.transporters?.name || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-sm">{freightData?.lr_number || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-sm">
                      {totalAmount > 0 ? (
                        <span className="font-mono-num">₹{totalAmount.toLocaleString('en-IN')}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <span className="font-mono-num">{paidAmount > 0 ? `₹${paidAmount.toLocaleString('en-IN')}` : '-'}</span>
                        {freightData && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onAddPayment(freightData.id, s.invoice_number)}>
                            <IndianRupee className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm" onClick={e => e.stopPropagation()}>
                      <div className="flex flex-col gap-1">
                        {freightData ? (
                          isAdmin ? (
                            <Select value={approvalStatus} onValueChange={v => onStatusChange(freightData.id, v)}>
                              <SelectTrigger className={`h-6 text-[11px] w-[110px] ${
                                approvalStatus === 'approved' ? 'border-green-500 text-green-700 bg-green-50' :
                                approvalStatus === 'hold' ? 'border-amber-500 text-amber-700 bg-amber-50' :
                                'border-orange-400 text-orange-600 bg-orange-50'
                              }`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="approved">Approved</SelectItem>
                                <SelectItem value="hold">Hold</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full text-center ${
                              approvalStatus === 'approved' ? 'bg-green-100 text-green-700' :
                              approvalStatus === 'hold' ? 'bg-amber-100 text-amber-700' :
                              'bg-orange-100 text-orange-600'
                            }`}>
                              {approvalStatus.charAt(0).toUpperCase() + approvalStatus.slice(1)}
                            </span>
                          )
                        ) : (
                          <span className="text-[11px] text-muted-foreground">-</span>
                        )}
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full text-center ${
                          paymentStatus === 'Full Paid' ? 'bg-green-100 text-green-700' :
                          paymentStatus === 'Partial Paid' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {paymentStatus}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm" onClick={e => e.stopPropagation()}>
                      <div className="flex flex-col gap-1 items-start">
                        {freightData ? (
                          <Button variant="outline" size="sm" className="h-6 text-xs gap-1 w-full justify-start" onClick={() => onAddComment(freightData.id)}>
                            <Plus className="h-3 w-3" /> Comment ({comments.length})
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No comments</span>
                        )}
                        <div className="flex items-center gap-1 w-full">
                          <Button
                            variant={freightData ? 'outline' : 'default'}
                            size="sm"
                            className="h-6 text-xs gap-1 flex-1"
                            onClick={() => onOpenFreightDialog(s.invoice_number)}
                          >
                            <Truck className="h-3 w-3" />
                            {freightData ? 'Edit' : 'Add Freight'}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 text-xs px-1.5 text-muted-foreground hover:text-foreground" onClick={() => onMoveBack(s.invoice_number)}>
                            ←
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${s.invoice_number}-detail`}>
                      <TableCell colSpan={12} className="bg-muted/30 p-4">
                        <div className="space-y-3">
                          {freightData?.lr_number && (
                            <div className="text-sm">
                              <span className="text-muted-foreground font-medium">LR Number:</span>{' '}
                              <span className="font-semibold">{freightData.lr_number}</span>
                            </div>
                          )}
                          {freightData && totalAmount > 0 && (
                            <div className="flex items-center gap-6 text-sm flex-wrap">
                              <div>
                                <span className="text-muted-foreground font-medium">Basic Freight:</span>{' '}
                                <span className="font-semibold font-mono-num">₹{(freightData.total_freight || 0).toLocaleString('en-IN')}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground font-medium">GST:</span>{' '}
                                <span className="font-semibold font-mono-num">₹{(freightData.gst || 0).toLocaleString('en-IN')}</span>
                              </div>
                              {(freightData.tds || 0) > 0 && (
                                <div>
                                  <span className="text-muted-foreground font-medium">TDS:</span>{' '}
                                  <span className="font-semibold font-mono-num text-red-600">-₹{(freightData.tds || 0).toLocaleString('en-IN')}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-muted-foreground font-medium">Total:</span>{' '}
                                <span className="font-semibold font-mono-num">₹{totalAmount.toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm text-muted-foreground font-medium">Payment Details</span>
                              <span className="text-xs text-muted-foreground">(Paid: ₹{paidAmount.toLocaleString('en-IN')} / ₹{totalAmount.toLocaleString('en-IN')})</span>
                            </div>
                            {payments.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">No payments recorded.</p>
                            ) : (
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {payments.map((p: any) => (
                                  <div key={p.id} className="bg-background rounded-md border px-3 py-1.5 text-sm flex items-center justify-between">
                                    <span className="font-mono-num font-medium">₹{(p.amount || 0).toLocaleString('en-IN')}</span>
                                    <span className="text-xs text-muted-foreground">{p.user_email} — {new Date(p.created_at).toLocaleString('en-IN')}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm text-muted-foreground font-medium">User Comments</span>
                              {freightData && (
                                <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => onAddComment(freightData.id)}>
                                  <Plus className="h-3 w-3" /> Add
                                </Button>
                              )}
                            </div>
                            {comments.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">No comments yet.</p>
                            ) : (
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {comments.map((c: any) => (
                                  <div key={c.id} className="bg-background rounded-md border px-3 py-2 text-sm">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium text-xs">{c.user_email}</span>
                                      <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString('en-IN')}</span>
                                    </div>
                                    <p className="text-sm">{c.comment}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {s.purchaseBatches && s.purchaseBatches.length > 0 && (
                            <div>
                              <span className="text-sm text-muted-foreground font-medium mb-1 block">Batch Details ({s.purchaseBatches.length})</span>
                              <div className="overflow-x-auto rounded border">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/40">
                                      <TableHead className="text-[10px] font-semibold">Batch No.</TableHead>
                                      <TableHead className="text-[10px] font-semibold">Purchase Date</TableHead>
                                      <TableHead className="text-[10px] font-semibold">Supplier</TableHead>
                                      <TableHead className="text-[10px] font-semibold">Material</TableHead>
                                      <TableHead className="text-[10px] font-semibold">Weight (Kg)</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {s.purchaseBatches.map(b => (
                                      <TableRow key={b.batch_number}>
                                        <TableCell className="text-xs">{b.batch_number}</TableCell>
                                        <TableCell className="text-xs">{b.purchase_date ? new Date(b.purchase_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                                        <TableCell className="text-xs">{b.purchase_from || '-'}</TableCell>
                                        <TableCell className="text-xs">{b.material || '-'}</TableCell>
                                        <TableCell className="text-xs font-mono-num">{b.gross_weight.toFixed(2)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ── Generic Dispatch Table (for All Dispatches, Ex-Sales, Areca tabs) ── */
function DispatchTable({
  data,
  showDispatchType,
  onDispatchTypeChange,
  showMoveBack,
  onMoveBack,
  onDownload,
  showSourceColumn,
}: {
  data: (InvoiceSummary & { purchaseBatches?: PurchaseSummary[] })[];
  showDispatchType?: boolean;
  onDispatchTypeChange?: (invoice: string, type: string) => void;
  showMoveBack?: boolean;
  onMoveBack?: (invoice: string, item?: InvoiceSummary & { purchaseBatches?: PurchaseSummary[] }) => void;
  onDownload: () => void;
  showSourceColumn?: boolean;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRow = (inv: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(inv)) next.delete(inv); else next.add(inv);
      return next;
    });
  };

  // Check if any row has details to show
  const hasExpandableData = data.some(s => s.purchaseBatches?.length || (s.source_type === 'sales' && s.order_id));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm">
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Invoices:</span>{' '}
          <span className="font-semibold">{data.length}</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Qty:</span>{' '}
          <span className="font-semibold font-mono-num">{data.reduce((s, r) => s + r.total_qty, 0).toFixed(2)} Kg</span>
        </div>
        <Button variant="outline" size="sm" onClick={onDownload} className="ml-auto gap-2 h-8">
          <Download className="h-3.5 w-3.5" /> Download Excel
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {hasExpandableData && <TableHead className="text-xs font-semibold w-8"></TableHead>}
              <TableHead className="text-xs font-semibold">#</TableHead>
              <TableHead className="text-xs font-semibold">Invoice Number</TableHead>
              <TableHead className="text-xs font-semibold">Invoice Date</TableHead>
              {!showSourceColumn && <TableHead className="text-xs font-semibold">Order ID</TableHead>}
              <TableHead className="text-xs font-semibold">Customer Name</TableHead>
              <TableHead className="text-xs font-semibold">Total Qty (Kg)</TableHead>
              {showSourceColumn && <TableHead className="text-xs font-semibold">Purchase / Sales</TableHead>}
              <TableHead className="text-xs font-semibold">
                {showDispatchType ? 'Dispatch Type' : 'Action'}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={hasExpandableData ? 9 : 8} className="text-center text-muted-foreground py-8">
                  No dispatches found.
                </TableCell>
              </TableRow>
            )}
            {data.map((s, idx) => {
              const isExpanded = expandedRows.has(s.invoice_number);
              const hasDetails = s.purchaseBatches?.length || (s.source_type === 'sales' && s.order_id);

              return (
                <>
                  <TableRow
                    key={s.invoice_number}
                    className={hasDetails ? 'cursor-pointer' : ''}
                    onClick={() => hasDetails && toggleRow(s.invoice_number)}
                  >
                    {hasExpandableData && (
                      <TableCell className="text-sm px-2">
                        {hasDetails ? (
                          isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : null}
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="text-sm font-medium">{s.invoice_number}</TableCell>
                    <TableCell className="text-sm">{s.invoice_date ? new Date(s.invoice_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                    {!showSourceColumn && <TableCell className="text-sm">{s.order_id || '-'}</TableCell>}
                    <TableCell className="text-sm">{s.customer_name || '-'}</TableCell>
                    <TableCell className="text-sm font-mono-num">{s.total_qty.toFixed(2)}</TableCell>
                    {showSourceColumn && (
                      <TableCell className="text-sm">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          s.source_type === 'purchase' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {s.source_type === 'purchase' ? 'Purchase' : 'Sales'}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-sm" onClick={e => e.stopPropagation()}>
                      {showDispatchType && onDispatchTypeChange ? (
                        <Select
                          value={s.dispatch_type || ''}
                          onValueChange={v => onDispatchTypeChange(s.invoice_number, v)}
                        >
                          <SelectTrigger className="h-7 text-xs w-[130px]">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {DISPATCH_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : showMoveBack && onMoveBack ? (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => onMoveBack(s.invoice_number, s)}>
                          ← Move Back
                        </Button>
                      ) : (
                        <span>{s.dispatch_type || '-'}</span>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && hasDetails && (
                    <TableRow key={`${s.invoice_number}-detail`}>
                      <TableCell colSpan={hasExpandableData ? 9 : 8} className="bg-muted/30 p-4">
                        <div className="space-y-2">
                          {s.source_type === 'sales' && s.order_id && (
                            <div className="text-sm">
                              <span className="text-muted-foreground font-medium">Order ID:</span> {s.order_id}
                              {s.customer_name && <> · <span className="text-muted-foreground font-medium">Customer:</span> {s.customer_name}</>}
                            </div>
                          )}
                          {s.purchaseBatches && s.purchaseBatches.length > 0 && (
                            <div>
                              <span className="text-sm text-muted-foreground font-medium mb-1 block">Batch Details ({s.purchaseBatches.length})</span>
                              <div className="overflow-x-auto rounded border">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/40">
                                      <TableHead className="text-[10px] font-semibold">Batch No.</TableHead>
                                      <TableHead className="text-[10px] font-semibold">Purchase Date</TableHead>
                                      <TableHead className="text-[10px] font-semibold">Supplier</TableHead>
                                      <TableHead className="text-[10px] font-semibold">Material</TableHead>
                                      <TableHead className="text-[10px] font-semibold">Weight (Kg)</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {s.purchaseBatches.map(b => (
                                      <TableRow key={b.batch_number}>
                                        <TableCell className="text-xs">{b.batch_number}</TableCell>
                                        <TableCell className="text-xs">{b.purchase_date ? new Date(b.purchase_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                                        <TableCell className="text-xs">{b.purchase_from || '-'}</TableCell>
                                        <TableCell className="text-xs">{b.material || '-'}</TableCell>
                                        <TableCell className="text-xs font-mono-num">{b.gross_weight.toFixed(2)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default FreightPage;
