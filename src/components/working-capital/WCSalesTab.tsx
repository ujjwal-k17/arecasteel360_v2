import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useInvoiceDetails, useUpsertInvoiceDetail } from '@/hooks/useWorkingCapital';

interface InvoiceRow {
  invoice_number: string;
  sales_date: string | null;
  customer_name: string | null;
  gst_number: string | null;
  order_id: string | null;
  qty: number;
  source: string;
}

export default function WCSalesTab() {
  const queryClient = useQueryClient();
  const { data: invoiceDetails } = useInvoiceDetails();
  const upsertInvoice = useUpsertInvoiceDetail();

  // Editing state: invoice_number -> { amount, credit_period }
  const [editing, setEditing] = useState<Record<string, { amount: string; credit_period: string }>>({});

  // Fetch coil sales
  const { data: inventoryActions } = useQuery({
    queryKey: ['wc_inventory_actions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_actions')
        .select('*, batches(*)')
        .in('action_type', ['pack_coil_sale', 'loose_coil_sale', 'sales'])
        .order('sales_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch FG sales
  const { data: fgSales } = useQuery({
    queryKey: ['wc_fg_sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fg_sales')
        .select('*, fg_items(*)')
        .order('sales_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch orders with customers
  const { data: orders } = useQuery({
    queryKey: ['wc_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(customer_name, gst_number)');
      if (error) throw error;
      return data;
    },
  });

  const orderMap = useMemo(() => {
    const map: Record<string, { customer_name: string; gst_number: string | null }> = {};
    (orders || []).forEach((o: any) => {
      if (o.customers) {
        map[o.order_number] = { customer_name: o.customers.customer_name, gst_number: o.customers.gst_number };
      }
    });
    return map;
  }, [orders]);

  const invoiceDetailMap = useMemo(() => {
    const map: Record<string, { invoice_amount: number; credit_period: number }> = {};
    (invoiceDetails || []).forEach((d: any) => {
      map[d.invoice_number] = { invoice_amount: d.invoice_amount || 0, credit_period: d.credit_period || 0 };
    });
    return map;
  }, [invoiceDetails]);

  // Build unique invoice list
  const invoices = useMemo(() => {
    const map: Record<string, InvoiceRow> = {};

    (inventoryActions || []).forEach((a: any) => {
      const inv = a.invoice_number;
      if (!inv) return;
      const cust = a.order_id ? orderMap[a.order_id] : null;
      if (!map[inv]) {
        map[inv] = {
          invoice_number: inv,
          sales_date: a.sales_date,
          customer_name: cust?.customer_name || null,
          gst_number: cust?.gst_number || null,
          order_id: a.order_id,
          qty: 0,
          source: 'Coil',
        };
      }
      map[inv].qty += a.net_weight || 0;
    });

    (fgSales || []).forEach((s: any) => {
      const inv = s.invoice_number;
      if (!inv) return;
      const cust = s.order_id ? orderMap[s.order_id] : null;
      if (!map[inv]) {
        map[inv] = {
          invoice_number: inv,
          sales_date: s.sales_date,
          customer_name: cust?.customer_name || null,
          gst_number: cust?.gst_number || null,
          order_id: s.order_id,
          qty: 0,
          source: 'FG',
        };
      }
      map[inv].qty += s.quantity || 0;
    });

    return Object.values(map).sort((a, b) => {
      if (!a.sales_date) return 1;
      if (!b.sales_date) return -1;
      return b.sales_date.localeCompare(a.sales_date);
    });
  }, [inventoryActions, fgSales, orderMap]);

  // Split into updated and pending
  const updatedInvoices = useMemo(() => invoices.filter(i => invoiceDetailMap[i.invoice_number]), [invoices, invoiceDetailMap]);
  const pendingInvoices = useMemo(() => invoices.filter(i => !invoiceDetailMap[i.invoice_number]), [invoices, invoiceDetailMap]);

  const startEdit = (invNo: string) => {
    const existing = invoiceDetailMap[invNo];
    setEditing(prev => ({
      ...prev,
      [invNo]: {
        amount: existing?.invoice_amount?.toString() || '',
        credit_period: existing?.credit_period?.toString() || '0',
      },
    }));
  };

  const handleSave = async (invNo: string) => {
    const e = editing[invNo];
    if (!e) return;
    const amount = parseFloat(e.amount);
    const cp = parseInt(e.credit_period) || 0;
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid invoice amount');
      return;
    }
    await upsertInvoice.mutateAsync({ invoice_number: invNo, invoice_amount: amount, credit_period: cp });
    setEditing(prev => {
      const n = { ...prev };
      delete n[invNo];
      return n;
    });
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['wc_inventory_actions'] });
    queryClient.invalidateQueries({ queryKey: ['wc_fg_sales'] });
    queryClient.invalidateQueries({ queryKey: ['wc_orders'] });
    queryClient.invalidateQueries({ queryKey: ['invoice_details'] });
    toast.success('Refreshed');
  };

  const renderTable = (rows: InvoiceRow[], showActions: boolean) => (
    <div className="overflow-x-auto rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-semibold">Invoice Number</TableHead>
            <TableHead className="text-xs font-semibold">Invoice Date</TableHead>
            <TableHead className="text-xs font-semibold">Customer Name</TableHead>
            <TableHead className="text-xs font-semibold">GST Number</TableHead>
            <TableHead className="text-xs font-semibold">Qty (Kg)</TableHead>
            {showActions && <TableHead className="text-xs font-semibold">Invoice Amount (₹)</TableHead>}
            {showActions && <TableHead className="text-xs font-semibold">Credit Period (Days)</TableHead>}
            {!showActions && <TableHead className="text-xs font-semibold">Invoice Amount (₹)</TableHead>}
            {!showActions && <TableHead className="text-xs font-semibold">Credit Period</TableHead>}
            {showActions && <TableHead className="text-xs font-semibold">Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={showActions ? 8 : 7} className="text-center text-muted-foreground py-8">
                No invoices found.
              </TableCell>
            </TableRow>
          )}
          {rows.map(inv => {
            const isEditing = !!editing[inv.invoice_number];
            const detail = invoiceDetailMap[inv.invoice_number];
            return (
              <TableRow key={inv.invoice_number}>
                <TableCell className="text-sm font-medium">{inv.invoice_number}</TableCell>
                <TableCell className="text-sm">{inv.sales_date ? new Date(inv.sales_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                <TableCell className="text-sm">{inv.customer_name || '-'}</TableCell>
                <TableCell className="text-sm">{inv.gst_number || '-'}</TableCell>
                <TableCell className="text-sm font-mono">{inv.qty.toFixed(2)}</TableCell>
                {showActions ? (
                  <>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          className="h-8 w-32 text-sm"
                          value={editing[inv.invoice_number]?.amount || ''}
                          onChange={e => setEditing(prev => ({ ...prev, [inv.invoice_number]: { ...prev[inv.invoice_number], amount: e.target.value } }))}
                          placeholder="Amount"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          className="h-8 w-24 text-sm"
                          value={editing[inv.invoice_number]?.credit_period || ''}
                          onChange={e => setEditing(prev => ({ ...prev, [inv.invoice_number]: { ...prev[inv.invoice_number], credit_period: e.target.value } }))}
                          placeholder="Days"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Button size="sm" variant="default" className="h-7 gap-1" onClick={() => handleSave(inv.invoice_number)} disabled={upsertInvoice.isPending}>
                          <Check className="h-3.5 w-3.5" /> Save
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7" onClick={() => startEdit(inv.invoice_number)}>
                          Update
                        </Button>
                      )}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="text-sm font-mono">₹{(detail?.invoice_amount || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-sm">{detail?.credit_period || 0} days</TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6 mt-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          {pendingInvoices.length} pending · {updatedInvoices.length} updated
        </div>
      </div>

      {pendingInvoices.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Pending Invoices (Update to move to Customer View)</h3>
          {renderTable(pendingInvoices, true)}
        </div>
      )}

      {updatedInvoices.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Updated Invoices</h3>
          {renderTable(updatedInvoices, false)}
        </div>
      )}
    </div>
  );
}
