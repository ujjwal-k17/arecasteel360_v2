// Shared utilities for the Business Overview module.
// Pure functions only — never call Tally directly.

export function formatINR(value: number | null | undefined): string {
  const n = Number(value || 0);
  // Indian numbering with 0 decimals for amounts.
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatINRCompact(value: number | null | undefined): string {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return formatINR(n);
}

export function formatMT(value: number | null | undefined): string {
  const n = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

// Parse a quantity string from line_items into MT.
// Examples: "11.6050 MT", "1200 KG", "1.5 ton", "750 Kgs"
export function parseQtyToMT(qty: unknown): number {
  if (qty == null) return 0;
  if (typeof qty === 'number') return qty;
  const s = String(qty).trim();
  if (!s) return 0;
  const match = s.match(/([\d,]*\.?\d+)\s*([a-zA-Z]+)?/);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(/,/g, ''));
  if (isNaN(num)) return 0;
  const unit = (match[2] || 'mt').toLowerCase();
  if (unit.startsWith('mt') || unit === 'ton' || unit === 'tons' || unit === 'tonne' || unit === 'tonnes') {
    return num;
  }
  if (unit.startsWith('kg')) return num / 1000;
  if (unit.startsWith('g') && !unit.startsWith('gm')) return num / 1_000_000;
  if (unit.startsWith('gm')) return num / 1_000_000;
  // Fallback: assume MT
  return num;
}

export function totalMTFromLineItems(lineItems: unknown): number {
  if (!Array.isArray(lineItems)) return 0;
  return lineItems.reduce((sum: number, item: any) => sum + parseQtyToMT(item?.qty), 0);
}

// Tally stores debit balances as negative and credit balances as positive in our DB.
// For Debtor view (receivables): debit balance = money owed TO us = should display as positive.
// So flip the sign: outstanding = -closing_balance.
// Positive result => debtor owes us. Negative result => advance received from customer.
export function debtorOutstandingFromClosing(closing: number | null | undefined): number {
  return -Number(closing || 0);
}

// For Creditor view (payables): credit balance = money owed BY us = positive in DB already.
// So creditor outstanding = closing_balance directly.
export function creditorOutstandingFromClosing(closing: number | null | undefined): number {
  return Number(closing || 0);
}

// Resolve credit period for an invoice using the documented hierarchy:
// 1. invoice_credit_periods (per-voucher override)
// 2. debtor_master.credit_period_days (per-party default)
// 3. 0 (due immediately)
export function resolveCreditPeriod(
  companyName: string,
  voucherNumber: string,
  partyName: string,
  cpMap: Map<string, number>,
  dmMap: Map<string, number>,
): number {
  const v = cpMap.get(`${companyName}::${voucherNumber}`);
  if (v != null) return v;
  const d = dmMap.get(`${companyName}::${partyName}`);
  if (d != null) return d;
  return 0;
}

// Indian financial year helpers (April–March).
export function currentFYRange(): { from: Date; to: Date } {
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    from: new Date(fyStartYear, 3, 1),
    to: new Date(fyStartYear + 1, 2, 31, 23, 59, 59),
  };
}

export function currentMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Ageing buckets used by debtor & creditor analysis pages.
export type AgeingBucket = 'not_yet_due' | '1_30' | '31_60' | '61_90' | '90_plus';

export function ageingBucketFor(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 0) return 'not_yet_due';
  if (daysOverdue <= 30) return '1_30';
  if (daysOverdue <= 60) return '31_60';
  if (daysOverdue <= 90) return '61_90';
  return '90_plus';
}

export const AGEING_LABELS: Record<AgeingBucket, string> = {
  not_yet_due: 'Not Yet Due',
  '1_30': '1–30 days',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  '90_plus': '90+ days',
};

// FIFO ageing calculator.
// invoices: [{ voucher_number, date, amount, credit_period_days }]
// receipts: [{ date, amount }]
// Returns per-invoice: { paid, outstanding, due_date, days_overdue, status }
export interface FIFOInvoice {
  voucher_number: string;
  date: string; // ISO yyyy-mm-dd
  amount: number;
  credit_period_days: number | null;
  narration?: string | null;
}

export interface FIFOReceipt {
  date: string;
  amount: number;
}

export interface FIFOResult {
  voucher_number: string;
  invoice_date: string;
  original_amount: number;
  paid_amount: number;
  outstanding: number;
  credit_period_days: number;
  due_date: string;
  days_overdue: number;
  status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue';
  narration?: string | null;
}

export function applyFIFO(invoices: FIFOInvoice[], receipts: FIFOReceipt[]): FIFOResult[] {
  // Sort ascending by date
  const sortedInv = [...invoices].sort((a, b) => a.date.localeCompare(b.date));
  const sortedRec = [...receipts].sort((a, b) => a.date.localeCompare(b.date));

  let receiptPool = sortedRec.reduce((s, r) => s + Number(r.amount || 0), 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return sortedInv.map((inv) => {
    const original = Number(inv.amount || 0);
    let paid = 0;
    if (receiptPool > 0) {
      paid = Math.min(receiptPool, original);
      receiptPool -= paid;
    }
    const outstanding = Math.max(0, original - paid);
    const credit = inv.credit_period_days ?? 0;
    const invDate = new Date(inv.date);
    const dueDate = new Date(invDate);
    dueDate.setDate(dueDate.getDate() + credit);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    let status: FIFOResult['status'];
    if (outstanding <= 0.01) status = 'Paid';
    else if (paid > 0.01) status = daysOverdue > 0 ? 'Overdue' : 'Partial';
    else status = daysOverdue > 0 ? 'Overdue' : 'Unpaid';

    return {
      voucher_number: inv.voucher_number,
      invoice_date: inv.date,
      original_amount: original,
      paid_amount: paid,
      outstanding,
      credit_period_days: credit,
      due_date: dueDate.toISOString().slice(0, 10),
      days_overdue: daysOverdue,
      status,
      narration: inv.narration,
    };
  });
}
