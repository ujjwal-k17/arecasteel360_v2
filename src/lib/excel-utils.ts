import * as XLSX from 'xlsx';
import { parse, format, isValid } from 'date-fns';
import { MATERIALS, MAKES, COATING_BY_MATERIAL, GRADE_BY_MATERIAL, FORMS } from '@/lib/inventory-options';

export interface BatchExcelRow {
  batch_number: string;
  material?: string;
  make?: string;
  thickness?: number;
  width?: number;
  length?: number;
  coating?: string;
  grade?: string;
  form?: string;
  gross_weight?: number;
  net_weight?: number;
  coil_number?: string;
  purchase_date?: string;
  purchase_from?: string;
}

const COLUMN_MAP: Record<string, keyof BatchExcelRow> = {
  'batch number': 'batch_number',
  'batch_number': 'batch_number',
  'batchnumber': 'batch_number',
  'batch no': 'batch_number',
  'batchno': 'batch_number',
  'batch': 'batch_number',
  'material': 'material',
  'make': 'make',
  'thickness': 'thickness',
  'width': 'width',
  'length': 'length',
  'coating': 'coating',
  'grade': 'grade',
  'form': 'form',
  'gross weight': 'gross_weight',
  'gross_weight': 'gross_weight',
  'grossweight': 'gross_weight',
  'gross wt': 'gross_weight',
  'gross wt (kg)': 'gross_weight',
  'gross wt (kgs)': 'gross_weight',
  'net weight': 'net_weight',
  'net_weight': 'net_weight',
  'netweight': 'net_weight',
  'net wt': 'net_weight',
  'net wt (kg)': 'net_weight',
  'net wt (kgs)': 'net_weight',
  'coil number': 'coil_number',
  'coil_number': 'coil_number',
  'coilnumber': 'coil_number',
  'coil no': 'coil_number',
  'coilno': 'coil_number',
  'purchase date': 'purchase_date',
  'purchase_date': 'purchase_date',
  'purchasedate': 'purchase_date',
  'purchase from': 'purchase_from',
  'purchase_from': 'purchase_from',
  'purchasefrom': 'purchase_from',
  'supplier': 'purchase_from',
  'vendor': 'purchase_from',
};

const NUMERIC_FIELDS: (keyof BatchExcelRow)[] = ['thickness', 'width', 'length', 'gross_weight', 'net_weight'];

function normalizeHeader(header: unknown): string {
  if (!header) return '';
  return String(header)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseNumericValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return value;
  let str = String(value).trim();
  str = str.replace(/[₹$€£¥\s,]/g, '');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? undefined : parsed;
}

function parseDate(value: unknown): string | null {
  if (!value) return null;

  // Handle Excel serial dates
  if (typeof value === 'number' && value > 1 && value < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date.toISOString().split('T')[0];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const formats = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy', 'dd/MM/yy', 'MM/dd/yy'];
    for (const fmt of formats) {
      const parsed = parse(trimmed, fmt, new Date());
      if (isValid(parsed) && parsed.getFullYear() > 1000) {
        return format(parsed, 'yyyy-MM-dd');
      }
    }
    // Try native Date as last resort
    const native = new Date(trimmed);
    if (isValid(native) && native.getFullYear() > 1000) {
      return format(native, 'yyyy-MM-dd');
    }
  }

  if (value instanceof Date && isValid(value)) {
    return format(value, 'yyyy-MM-dd');
  }
  return null;
}

export function parseExcelFile(file: File): Promise<BatchExcelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

        if (jsonData.length === 0) {
          resolve([]);
          return;
        }

        const rows: BatchExcelRow[] = jsonData.map((row) => {
          const mapped: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(row)) {
            const normalizedKey = normalizeHeader(key);
            const mappedKey = COLUMN_MAP[normalizedKey];
            if (mappedKey) {
              if (NUMERIC_FIELDS.includes(mappedKey)) {
                mapped[mappedKey] = parseNumericValue(value);
              } else if (mappedKey === 'purchase_date') {
                mapped[mappedKey] = parseDate(value);
              } else {
                mapped[mappedKey] = value != null && value !== '' ? String(value).trim() : undefined;
              }
            }
          }
          return mapped as unknown as BatchExcelRow;
        }).filter(r => r.batch_number);

        resolve(rows);
      } catch (err) {
        console.error('Excel parse error:', err);
        reject(new Error(`Failed to parse Excel file: ${err instanceof Error ? err.message : 'Unknown error'}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function generateTemplate(): void {
  const headers = [
    'Batch Number', 'Material', 'Make', 'Form', 'Thickness', 'Width', 'Length',
    'Coating', 'Grade', 'Gross Weight', 'Net Weight',
    'Coil Number', 'Purchase Date', 'Purchase From'
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers]);

  // Column indices for dropdown fields
  const colIndexMap: Record<string, number> = {};
  headers.forEach((h, i) => { colIndexMap[h] = i; });

  const allCoatings = [...new Set(Object.values(COATING_BY_MATERIAL).flat())];
  const allGrades = [...new Set(Object.values(GRADE_BY_MATERIAL).flat())];

  const dropdowns: { col: number; options: string[] }[] = [
    { col: colIndexMap['Material'], options: MATERIALS },
    { col: colIndexMap['Make'], options: MAKES },
    { col: colIndexMap['Form'], options: FORMS },
    { col: colIndexMap['Coating'], options: allCoatings },
    { col: colIndexMap['Grade'], options: allGrades },
  ];

  // Apply data validation for rows 2-1001
  for (const { col, options } of dropdowns) {
    if (options.length === 0) continue;
    const colLetter = XLSX.utils.encode_col(col);
    const range = `${colLetter}2:${colLetter}1001`;
    if (!ws['!dataValidation']) ws['!dataValidation'] = [];
    (ws['!dataValidation'] as unknown[]).push({
      sqref: range,
      type: 'list',
      formula1: `"${options.join(',')}"`,
    });
  }

  // Set column widths
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 14) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'areca_steel_import_template.xlsx');
}
