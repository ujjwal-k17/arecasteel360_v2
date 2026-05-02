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
// Only weight units are counted. Anything else (PCS, NOS, no-unit, etc.) → 0.
// Examples: "11.6050 MT" → 11.605, "1200 Kgs" → 1.2, "3.00 PCS" → 0.
export function parseQtyToMT(qty: unknown): number {
  if (qty == null) return 0;
  if (typeof qty === 'number') return qty; // legacy numeric callers — already MT
  const s = String(qty).trim();
  if (!s) return 0;
  const match = s.match(/([\d,]*\.?\d+)\s*([a-zA-Z]+)?/);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(/,/g, ''));
  if (isNaN(num)) return 0;
  const unit = (match[2] || '').toLowerCase();

  // MT / tonne — keep as-is
  if (unit.startsWith('mt') || unit === 'ton' || unit === 'tons' || unit === 'tonne' || unit === 'tonnes') {
    return num;
  }
  // KG / KGS — 1 MT = 1000 KG
  if (unit === 'kg' || unit === 'kgs') {
    return num / 1000;
  }
  // PCS, NOS, BOX, missing unit, anything else → ignore
  return 0;
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

// ─────────────────────────────────────────────────────────────────────────────
// New ledger-anchored balance calculator.
// Steps (per spec):
//   1. Opening balance = earliest tally_ledger_balances row for this (company, ledger)
//   2. Sum debit vouchers  (Sales, Debit Note)
//   3. Sum credit vouchers (Receipt, Credit Note, Journal, Payment)
//   4. Total Outstanding   = Opening Dr + Σ Debits − (Opening Cr + Σ Credits)
//   5. Verify against latest closing_balance — flag mismatch > ₹1
//   6. FIFO over debit-only entries (with opening Dr as first synthetic entry)
//   7. Ageing bucketed from overdue debit entries
// ─────────────────────────────────────────────────────────────────────────────

export const DEBIT_VOUCHER_TYPES = ['Sales', 'Debit Note'] as const;
export const CREDIT_VOUCHER_TYPES = ['Receipt', 'Credit Note', 'Journal', 'Payment'] as const;
export const ALL_PARTY_VOUCHER_TYPES = [
  'Sales', 'Receipt', 'Journal', 'Credit Note', 'Debit Note', 'Payment',
] as const;

export interface PartyVoucher {
  voucher_number: string;
  voucher_type: string;
  date: string;
  amount: number;
  narration?: string | null;
}

export interface PartyLedgerSnap {
  as_of_date: string;
  closing_balance: number;
}

export interface InvoiceRow {
  voucher_number: string;
  invoice_date: string;
  original_amount: number;
  paid_amount: number;
  outstanding: number;
  credit_period_days: number;
  due_date: string;
  days_overdue: number;
  status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue';
  is_opening: boolean;
  narration?: string | null;
}

export interface PartyBalance {
  // Side: 'debtors' uses Dr-as-positive convention. 'creditors' uses Cr-as-positive.
  side: 'debtors' | 'creditors';
  openingDebit: number;       // Dr opening (receivable for debtors / advance-given for creditors)
  openingCredit: number;      // Cr opening (advance-received / payable)
  totalDebit: number;         // Opening Dr + Σ Sales + Σ Debit Notes
  totalCredit: number;        // Opening Cr + Σ Receipts + Σ Credit Notes + Σ Journal + Σ Payment
  computedOutstanding: number; // totalDebit − totalCredit (signed; > 0 = receivable for debtors)
  ledgerOutstanding: number;   // From latest closing_balance (sign-corrected for the side)
  mismatch: number;            // computed − ledger (absolute, in rupees)
  hasMismatch: boolean;        // |mismatch| > 1
  totalOverdue: number;
  ageing: Record<AgeingBucket, number>;
  maxOverdueDays: number;
  invoices: InvoiceRow[];      // Debit entries only, outstanding > 0, sorted overdue desc
}

/**
 * Build an opening-balance synthetic invoice from the earliest ledger snapshot.
 * For debtors: a *debit* opening (closing_balance < 0 in our DB) becomes a receivable.
 * For creditors: a *credit* opening (closing_balance > 0 in our DB) becomes a payable.
 */
