import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export interface OrderExcelRow {
  order_number: string;
  customer_name: string;
  order_date?: string;
  comments?: string;
  material?: string;
  form?: string;
  thickness?: number;
  width?: number;
  length?: number;
  coating?: string;
  grade?: string;
  net_weight?: number;
  item_comments?: string;
}

const HEADER_MAP: Record<string, keyof OrderExcelRow> = {
  'order id': 'order_number',
  'order number': 'order_number',
  'order_number': 'order_number',
  'customer name': 'customer_name',
  'customer': 'customer_name',
  'customer_name': 'customer_name',
  'order date': 'order_date',
  'order_date': 'order_date',
  'date': 'order_date',
  'comments': 'comments',
  'order comments': 'comments',
  'material': 'material',
  'form': 'form',
  'thickness': 'thickness',
  'width': 'width',
  'length': 'length',
  'coating': 'coating',
  'grade': 'grade',
  'net weight': 'net_weight',
  'net_weight': 'net_weight',
  'qty': 'net_weight',
  'quantity': 'net_weight',
  'item comments': 'item_comments',
  'item_comments': 'item_comments',
};

const NUMERIC_FIELDS: (keyof OrderExcelRow)[] = ['thickness', 'width', 'length', 'net_weight'];

function normalize(h: unknown): string {
  return String(h || '').trim().toLowerCase().replace(/[^a-z0-9 _]/g, '');
}

function parseNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(String(v).replace(/[₹,]/g, ''));
  return isNaN(n) ? undefined : n;
}

function parseDate(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  // JS Date object (from cellDates:true)
  if (val instanceof Date) {
    const y = val.getFullYear(), m = val.getMonth() + 1, d = val.getDate();
    if (y > 1000) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return undefined;
  }
  // Excel serial number
  if (typeof val === 'number' && val > 1 && val < 100000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(epoch.getTime() + val * 86400000);
    return dt.toISOString().split('T')[0];
  }
  // String date
  const s = String(val).trim();
  const native = new Date(s);
  if (!isNaN(native.getTime()) && native.getFullYear() > 1000) {
    const y = native.getFullYear(), m = native.getMonth() + 1, d = native.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return undefined;
}

export function parseOrderExcel(file: File): Promise<OrderExcelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (raw.length === 0) { resolve([]); return; }

        const headers = Object.keys(raw[0]);
        const mapping: Record<string, keyof OrderExcelRow> = {};
        headers.forEach(h => {
          const key = HEADER_MAP[normalize(h)];
          if (key) mapping[h] = key;
        });

        const rows: OrderExcelRow[] = raw.map(r => {
          const row: any = {};
          Object.entries(mapping).forEach(([orig, mapped]) => {
            let val = r[orig];
            if (NUMERIC_FIELDS.includes(mapped)) val = parseNum(val);
            else if (mapped === 'order_date') val = parseDate(val);
            else val = val != null ? String(val).trim() : undefined;
            if (val !== undefined && val !== '') row[mapped] = val;
          });
          return row as OrderExcelRow;
        }).filter(r => r.order_number);

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function downloadOrdersExcel(orders: any[], dispatches: any[]) {
  const rows: any[] = [];

  for (const o of orders) {
    const items = o.order_items || [];
    if (items.length === 0) {
      rows.push({
        'Order ID': o.order_number,
        'Customer': (o.customers as any)?.customer_name || '-',
        'Order Date': o.order_date || '-',
        'Status': o.status,
        'Comments': o.comments || '',
        'Material': '', 'Form': '', 'Thickness': '', 'Width': '', 'Length': '',
        'Coating': '', 'Grade': '', 'Order Qty (Kg)': '', 'Dispatched (Kg)': '', 'Balance (Kg)': '',
        'Item Comments': '',
      });
    } else {
      for (const item of items) {
        const dispatched = dispatches
          .filter(d => d.order_item_id === item.id)
          .reduce((s: number, d: any) => s + (Number(d.dispatch_qty) || 0), 0);
        const orderQty = Number(item.net_weight) || 0;
        rows.push({
          'Order ID': o.order_number,
          'Customer': (o.customers as any)?.customer_name || '-',
          'Order Date': o.order_date || '-',
          'Status': o.status,
          'Comments': o.comments || '',
          'Material': item.material || '',
          'Form': item.form || '',
          'Thickness': item.thickness || '',
          'Width': item.width || '',
          'Length': item.length || '',
          'Coating': item.coating || '',
          'Grade': item.grade || '',
          'Order Qty (Kg)': orderQty,
          'Dispatched (Kg)': dispatched,
          'Balance (Kg)': orderQty - dispatched,
          'Item Comments': item.comments || '',
        });
      }
    }
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');
  XLSX.writeFile(wb, `orders_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

export function generateOrderTemplate() {
  const headers = ['Order ID', 'Customer Name', 'Order Date', 'Comments', 'Material', 'Form', 'Thickness', 'Width', 'Length', 'Coating', 'Grade', 'Net Weight', 'Item Comments'];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'order_import_template.xlsx');
}
