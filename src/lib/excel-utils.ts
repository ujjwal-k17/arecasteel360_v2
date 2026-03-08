import * as XLSX from 'xlsx';

export interface BatchExcelRow {
  batch_number: string;
  material?: string;
  make?: string;
  thickness?: number;
  width?: number;
  length?: number;
  coating?: string;
  grade?: string;
  gsm?: number;
  colour?: string;
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
  'material': 'material',
  'make': 'make',
  'thickness': 'thickness',
  'width': 'width',
  'length': 'length',
  'coating': 'coating',
  'grade': 'grade',
  'gsm': 'gsm',
  'colour': 'colour',
  'color': 'colour',
  'gross weight': 'gross_weight',
  'gross_weight': 'gross_weight',
  'grossweight': 'gross_weight',
  'net weight': 'net_weight',
  'net_weight': 'net_weight',
  'netweight': 'net_weight',
  'coil number': 'coil_number',
  'coil_number': 'coil_number',
  'coilnumber': 'coil_number',
  'purchase date': 'purchase_date',
  'purchase_date': 'purchase_date',
  'purchasedate': 'purchase_date',
  'purchase from': 'purchase_from',
  'purchase_from': 'purchase_from',
  'purchasefrom': 'purchase_from',
};

export function parseExcelFile(file: File): Promise<BatchExcelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        
        const rows: BatchExcelRow[] = jsonData.map((row) => {
          const mapped: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(row)) {
            const normalizedKey = key.toLowerCase().trim();
            const mappedKey = COLUMN_MAP[normalizedKey];
            if (mappedKey) {
              mapped[mappedKey] = value;
            }
          }
          return mapped as unknown as BatchExcelRow;
        }).filter(r => r.batch_number);

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function generateTemplate(): void {
  const headers = [
    'Batch Number', 'Material', 'Make', 'Thickness', 'Width', 'Length',
    'Coating', 'Grade', 'GSM', 'Colour', 'Gross Weight', 'Net Weight',
    'Coil Number', 'Purchase Date', 'Purchase From'
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'areca_steel_import_template.xlsx');
}
