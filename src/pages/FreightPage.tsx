import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RefreshCw, Download, Truck, ChevronDown, ChevronUp, Plus, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { FreightDetailsDialog } from '@/components/freight/FreightDetailsDialog';

const DISPATCH_TYPES = ['Ex-Sales', 'Transporter', 'Areca 0720', 'Areca 2720'] as const;

interface InvoiceSummary {
  invoice_number: string;
  invoice_date: string | null;
  order_id: string | null;
  customer_name: string | null;
  total_qty: number;
  dispatch_type: string | null;
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
      return {
        invoice_number: inv,
        invoice_date: data.invoice_date,
        order_id: orderInfo?.order_number || firstOrderId,
        customer_name: orderInfo?.customer_name || null,
        total_qty: data.total_qty,
        dispatch_type: invoiceDetailMap[inv]?.dispatch_type || null,
      };
    }).sort((a, b) => {
      if (!a.invoice_date) return 1;
      if (!b.invoice_date) return -1;
      return b.invoice_date.localeCompare(a.invoice_date);
    });
  }, [inventoryActions, fgSales, defectiveSales, orderMap, invoiceDetailMap]);

  const filteredSummaries = useMemo(() => {
    return invoiceSummaries.filter(s => {
      if (!s.invoice_date) return !dateFrom && !dateTo;
      if (dateFrom && s.invoice_date < dateFrom) return false;
      if (dateTo && s.invoice_date > dateTo) return false;
      return true;
    });
  }, [invoiceSummaries, dateFrom, dateTo]);

  const updateDispatchType = useMutation({
    mutationFn: async ({ invoice_number, dispatch_type }: { invoice_number: string; dispatch_type: string | null }) => {
      const existing = invoiceDetailMap[invoice_number];
      if (existing) {
        const { error } = await supabase.from('invoice_details').update({ dispatch_type }).eq('invoice_number', invoice_number);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('invoice_details').insert({ invoice_number, dispatch_type });
        if (error) throw error;
      }

      // If moving back from Transporter (dispatch_type is null), reset transporter freight data
      if (!dispatch_type) {
        const freightRecord = (transporterFreightMap || {})[invoice_number];
        if (freightRecord) {
          // Delete cascades to comments and payments via FK
          await supabase.from('transporter_freight').delete().eq('id', freightRecord.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freight_invoice_details'] });
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_map'] });
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_comments'] });
      queryClient.invalidateQueries({ queryKey: ['transporter_freight_payments'] });
      toast.success('Dispatch type updated');
    },
    onError: () => toast.error('Failed to update dispatch type'),
  });

  const saveFreightDetails = useMutation({
    mutationFn: async (data: { invoice_number: string; transporter_id: string; total_freight: number; gst: number }) => {
      const existing = (transporterFreightMap || {})[data.invoice_number];
      if (existing) {
        const { error } = await supabase.from('transporter_freight')
          .update({ transporter_id: data.transporter_id, total_freight: data.total_freight, gst: data.gst })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('transporter_freight')
          .insert({ invoice_number: data.invoice_number, transporter_id: data.transporter_id, total_freight: data.total_freight, gst: data.gst });
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
      // Get freight record to check total amount
      const freightRecord = Object.values(transporterFreightMap || {}).find((r: any) => r.id === transporter_freight_id) as any;
      if (freightRecord) {
        const totalAmount = (freightRecord.total_freight || 0) + (freightRecord.gst || 0);
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
    ['freight_inv_actions', 'freight_fg_sales', 'freight_defective_sales', 'freight_orders', 'freight_invoice_details', 'transporter_freight_map', 'transporters_list', 'transporter_freight_comments', 'transporter_freight_payments'].forEach(k =>
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
      'Dispatch Type': s.dispatch_type || '-',
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
        <TabsList>
          <TabsTrigger value="all-dispatches">All Dispatches</TabsTrigger>
          <TabsTrigger value="ex-sales">Ex-Sales</TabsTrigger>
          <TabsTrigger value="transporter">Transporter</TabsTrigger>
          <TabsTrigger value="areca-trucks">Areca Trucks</TabsTrigger>
        </TabsList>

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

        <TabsContent value="all-dispatches">
          <DispatchTable
            data={filteredSummaries.filter(s => !s.dispatch_type)}
            showDispatchType
            onDispatchTypeChange={(inv, type) => updateDispatchType.mutate({ invoice_number: inv, dispatch_type: type })}
            onDownload={() => handleDownload(filteredSummaries.filter(s => !s.dispatch_type), 'All Dispatches')}
          />
        </TabsContent>
        <TabsContent value="ex-sales">
          <DispatchTable
            data={filteredSummaries.filter(s => s.dispatch_type === 'Ex-Sales')}
            showMoveBack
            onMoveBack={(inv) => updateDispatchType.mutate({ invoice_number: inv, dispatch_type: null })}
            onDownload={() => handleDownload(filteredSummaries.filter(s => s.dispatch_type === 'Ex-Sales'), 'Ex-Sales')}
          />
        </TabsContent>
        <TabsContent value="transporter">
          <TransporterDispatchTable
            data={filteredSummaries.filter(s => s.dispatch_type === 'Transporter')}
            isAdmin={isAdmin}
            onMoveBack={(inv) => updateDispatchType.mutate({ invoice_number: inv, dispatch_type: null })}
            transporterFreightMap={transporterFreightMap || {}}
            commentsByFreightId={commentsByFreightId}
            paymentsByFreightId={paymentsByFreightId}
            paidAmountByFreightId={paidAmountByFreightId}
            onOpenFreightDialog={(inv) => setFreightDialog({ open: true, invoice: inv })}
            onStatusChange={(id, status) => updateFreightStatus.mutate({ id, status })}
            onAddComment={(freightId) => setCommentDialog({ open: true, freightId, comment: '' })}
            onAddPayment={(freightId, invoiceNumber) => setPaymentDialog({ open: true, freightId, amount: '', invoiceNumber })}
            onDownload={() => handleDownload(filteredSummaries.filter(s => s.dispatch_type === 'Transporter'), 'Transporter')}
          />
        </TabsContent>
        <TabsContent value="areca-trucks">
          <Tabs defaultValue="areca-0720" className="mt-2">
            <TabsList>
              <TabsTrigger value="areca-0720">UP14KT0750</TabsTrigger>
              <TabsTrigger value="areca-2720">UP14QT2750</TabsTrigger>
            </TabsList>
            <TabsContent value="areca-0720">
              <DispatchTable
                data={filteredSummaries.filter(s => s.dispatch_type === 'Areca 0720')}
                showMoveBack
                onMoveBack={(inv) => updateDispatchType.mutate({ invoice_number: inv, dispatch_type: null })}
                onDownload={() => handleDownload(filteredSummaries.filter(s => s.dispatch_type === 'Areca 0720'), 'UP14KT0750')}
              />
            </TabsContent>
            <TabsContent value="areca-2720">
              <DispatchTable
                data={filteredSummaries.filter(s => s.dispatch_type === 'Areca 2720')}
                showMoveBack
                onMoveBack={(inv) => updateDispatchType.mutate({ invoice_number: inv, dispatch_type: null })}
                onDownload={() => handleDownload(filteredSummaries.filter(s => s.dispatch_type === 'Areca 2720'), 'UP14QT2750')}
              />
            </TabsContent>
          </Tabs>
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
            const totalAmount = freightRecord ? ((freightRecord.total_freight || 0) + (freightRecord.gst || 0)) : 0;
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
}: {
  data: InvoiceSummary[];
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
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [subTab, setSubTab] = useState<'all' | 'open' | 'closed'>('all');
  const [filterInvoice, setFilterInvoice] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterTransporter, setFilterTransporter] = useState('');
  const [filterApproval, setFilterApproval] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('');

  const toggleRow = (inv: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(inv)) next.delete(inv); else next.add(inv);
      return next;
    });
  };

  const getPaymentStatus = (freightData: any) => {
    if (!freightData) return 'Unpaid';
    const totalAmount = (freightData.total_freight || 0) + (freightData.gst || 0);
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

  // Apply sub-tab filter
  const subTabFiltered = useMemo(() => {
    if (subTab === 'closed') return data.filter(s => isClosed(s));
    if (subTab === 'open') return data.filter(s => !isClosed(s));
    return data;
  }, [data, subTab, transporterFreightMap, paidAmountByFreightId]);

  // Unique values for filters
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

  // Apply column filters
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
      return true;
    });
  }, [subTabFiltered, filterInvoice, filterDate, filterCustomer, filterTransporter, filterApproval, filterPaymentStatus, transporterFreightMap, paidAmountByFreightId]);

  const totalFreight = filtered.reduce((s, r) => {
    const f = transporterFreightMap[r.invoice_number];
    return s + (f?.total_freight || 0) + (f?.gst || 0);
  }, 0);

  const hasAnyFilter = filterInvoice || filterDate || filterCustomer || filterTransporter || filterApproval || filterPaymentStatus;

  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
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
            setFilterInvoice(''); setFilterDate(''); setFilterCustomer(''); setFilterTransporter(''); setFilterApproval(''); setFilterPaymentStatus('');
          }}>Clear Filters</Button>
        )}
        <Button variant="outline" size="sm" onClick={onDownload} className="ml-auto gap-2 h-8">
          <Download className="h-3.5 w-3.5" /> Download Excel
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold w-8"></TableHead>
              <TableHead className="text-xs font-semibold">#</TableHead>
              <TableHead className="text-xs font-semibold">Invoice Number</TableHead>
              <TableHead className="text-xs font-semibold">Invoice Date</TableHead>
              <TableHead className="text-xs font-semibold">Customer Name</TableHead>
              <TableHead className="text-xs font-semibold">Total Qty (Kg)</TableHead>
              <TableHead className="text-xs font-semibold">Transporter Name</TableHead>
              <TableHead className="text-xs font-semibold">Total Amount (₹)</TableHead>
              <TableHead className="text-xs font-semibold">Approval</TableHead>
              <TableHead className="text-xs font-semibold">Paid Amount (₹)</TableHead>
              <TableHead className="text-xs font-semibold">Payment Status</TableHead>
              <TableHead className="text-xs font-semibold">Comments</TableHead>
              <TableHead className="text-xs font-semibold">Action</TableHead>
            </TableRow>
            {/* Filter row */}
            <TableRow>
              <TableHead></TableHead>
              <TableHead></TableHead>
              <TableHead>
                <Select value={filterInvoice} onValueChange={v => setFilterInvoice(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-6 text-[10px] w-[100px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {uniqueInvoices.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead>
                <Select value={filterDate} onValueChange={v => setFilterDate(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-6 text-[10px] w-[100px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {uniqueDates.map(v => <SelectItem key={v} value={v}>{new Date(v).toLocaleDateString('en-IN')}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                <Select value={filterTransporter} onValueChange={v => setFilterTransporter(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-6 text-[10px] w-[100px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {uniqueTransporters.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead></TableHead>
              <TableHead>
                <Select value={filterApproval} onValueChange={v => setFilterApproval(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-6 text-[10px] w-[90px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="hold">Hold</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead></TableHead>
              <TableHead>
                <Select value={filterPaymentStatus} onValueChange={v => setFilterPaymentStatus(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-6 text-[10px] w-[90px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    <SelectItem value="Unpaid">Unpaid</SelectItem>
                    <SelectItem value="Partial Paid">Partial Paid</SelectItem>
                    <SelectItem value="Full Paid">Full Paid</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
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
              const totalAmount = freightData ? ((freightData.total_freight || 0) + (freightData.gst || 0)) : 0;
              const paymentStatus = getPaymentStatus(freightData);
              const approvalStatus = getApprovalStatus(freightData);

              return (
                <>
                  <TableRow key={s.invoice_number} className="cursor-pointer" onClick={() => toggleRow(s.invoice_number)}>
                    <TableCell className="text-sm px-2">
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="text-sm font-medium">{s.invoice_number}</TableCell>
                    <TableCell className="text-sm">{s.invoice_date ? new Date(s.invoice_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                    <TableCell className="text-sm">{s.customer_name || '-'}</TableCell>
                    <TableCell className="text-sm font-mono-num">{s.total_qty.toFixed(2)}</TableCell>
                    <TableCell className="text-sm">{freightData?.transporters?.name || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-sm">
                      {totalAmount > 0 ? (
                        <span className="font-mono-num">₹{totalAmount.toLocaleString('en-IN')}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm" onClick={e => e.stopPropagation()}>
                      {freightData ? (
                        isAdmin ? (
                          <Select value={approvalStatus} onValueChange={v => onStatusChange(freightData.id, v)}>
                            <SelectTrigger className={`h-7 text-xs w-[100px] ${
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
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            approvalStatus === 'approved' ? 'bg-green-100 text-green-700' :
                            approvalStatus === 'hold' ? 'bg-amber-100 text-amber-700' :
                            'bg-orange-100 text-orange-600'
                          }`}>
                            {approvalStatus.charAt(0).toUpperCase() + approvalStatus.slice(1)}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
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
                    <TableCell className="text-sm">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        paymentStatus === 'Full Paid' ? 'bg-green-100 text-green-700' :
                        paymentStatus === 'Partial Paid' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {paymentStatus}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm" onClick={e => e.stopPropagation()}>
                      {freightData ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">{comments.length}</span>
                          <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => onAddComment(freightData.id)}>
                            <Plus className="h-3 w-3" /> Add
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button
                          variant={freightData ? 'outline' : 'default'}
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => onOpenFreightDialog(s.invoice_number)}
                        >
                          <Truck className="h-3.5 w-3.5" />
                          {freightData ? 'Edit' : 'Add Freight'}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => onMoveBack(s.invoice_number)}>
                          ← Back
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${s.invoice_number}-detail`}>
                      <TableCell colSpan={13} className="bg-muted/30 p-4">
                        <div className="space-y-3">
                          {/* Freight Details */}
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
                              <div>
                                <span className="text-muted-foreground font-medium">Total:</span>{' '}
                                <span className="font-semibold font-mono-num">₹{totalAmount.toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          )}

                          {/* Payment Details */}
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

                          {/* User Comments */}
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

/* ── Generic Dispatch Table (for All Dispatches, Areca tabs) ── */
function DispatchTable({
  data,
  showDispatchType,
  onDispatchTypeChange,
  showMoveBack,
  onMoveBack,
  onDownload,
}: {
  data: InvoiceSummary[];
  showDispatchType?: boolean;
  onDispatchTypeChange?: (invoice: string, type: string) => void;
  showMoveBack?: boolean;
  onMoveBack?: (invoice: string) => void;
  onDownload: () => void;
}) {
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
              <TableHead className="text-xs font-semibold">#</TableHead>
              <TableHead className="text-xs font-semibold">Invoice Number</TableHead>
              <TableHead className="text-xs font-semibold">Invoice Date</TableHead>
              <TableHead className="text-xs font-semibold">Order ID</TableHead>
              <TableHead className="text-xs font-semibold">Customer Name</TableHead>
              <TableHead className="text-xs font-semibold">Total Qty (Kg)</TableHead>
              <TableHead className="text-xs font-semibold">
                {showDispatchType ? 'Dispatch Type' : 'Action'}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No dispatches found.
                </TableCell>
              </TableRow>
            )}
            {data.map((s, idx) => (
              <TableRow key={s.invoice_number}>
                <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                <TableCell className="text-sm font-medium">{s.invoice_number}</TableCell>
                <TableCell className="text-sm">{s.invoice_date ? new Date(s.invoice_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                <TableCell className="text-sm">{s.order_id || '-'}</TableCell>
                <TableCell className="text-sm">{s.customer_name || '-'}</TableCell>
                <TableCell className="text-sm font-mono-num">{s.total_qty.toFixed(2)}</TableCell>
                <TableCell className="text-sm">
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
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : showMoveBack && onMoveBack ? (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => onMoveBack(s.invoice_number)}>
                      ← Move Back
                    </Button>
                  ) : (
                    <span>{s.dispatch_type || '-'}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default FreightPage;
