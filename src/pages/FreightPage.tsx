import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Fetch orders with customers
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

  // Fetch invoice_details for dispatch_type
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
    (invoiceDetails || []).forEach((d: any) => {
      map[d.invoice_number] = d;
    });
    return map;
  }, [invoiceDetails]);

  // Fetch all sales sources
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
      const { data, error } = await supabase
        .from('fg_sales')
        .select('invoice_number, sales_date, order_id, quantity');
      if (error) throw error;
      return data;
    },
  });

  const { data: defectiveSales } = useQuery({
    queryKey: ['freight_defective_sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('defective_sales')
        .select('invoice_number, sales_date, order_id, quantity');
      if (error) throw error;
      return data;
    },
  });

  // Aggregate at invoice level
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

  // Filter by date
  const filteredSummaries = useMemo(() => {
    return invoiceSummaries.filter(s => {
      if (!s.invoice_date) return !dateFrom && !dateTo;
      if (dateFrom && s.invoice_date < dateFrom) return false;
      if (dateTo && s.invoice_date > dateTo) return false;
      return true;
    });
  }, [invoiceSummaries, dateFrom, dateTo]);

  // Mutation to update dispatch_type
  const updateDispatchType = useMutation({
    mutationFn: async ({ invoice_number, dispatch_type }: { invoice_number: string; dispatch_type: string | null }) => {
      const existing = invoiceDetailMap[invoice_number];
      if (existing) {
        const { error } = await supabase
          .from('invoice_details')
          .update({ dispatch_type })
          .eq('invoice_number', invoice_number);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('invoice_details')
          .insert({ invoice_number, dispatch_type });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freight_invoice_details'] });
      toast.success('Dispatch type updated');
    },
    onError: () => toast.error('Failed to update dispatch type'),
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['freight_inv_actions'] });
    queryClient.invalidateQueries({ queryKey: ['freight_fg_sales'] });
    queryClient.invalidateQueries({ queryKey: ['freight_defective_sales'] });
    queryClient.invalidateQueries({ queryKey: ['freight_orders'] });
    queryClient.invalidateQueries({ queryKey: ['freight_invoice_details'] });
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
    toast.success('Downloaded');
  };

  return (
    <div className="container py-6">
      <h1 className="text-2xl font-semibold mb-6">Freight</h1>
      <Tabs defaultValue="all-dispatches">
        <TabsList>
          <TabsTrigger value="all-dispatches">All Dispatches</TabsTrigger>
          <TabsTrigger value="transporter">Transporter</TabsTrigger>
          <TabsTrigger value="areca-0720">Areca 0720</TabsTrigger>
          <TabsTrigger value="areca-2720">Areca 2720</TabsTrigger>
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
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                Clear
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="all-dispatches">
          <DispatchTable
            data={filteredSummaries}
            showDispatchType
            onDispatchTypeChange={(inv, type) => updateDispatchType.mutate({ invoice_number: inv, dispatch_type: type })}
            onDownload={() => handleDownload(filteredSummaries, 'All Dispatches')}
          />
        </TabsContent>
        <TabsContent value="transporter">
          <DispatchTable
            data={filteredSummaries.filter(s => s.dispatch_type === 'Transporter')}
            onDownload={() => handleDownload(filteredSummaries.filter(s => s.dispatch_type === 'Transporter'), 'Transporter')}
          />
        </TabsContent>
        <TabsContent value="areca-0720">
          <DispatchTable
            data={filteredSummaries.filter(s => s.dispatch_type === 'Areca 0720')}
            onDownload={() => handleDownload(filteredSummaries.filter(s => s.dispatch_type === 'Areca 0720'), 'Areca 0720')}
          />
        </TabsContent>
        <TabsContent value="areca-2720">
          <DispatchTable
            data={filteredSummaries.filter(s => s.dispatch_type === 'Areca 2720')}
            onDownload={() => handleDownload(filteredSummaries.filter(s => s.dispatch_type === 'Areca 2720'), 'Areca 2720')}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DispatchTable({
  data,
  showDispatchType,
  onDispatchTypeChange,
  onDownload,
}: {
  data: InvoiceSummary[];
  showDispatchType?: boolean;
  onDispatchTypeChange?: (invoice: string, type: string) => void;
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
              <TableHead className="text-xs font-semibold">Dispatch Type</TableHead>
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
