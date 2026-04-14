import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Download, X } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface SalesRecord {
  invoice_number: string | null;
  invoice_date: string | null;
  order_id: string | null;
  customer_name: string | null;
  process_form: string | null;
  sku: string;
  qty: number;
  pallet_wt: number;
  source: string;
}

function buildSku(item: { material?: string | null; thickness?: number | null; width?: number | null; length?: number | string | null; coating?: string | null; grade?: string | null }) {
  const parts = [
    item.material,
    item.thickness != null ? `${item.thickness}mm` : null,
    item.width != null ? `${item.width}W` : null,
    item.length != null ? `${item.length}L` : null,
    item.coating,
    item.grade,
  ].filter(Boolean);
  return parts.join(' / ') || '-';
}

export default function SalesDataTab() {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterInvoice, setFilterInvoice] = useState('');
  const [filterOrderId, setFilterOrderId] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterProcess, setFilterProcess] = useState('');

  // Fetch orders with customers for mapping order_id → customer_name
  const { data: orders } = useQuery({
    queryKey: ['orders_for_sales'],
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
      const entry = {
        order_number: o.order_number,
        customer_name: o.customers?.customer_name || '-',
      };
      map[o.id] = entry;
      if (o.order_number) {
        map[o.order_number] = entry;
      }
    });
    return map;
  }, [orders]);

  // Fetch inventory actions (coil sales)
  const { data: inventoryActions } = useQuery({
    queryKey: ['inventory_actions_sales'],
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
    queryKey: ['fg_sales_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fg_sales')
        .select('*, fg_items(*)')
        .order('sales_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch defective sales
  const { data: defectiveSales } = useQuery({
    queryKey: ['defective_sales_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('defective_sales')
        .select('*, batches(*)')
        .order('sales_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch pallet consumptions keyed by processing_record_id
  const { data: palletConsumptions } = useQuery({
    queryKey: ['pallet_consumptions_for_dispatch'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pallet_consumptions')
        .select('processing_record_id, weight_kg')
        .not('processing_record_id', 'is', null);
      if (error) throw error;
      return data;
    },
  });

  // Aggregate pallet weight by processing_record_id
  const palletWtByProcId = useMemo(() => {
    const map: Record<string, number> = {};
    (palletConsumptions || []).forEach((pc: any) => {
      if (pc.processing_record_id) {
        map[pc.processing_record_id] = (map[pc.processing_record_id] || 0) + (pc.weight_kg || 0);
      }
    });
    return map;
  }, [palletConsumptions]);

  // Combine all sales into unified format
  const allSales: SalesRecord[] = useMemo(() => {
    const records: SalesRecord[] = [];

    // Coil sales from inventory_actions
    (inventoryActions || []).forEach((action: any) => {
      const batch = action.batches;
      if (!batch) return;
      const orderInfo = action.order_id ? orderMap[action.order_id] : null;
      records.push({
        invoice_number: action.invoice_number,
        invoice_date: action.sales_date,
        order_id: orderInfo?.order_number || action.order_id || null,
        customer_name: orderInfo?.customer_name || null,
        process_form: action.action_type === 'pack_coil_sale' ? 'Pack Coil' : action.action_type === 'loose_coil_sale' ? 'Loose Coil' : (batch.form || 'Coil'),
        sku: buildSku(batch),
        qty: action.net_weight || 0,
        pallet_wt: 0,
        source: 'Coil',
      });
    });

    // FG sales
    (fgSales || []).forEach((sale: any) => {
      const fg = sale.fg_items;
      if (!fg) return;
      const orderInfo = sale.order_id ? orderMap[sale.order_id] : null;
      const procId = fg.processing_record_id;
      records.push({
        invoice_number: sale.invoice_number,
        invoice_date: sale.sales_date,
        order_id: orderInfo?.order_number || sale.order_id || null,
        customer_name: orderInfo?.customer_name || null,
        process_form: fg.process || 'FG',
        sku: buildSku(fg),
        qty: sale.quantity || 0,
        pallet_wt: procId ? (palletWtByProcId[procId] || 0) : 0,
        source: 'FG',
      });
    });

    // Defective sales
    (defectiveSales || []).forEach((sale: any) => {
      const batch = sale.batches;
      if (!batch) return;
      const orderInfo = sale.order_id ? orderMap[sale.order_id] : null;
      records.push({
        invoice_number: sale.invoice_number,
        invoice_date: sale.sales_date,
        order_id: orderInfo?.order_number || sale.order_id || null,
        customer_name: orderInfo?.customer_name || null,
        process_form: 'Defective',
        sku: buildSku(batch),
        qty: sale.quantity || 0,
        pallet_wt: 0,
        source: 'Defective',
      });
    });

    // Sort by invoice_date descending
    records.sort((a, b) => {
      if (!a.invoice_date) return 1;
      if (!b.invoice_date) return -1;
      return b.invoice_date.localeCompare(a.invoice_date);
    });

    return records;
  }, [inventoryActions, fgSales, defectiveSales, orderMap, palletWtByProcId]);

  // Filter by date range + column filters
  const filteredSales = useMemo(() => {
    return allSales.filter(s => {
      if (!s.invoice_date) return false;
      if (dateFrom && s.invoice_date < dateFrom) return false;
      if (dateTo && s.invoice_date > dateTo) return false;
      if (filterInvoice && s.invoice_number !== filterInvoice) return false;
      if (filterOrderId && s.order_id !== filterOrderId) return false;
      if (filterCustomer && s.customer_name !== filterCustomer) return false;
      if (filterProcess && s.process_form !== filterProcess) return false;
      return true;
    });
  }, [allSales, dateFrom, dateTo, filterInvoice, filterOrderId, filterCustomer, filterProcess]);

  const totalQty = useMemo(() => filteredSales.reduce((s, r) => s + r.qty, 0), [filteredSales]);
  const totalPalletWt = useMemo(() => filteredSales.reduce((s, r) => s + r.pallet_wt, 0), [filteredSales]);

  // Unique filter options (derived from date-filtered data)
  const dateFilteredSales = useMemo(() => {
    return allSales.filter(s => {
      if (!s.invoice_date) return false;
      if (dateFrom && s.invoice_date < dateFrom) return false;
      if (dateTo && s.invoice_date > dateTo) return false;
      return true;
    });
  }, [allSales, dateFrom, dateTo]);

  const uniqueInvoices = useMemo(() => [...new Set(dateFilteredSales.map(s => s.invoice_number).filter(Boolean) as string[])].sort(), [dateFilteredSales]);
  const uniqueOrderIds = useMemo(() => [...new Set(dateFilteredSales.map(s => s.order_id).filter(Boolean) as string[])].sort(), [dateFilteredSales]);
  const uniqueCustomers = useMemo(() => [...new Set(dateFilteredSales.map(s => s.customer_name).filter(Boolean) as string[])].sort(), [dateFilteredSales]);
  const uniqueProcesses = useMemo(() => [...new Set(dateFilteredSales.map(s => s.process_form).filter(Boolean) as string[])].sort(), [dateFilteredSales]);

  const hasActiveFilters = filterInvoice || filterOrderId || filterCustomer || filterProcess;
  const clearColumnFilters = () => { setFilterInvoice(''); setFilterOrderId(''); setFilterCustomer(''); setFilterProcess(''); };

  const handleDownloadExcel = () => {
    if (filteredSales.length === 0) {
      toast.info('No data to download');
      return;
    }
    const rows = filteredSales.map(s => ({
      'Invoice Number': s.invoice_number || '-',
      'Invoice Date': s.invoice_date || '-',
      'Order ID': s.order_id || '-',
      'Customer Name': s.customer_name || '-',
      'Process / Form': s.process_form || '-',
      'SKU': s.sku,
      'Qty (Kg)': s.qty,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dispatch Data');
    const fileName = `dispatch_data_${dateFrom || 'all'}_to_${dateTo || 'all'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success('Downloaded');
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory_actions_sales'] });
    queryClient.invalidateQueries({ queryKey: ['fg_sales_all'] });
    queryClient.invalidateQueries({ queryKey: ['defective_sales_all'] });
    queryClient.invalidateQueries({ queryKey: ['orders_for_sales'] });
    toast.success('Refreshed');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={refreshAll} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            placeholder="From"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            placeholder="To"
          />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>
              Clear
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2 h-8">
            <Download className="h-3.5 w-3.5" /> Download Excel
          </Button>
        </div>
      </div>

        <div className="flex items-center gap-4 text-sm">
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Total Qty:</span>{' '}
          <span className="font-semibold font-mono-num">{totalQty.toFixed(2)} Kg</span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-1.5">
          <span className="text-muted-foreground">Records:</span>{' '}
          <span className="font-semibold">{filteredSales.length}</span>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearColumnFilters}>
            <X className="h-3 w-3" /> Clear filters
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold whitespace-nowrap">Invoice Number</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Invoice Date</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Order ID</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Customer Name</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Process / Form</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">SKU</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Qty (Kg)</TableHead>
            </TableRow>
            <TableRow className="bg-muted/30">
              <TableHead className="p-1">
                <Select value={filterInvoice} onValueChange={v => setFilterInvoice(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-7 text-xs w-full min-w-[100px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {uniqueInvoices.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="p-1">{/* date range filter above */}</TableHead>
              <TableHead className="p-1">
                <Select value={filterOrderId} onValueChange={v => setFilterOrderId(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-7 text-xs w-full min-w-[80px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {uniqueOrderIds.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="p-1">
                <Select value={filterCustomer} onValueChange={v => setFilterCustomer(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-7 text-xs w-full min-w-[100px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {uniqueCustomers.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="p-1">
                <Select value={filterProcess} onValueChange={v => setFilterProcess(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-7 text-xs w-full min-w-[80px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {uniqueProcesses.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="p-1">{/* SKU - no filter */}</TableHead>
              <TableHead className="p-1">{/* Qty - no filter */}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSales.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {dateFrom || dateTo ? 'No dispatches found for selected date range.' : 'No dispatch data found. Select a date range to filter.'}
                </TableCell>
              </TableRow>
            )}
            {filteredSales.map((s, idx) => (
              <TableRow key={idx}>
                <TableCell className="text-sm">{s.invoice_number || '-'}</TableCell>
                <TableCell className="text-sm">{s.invoice_date ? new Date(s.invoice_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                <TableCell className="text-sm">{s.order_id || '-'}</TableCell>
                <TableCell className="text-sm">{s.customer_name || '-'}</TableCell>
                <TableCell className="text-sm">{s.process_form || '-'}</TableCell>
                <TableCell className="text-sm font-mono-num whitespace-nowrap">{s.sku}</TableCell>
                <TableCell className="text-sm font-mono-num">{s.qty.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
