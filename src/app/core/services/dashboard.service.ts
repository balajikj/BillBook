import { Injectable, inject } from '@angular/core';
import {
  Firestore, Timestamp, collection, getDocs, limit as fsLimit, orderBy, query, where
} from '@angular/fire/firestore';
import { Invoice, getDisplayTotal, getInvoiceKind } from '../models/invoice';
import { AuthService } from './auth.service';

/** Per-kind metrics over the dashboard window. */
export interface KindMetrics {
  /** Sum of (grandTotal || total) over paid invoices in this kind, grouped by currency. */
  totalByCurrency: Record<string, number>;
  paidCount: number;
  pendingNotOverdueCount: number;
  overdueCount: number;
}

/** GST summary numbers — INR only, all statuses, rolling window. */
export interface GstSummary {
  /** Sum of (cgst+sgst) on sales invoices in INR with gstPercent > 0. */
  outputInr: number;
  /** Sum of (cgst+sgst) on purchase invoices in INR with gstPercent > 0. */
  inputInr: number;
  /** outputInr - inputInr. Positive = payable, negative = ITC available, zero = balanced. */
  netInr: number;
}

export interface DashboardSummary {
  sales: KindMetrics;
  purchase: KindMetrics;
  gst: GstSummary;
  recent: Invoice[];
  /** Inclusive lower bound of the window applied to per-kind + GST metrics. */
  from: Date;
  /** Exclusive upper bound. The reporting interval is `[from, toExclusive)`. */
  toExclusive: Date;
}

/** Caller-supplied window. When omitted, the service defaults to the last 90 days. */
export interface DateRange {
  from: Date;
  toExclusive: Date;
}

const EMPTY_KIND_METRICS = (): KindMetrics => ({
  totalByCurrency: {},
  paidCount: 0,
  pendingNotOverdueCount: 0,
  overdueCount: 0
});

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);

  async load(range?: DateRange): Promise<DashboardSummary> {
    const cid = this.auth.companyId();
    if (!cid) throw new Error('No companyId on the current user');
    const window = range ?? defaultLast90Days();
    const fromTs = Timestamp.fromDate(window.from);
    const toExclusiveTs = Timestamp.fromDate(window.toExclusive);
    const nowMillis = Date.now();

    const col = collection(this.db, `companies/${cid}/invoices`);

    const sales = EMPTY_KIND_METRICS();
    const purchase = EMPTY_KIND_METRICS();
    const gst: GstSummary = { outputInr: 0, inputInr: 0, netInr: 0 };

    // ----- 1. Paid invoices (revenue / paid-out + paid counts) -----
    const paidSnap = await getDocs(
      query(
        col,
        where('status', '==', 'paid'),
        where('createdAt', '>=', fromTs),
        where('createdAt', '<', toExclusiveTs)
      )
    );
    paidSnap.forEach((d) => {
      const inv = d.data() as Invoice;
      const bucket = getInvoiceKind(inv) === 'purchase' ? purchase : sales;
      const amount = getDisplayTotal(inv);
      bucket.totalByCurrency[inv.currency] = (bucket.totalByCurrency[inv.currency] ?? 0) + amount;
      bucket.paidCount += 1;
    });

    // ----- 2. Pending invoices (overdue split) -----
    const pendingSnap = await getDocs(
      query(
        col,
        where('status', '==', 'pending'),
        where('createdAt', '>=', fromTs),
        where('createdAt', '<', toExclusiveTs)
      )
    );
    pendingSnap.forEach((d) => {
      const inv = d.data() as Invoice;
      const bucket = getInvoiceKind(inv) === 'purchase' ? purchase : sales;
      if (inv.dueDate.toMillis() < nowMillis) bucket.overdueCount += 1;
      else bucket.pendingNotOverdueCount += 1;
    });

    // ----- 3. GST sums (INR + gstPercent > 0, all statuses) -----
    // GST liability accrues at invoice-issue time regardless of payment, so we
    // include every invoice in the window with gstPercent > 0 and currency INR.
    const gstSnap = await getDocs(
      query(
        col,
        where('createdAt', '>=', fromTs),
        where('createdAt', '<', toExclusiveTs),
        where('gstPercent', '>', 0)
      )
    );
    gstSnap.forEach((d) => {
      const inv = d.data() as Invoice;
      if (inv.currency !== 'INR') return;
      const cgst = Number(inv.cgstAmount ?? 0);
      const sgst = Number(inv.sgstAmount ?? 0);
      const gstAmount = cgst + sgst;
      if (getInvoiceKind(inv) === 'purchase') gst.inputInr += gstAmount;
      else gst.outputInr += gstAmount;
    });
    gst.netInr = roundMoney(gst.outputInr - gst.inputInr);
    gst.outputInr = roundMoney(gst.outputInr);
    gst.inputInr = roundMoney(gst.inputInr);

    // ----- 4. Recent invoices (mixed, newest 10) -----
    const recentSnap = await getDocs(query(col, orderBy('createdAt', 'desc'), fsLimit(10)));
    const recent: Invoice[] = [];
    recentSnap.forEach((d) => recent.push({ id: d.id, ...(d.data() as Omit<Invoice, 'id'>) }));

    return { sales, purchase, gst, recent, from: window.from, toExclusive: window.toExclusive };
  }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function defaultLast90Days(): DateRange {
  const toExclusive = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return { from, toExclusive };
}

// ----- preset helpers used by the dashboard component -----

export type RangePresetId = 'this-month' | 'last-month' | 'last-90-days' | 'custom';

/** Resolve a preset (or a custom from/to pair) into a concrete DateRange. */
export function rangeFromPreset(
  preset: RangePresetId,
  custom?: { from?: string; to?: string }
): DateRange {
  const now = new Date();
  switch (preset) {
    case 'this-month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      // Exclusive upper bound: first day of NEXT month at 00:00 (so "today" is included).
      const toExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
      return { from, toExclusive };
    }
    case 'last-month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const toExclusive = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { from, toExclusive };
    }
    case 'custom': {
      const from = parseLocalDate(custom?.from) ?? defaultLast90Days().from;
      // "To" is inclusive in the date picker; convert to an exclusive upper bound
      // by adding one day so the last day's invoices count.
      const inclusiveTo = parseLocalDate(custom?.to) ?? new Date();
      const toExclusive = new Date(inclusiveTo);
      toExclusive.setDate(toExclusive.getDate() + 1);
      toExclusive.setHours(0, 0, 0, 0);
      return { from, toExclusive };
    }
    case 'last-90-days':
    default:
      return defaultLast90Days();
  }
}

function parseLocalDate(s: string | undefined): Date | null {
  if (!s) return null;
  // `<input type="date">` value is `YYYY-MM-DD`. Construct a local-midnight Date.
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
