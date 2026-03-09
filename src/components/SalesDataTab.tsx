import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface SalesRecord {
  sales_date: string | null;
  material: string | null;
  make: string | null;
  process_form: string | null;
  dimensions: string;
  coating: string | null;
  grade: string | null;
  qty: number;
  invoice_number: string | null;
  source: string;
}

export default function SalesDataTab() {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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

  // Combine all sales into unified format
  const allSales: SalesRecord[] = useMemo(() => {
    const records: SalesRecord[] = [];

    // Coil sales from inventory_actions
    (inventoryActions || []).forEach((action: any) => {
      const batch = action.batches;
      if (!batch) return;
      records.push({
        sales_date: action.sales_date,
        material: batch.material,
        make: batch.make,
        process_form: action.action_type === 'pack_coil_sale' ? 'Pack Coil' : action.action_type === 'loose_coil_sale' ? 'Loose Coil' : (batch.form || 'Coil'),
        dimensions: `${batch.thickness ?? '-'} x ${batch.width ?? '-'} x ${batch.length ?? '-'}`,
        coating: batch.coating,
        grade: batch.grade,
        qty: action.net_weight || 0,
        invoice_number: action.invoice_number,
        source: 'Coil',
      });
    });

    // FG sales
    (fgSales || []).forEach((sale: any) => {
      const fg = sale.fg_items;
      if (!fg) return;
      records.push({
        sales_date: sale.sales_date,
        material: fg.material,
        make: fg.make,
        process_form: fg.process || 'FG',
        dimensions: `${fg.thickness ?? '-'} x ${fg.width ?? '-'} x ${fg.length ?? '-'}`,
        coating: fg.coating,
        grade: fg.grade,
        qty: sale.quantity || 0,
        invoice_number: sale.invoice_number,
        source: 'FG',
      });
    });

    // Defective sales
    (defectiveSales || []).forEach((sale: any) => {
      const batch = sale.batches;
      if (!batch) return;
      records.push({
        sales_date: sale.sales_date,
        material: batch.material,
        make: batch.make,
        process_form: 'Defective',
        dimensions: `${batch.thickness ?? '-'} x ${batch.width ?? '-'} x ${batch.length ?? '-'}`,
        coating: batch.coating,
        grade: batch.grade,
        qty: sale.quantity || 0,
        invoice_number: sale.invoice_number,
        source: 'Defective',
      });
    });

    // Sort by sales_date descending
    records.sort((a, b) => {
      if (!a.sales_date) return 1;
      if (!b.sales_date) return -1;
      return b.sales_date.localeCompare(a.sales_date);
    });

    return records;
  }, [inventoryActions, fgSales, defectiveSales]);

  // Filter by date range
  const filteredSales = useMemo(() => {
    return allSales.filter(s => {
      if (!s.sales_date) return false;
      if (dateFrom && s.sales_date < dateFrom) return false;
      if (dateTo && s.sales_date > dateTo) return false;
      return true;
    });
  }, [allSales, dateFrom, dateTo]);

  const totalQty = useMemo(() => filteredSales.reduce((s, r) => s + r.qty, 0), [filteredSales]);

  const handleDownloadExcel = () => {
    if (filteredSales.length === 0) {
      toast.info('No data to download');
      return;
    }
    const rows = filteredSales.map(s => ({
      'Sales Date': s.sales_date || '-',
      'Material': s.material || '-',
      'Make': s.make || '-',
      'Process / Form': s.process_form || '-',
      'Dimensions': s.dimensions,
      'Coating': s.coating || '-',
      'Grade': s.grade || '-',
      'Qty (Kg)': s.qty,
      'Invoice Number': s.invoice_number || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Data');
    const fileName = `sales_data_${dateFrom || 'all'}_to_${dateTo || 'all'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success('Downloaded');
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory_actions_sales'] });
    queryClient.invalidateQueries({ queryKey: ['fg_sales_all'] });
    queryClient.invalidateQueries({ queryKey: ['defective_sales_all'] });
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
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold whitespace-nowrap">Sales Date</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Material</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Make</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Process / Form</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Dimensions</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Coating</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Grade</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Qty (Kg)</TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">Invoice Number</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSales.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {dateFrom || dateTo ? 'No sales found for selected date range.' : 'No sales data found. Select a date range to filter.'}
                </TableCell>
              </TableRow>
            )}
            {filteredSales.map((s, idx) => (
              <TableRow key={idx}>
                <TableCell className="text-sm">{s.sales_date ? new Date(s.sales_date).toLocaleDateString('en-IN') : '-'}</TableCell>
                <TableCell className="text-sm">{s.material || '-'}</TableCell>
                <TableCell className="text-sm">{s.make || '-'}</TableCell>
                <TableCell className="text-sm">{s.process_form || '-'}</TableCell>
                <TableCell className="text-sm font-mono-num whitespace-nowrap">{s.dimensions}</TableCell>
                <TableCell className="text-sm">{s.coating || '-'}</TableCell>
                <TableCell className="text-sm">{s.grade || '-'}</TableCell>
                <TableCell className="text-sm font-mono-num">{s.qty.toFixed(2)}</TableCell>
                <TableCell className="text-sm">{s.invoice_number || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
