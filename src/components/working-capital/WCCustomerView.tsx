import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useInvoiceDetails, useInwardPayments } from '@/hooks/useWorkingCapital';

interface InvoiceInfo {
  invoice_number: string;
  sales_date: string | null;
  customer_name: string;
  customer_id: string;
  gst_number: string | null;
  invoice_amount: number;
  credit_period: number;
  due_date: string | null;
}

interface CustomerRow {
  customer_name: string;
  invoices: (InvoiceInfo & { payment_adjusted: number; due_amount: number; overdue: boolean })[];
  total_invoice: number;
  total_payment: number;
  total_due: number;
  total_overdue: number;
  next_due_date: string | null;
}

export default function WCCustomerView() {
  const queryClient = useQueryClient();
  const { data: invoiceDetails } = useInvoiceDetails();
  const { data: payments } = useInwardPayments();

  // Fetch sales with order info to get customer mapping
  const { data: inventoryActions } = useQuery({
    queryKey: ['wc_cv_inventory_actions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_actions')
        .select('invoice_number, sales_date, order_id')
        .in('action_type', ['pack_coil_sale', 'loose_coil_sale', 'sales'])
        .not('invoice_number', 'is', null);
      if (error) throw error;
      return data;
    },
  });

  const { data: fgSalesData } = useQuery({
    queryKey: ['wc_cv_fg_sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fg_sales')
        .select('invoice_number, sales_date, order_id')
        .not('invoice_number', 'is', null);
      if (error) throw error;
      return data;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ['wc_cv_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('order_number, customer_id, customers(customer_name, gst_number)');
      if (error) throw error;
      return data;
    },
  });

  const orderMap = useMemo(() => {
    const map: Record<string, { customer_id: string; customer_name: string; gst_number: string | null }> = {};
    (orders || []).forEach((o: any) => {
      if (o.customers) {
        map[o.order_number] = { customer_id: o.customer_id, customer_name: o.customers.customer_name, gst_number: o.customers.gst_number };
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

  // Build invoice list (only those with invoice_details filled)
  const invoicesByCustomer = useMemo(() => {
    const invMap: Record<string, { invoice_number: string; sales_date: string | null; order_id: string | null }> = {};

    [...(inventoryActions || []), ...(fgSalesData || [])].forEach((s: any) => {
      if (!s.invoice_number || !invoiceDetailMap[s.invoice_number]) return;
      if (!invMap[s.invoice_number]) {
        invMap[s.invoice_number] = { invoice_number: s.invoice_number, sales_date: s.sales_date, order_id: s.order_id };
      }
    });

    // Group by customer
    const custMap: Record<string, InvoiceInfo[]> = {};
    Object.values(invMap).forEach(inv => {
      const cust = inv.order_id ? orderMap[inv.order_id] : null;
      const custName = cust?.customer_name || 'Unknown';
      const detail = invoiceDetailMap[inv.invoice_number];
      const dueDate = inv.sales_date && detail.credit_period
        ? new Date(new Date(inv.sales_date).getTime() + detail.credit_period * 86400000).toISOString().slice(0, 10)
        : null;

      if (!custMap[custName]) custMap[custName] = [];
      custMap[custName].push({
        invoice_number: inv.invoice_number,
        sales_date: inv.sales_date,
        customer_name: custName,
        customer_id: cust?.customer_id || '',
        gst_number: cust?.gst_number || null,
        invoice_amount: detail.invoice_amount,
        credit_period: detail.credit_period,
        due_date: dueDate,
      });
    });

    // Sort invoices within each customer by sales_date ASC (for FIFO)
    Object.values(custMap).forEach(arr => arr.sort((a, b) => {
      if (!a.sales_date) return -1;
      if (!b.sales_date) return 1;
      return a.sales_date.localeCompare(b.sales_date);
    }));

    return custMap;
  }, [inventoryActions, fgSalesData, orderMap, invoiceDetailMap]);

  // Payments by customer_id
  const paymentsByCustomer = useMemo(() => {
    const map: Record<string, number> = {};
    (payments || []).forEach((p: any) => {
      const custName = p.customers?.customer_name || '';
      map[custName] = (map[custName] || 0) + (p.amount || 0);
    });
    return map;
  }, [payments]);

  // Build customer rows with FIFO payment adjustment
  const customerRows: CustomerRow[] = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return Object.entries(invoicesByCustomer).map(([custName, invoices]) => {
      let remainingPayment = paymentsByCustomer[custName] || 0;
      const totalPayment = remainingPayment;

      const adjustedInvoices = invoices.map(inv => {
        const adjusted = Math.min(remainingPayment, inv.invoice_amount);
        remainingPayment -= adjusted;
        const dueAmt = inv.invoice_amount - adjusted;
        return {
          ...inv,
          payment_adjusted: adjusted,
          due_amount: dueAmt,
          overdue: dueAmt > 0 && !!inv.due_date && inv.due_date < today,
        };
      });

      const totalInvoice = invoices.reduce((s, i) => s + i.invoice_amount, 0);
      const totalDue = adjustedInvoices.reduce((s, i) => s + i.due_amount, 0);
      const totalOverdue = adjustedInvoices.filter(i => i.overdue).reduce((s, i) => s + i.due_amount, 0);

      const futureDues = adjustedInvoices.filter(i => i.due_amount > 0 && i.due_date && !i.overdue);
      const nextDueDate = futureDues.length > 0 ? futureDues[0].due_date : null;

      return {
        customer_name: custName,
        invoices: adjustedInvoices,
        total_invoice: totalInvoice,
        total_payment: totalPayment,
        total_due: totalDue,
        total_overdue: totalOverdue,
        next_due_date: nextDueDate,
      };
    }).sort((a, b) => b.total_due - a.total_due);
  }, [invoicesByCustomer, paymentsByCustomer]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['wc_cv_inventory_actions'] });
    queryClient.invalidateQueries({ queryKey: ['wc_cv_fg_sales'] });
    queryClient.invalidateQueries({ queryKey: ['wc_cv_orders'] });
    queryClient.invalidateQueries({ queryKey: ['invoice_details'] });
    queryClient.invalidateQueries({ queryKey: ['inward_payments'] });
    toast.success('Refreshed');
  };

  const grandTotals = useMemo(() => ({
    invoice: customerRows.reduce((s, r) => s + r.total_invoice, 0),
    payment: customerRows.reduce((s, r) => s + r.total_payment, 0),
    due: customerRows.reduce((s, r) => s + r.total_due, 0),
    overdue: customerRows.reduce((s, r) => s + r.total_overdue, 0),
  }), [customerRows]);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="flex items-center gap-4 text-sm flex-wrap">
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Invoice:</span>{' '}
          <span className="font-semibold font-mono">₹{grandTotals.invoice.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Payment:</span>{' '}
          <span className="font-semibold font-mono">₹{grandTotals.payment.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Due:</span>{' '}
          <span className="font-semibold font-mono text-orange-600">₹{grandTotals.due.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Overdue:</span>{' '}
          <span className="font-semibold font-mono text-destructive">₹{grandTotals.overdue.toLocaleString('en-IN')}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold">Customer Name</TableHead>
              <TableHead className="text-xs font-semibold">Invoice Number</TableHead>
              <TableHead className="text-xs font-semibold">Invoice Date</TableHead>
              <TableHead className="text-xs font-semibold">Invoice Amount (₹)</TableHead>
              <TableHead className="text-xs font-semibold">Payment Adjusted (₹)</TableHead>
              <TableHead className="text-xs font-semibold">Due Amount (₹)</TableHead>
              <TableHead className="text-xs font-semibold">Overdue Amount (₹)</TableHead>
              <TableHead className="text-xs font-semibold">Next Due Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customerRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No invoice data available. Update invoices in the Sales Data tab first.
                </TableCell>
              </TableRow>
            )}
            {customerRows.map(cust => (
              cust.invoices.map((inv, idx) => (
                <TableRow key={inv.invoice_number} className={inv.overdue ? 'bg-destructive/5' : ''}>
                  {idx === 0 && (
                    <TableCell rowSpan={cust.invoices.length} className="text-sm font-medium align-top border-r">
                      {cust.customer_name}
                    </TableCell>
                  )}
                  <TableCell className="text-sm">{inv.invoice_number}</TableCell>
                  <TableCell className="text-sm">{inv.sales_date ? new Date(inv.sales_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                  <TableCell className="text-sm font-mono">₹{inv.invoice_amount.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-sm font-mono">₹{inv.payment_adjusted.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-sm font-mono">{inv.due_amount > 0 ? `₹${inv.due_amount.toLocaleString('en-IN')}` : '-'}</TableCell>
                  <TableCell className={`text-sm font-mono ${inv.overdue ? 'text-destructive font-semibold' : ''}`}>
                    {inv.overdue ? `₹${inv.due_amount.toLocaleString('en-IN')}` : '-'}
                  </TableCell>
                  {idx === 0 && (
                    <TableCell rowSpan={cust.invoices.length} className="text-sm align-top border-l">
                      {cust.next_due_date ? new Date(cust.next_due_date).toLocaleDateString('en-IN') : '-'}
                    </TableCell>
                  )}
                </TableRow>
              ))
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