export function calculatePartyBalance(params: {
  side: 'debtors' | 'creditors';
  vouchers: PartyVoucher[];          // already filtered to this party + company
  ledgerSnaps: PartyLedgerSnap[];    // all snapshots for this party + company
  creditPeriodResolver: (voucherNumber: string, invoiceDateISO: string) => number;
}): PartyBalance {
  const { side, vouchers, ledgerSnaps, creditPeriodResolver } = params;

  // ── Step 1: opening & latest snapshots
  const sortedSnaps = [...ledgerSnaps].sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
  const opening = sortedSnaps[0];
  const latest = sortedSnaps[sortedSnaps.length - 1];

  // In our DB: debit balance is stored NEGATIVE, credit balance is stored POSITIVE.
  let openingDebit = 0;
  let openingCredit = 0;
  let openingDateISO = opening?.as_of_date ?? '1970-01-01';
  if (opening) {
    const ob = Number(opening.closing_balance || 0);
    if (ob < 0) openingDebit = -ob;
    else if (ob > 0) openingCredit = ob;
  }

  // ── Steps 2 & 3: classify vouchers
  let sumDebit = 0;
  let sumCredit = 0;
  const debitEntries: PartyVoucher[] = [];
  vouchers.forEach((v) => {
    const t = v.voucher_type;
    const amt = Number(v.amount || 0);
    if ((DEBIT_VOUCHER_TYPES as readonly string[]).includes(t)) {
      sumDebit += amt;
      debitEntries.push(v);
    } else if ((CREDIT_VOUCHER_TYPES as readonly string[]).includes(t)) {
      sumCredit += amt;
    }
  });

  const totalDebit = openingDebit + sumDebit;
  const totalCredit = openingCredit + sumCredit;
  const computedOutstanding = totalDebit - totalCredit;

  // ── Step 5: ledger closing-balance reconciliation
  let ledgerOutstanding = 0;
  if (latest) {
    const cb = Number(latest.closing_balance || 0);
    // Debtors: debit (negative in DB) is positive receivable.
    // Creditors: credit (positive in DB) is positive payable.
    ledgerOutstanding = side === 'debtors' ? -cb : cb;
  }
  const mismatch = computedOutstanding - ledgerOutstanding;
  const hasMismatch = Math.abs(mismatch) > 1;

  // ── Step 6: FIFO over debit entries only (with opening as first synthetic row)
  const fifoEntries: Array<{
    voucher_number: string;
    date: string;
    amount: number;
    is_opening: boolean;
    narration?: string | null;
  }> = [];
  if (openingDebit > 0.01) {
    fifoEntries.push({
      voucher_number: 'Opening Balance',
      date: openingDateISO,
      amount: openingDebit,
      is_opening: true,
    });
  }
  debitEntries.forEach((v) => {
    fifoEntries.push({
      voucher_number: v.voucher_number,
      date: v.date,
      amount: Number(v.amount || 0),
      is_opening: false,
      narration: v.narration ?? null,
    });
  });

  // Credit pool = all credit-side money (incl. opening Cr).
  let creditPool = totalCredit;
  fifoEntries.sort((a, b) => a.date.localeCompare(b.date));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const invoices: InvoiceRow[] = fifoEntries.map((e) => {
    const original = e.amount;
    let paid = 0;
    if (creditPool > 0) {
      paid = Math.min(creditPool, original);
      creditPool -= paid;
    }
    const outstanding = Math.max(0, original - paid);
    const credit = e.is_opening ? 0 : creditPeriodResolver(e.voucher_number, e.date);
    const invDate = new Date(e.date);
    const dueDate = new Date(invDate);
    dueDate.setDate(dueDate.getDate() + credit);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);

    let status: InvoiceRow['status'];
    if (outstanding <= 0.01) status = 'Paid';
    else if (paid > 0.01) status = daysOverdue > 0 ? 'Overdue' : 'Partial';
    else status = daysOverdue > 0 ? 'Overdue' : 'Unpaid';

    return {
      voucher_number: e.voucher_number,
      invoice_date: e.date,
      original_amount: original,
      paid_amount: paid,
      outstanding,
      credit_period_days: credit,
      due_date: dueDate.toISOString().slice(0, 10),
      days_overdue: daysOverdue,
      status,
      is_opening: e.is_opening,
      narration: e.narration,
    };
  });

  // ── Step 7: ageing
  const ageing: Record<AgeingBucket, number> = {
    not_yet_due: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0,
  };
  let totalOverdue = 0;
  let maxOverdueDays = 0;
  invoices.forEach((inv) => {
    if (inv.outstanding <= 0.01) return;
    if (inv.days_overdue <= 0) {
      ageing.not_yet_due += inv.outstanding;
      return;
    }
    totalOverdue += inv.outstanding;
    if (inv.days_overdue > maxOverdueDays) maxOverdueDays = inv.days_overdue;
    ageing[ageingBucketFor(inv.days_overdue)] += inv.outstanding;
  });

  // Filter & sort the invoice list for the drill-down (outstanding > 0, overdue desc).
  const drillDown = invoices
    .filter((i) => i.outstanding > 0.01)
    .sort((a, b) => b.days_overdue - a.days_overdue);

  return {
    side,
    openingDebit,
    openingCredit,
    totalDebit,
    totalCredit,
    computedOutstanding,
    ledgerOutstanding,
    mismatch,
    hasMismatch,
    totalOverdue,
    ageing,
    maxOverdueDays,
    invoices: drillDown,
  };
}

