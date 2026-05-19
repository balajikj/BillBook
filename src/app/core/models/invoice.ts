import { Timestamp } from '@angular/fire/firestore';
import { CustomerSnapshot } from './customer';

export type StoredInvoiceStatus = 'pending' | 'paid';

// Status as displayed in the UI — `overdue` is derived (not stored).
export type DisplayInvoiceStatus = StoredInvoiceStatus | 'overdue';

/**
 * Direction of the bill:
 *   - `sales`: a bill the tenant ISSUES to a customer (money in). Auto-numbered.
 *   - `purchase`: a bill the tenant RECEIVED from a supplier (money out).
 *     The supplier's printed number is stored verbatim — no auto-numbering.
 *
 * Legacy invoices created before this field was added do NOT carry it; every
 * consumer MUST route through `getInvoiceKind(inv)` which returns `'sales'`
 * for those records (the only kind that existed before this change).
 */
export type InvoiceKind = 'sales' | 'purchase';

export interface InvoiceLineItem {
  productId: string | null;  // null if the line item was free-form
  description: string;
  quantity: number;
  unitPrice: number;         // snapshotted at line-add time
  lineTotal: number;         // quantity * unitPrice
  // India-specific (optional; added by india-gst-invoicing).
  hsnSac?: string | null;
}

export interface Invoice {
  id: string;
  number: string;            // e.g. 'INV-2026-0042'
  customer: CustomerSnapshot;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  total: number;             // legacy field; equals subtotal for non-GST invoices
  currency: string;          // ISO 4217
  status: StoredInvoiceStatus;
  issueDate: Timestamp;
  dueDate: Timestamp;
  paidAt?: Timestamp | null;
  notes?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  // India GST fields (optional; added by india-gst-invoicing).
  // When `gstPercent > 0`, `cgstAmount`, `sgstAmount`, `grandTotal` are populated.
  gstPercent?: number | null;
  cgstAmount?: number | null;
  sgstAmount?: number | null;
  otherCharges?: number | null;
  roundOff?: number | null;
  grandTotal?: number | null;
  // Sales vs purchase bill direction (added by sales-purchase-bills).
  // Missing on legacy docs — read via `getInvoiceKind(inv)` which defaults to 'sales'.
  kind?: InvoiceKind;
}

// Counter document at /companies/{cid}/counters/invoice
export interface InvoiceCounter {
  year: number;
  next: number;
}

export function computeDisplayStatus(invoice: Invoice, now: Date = new Date()): DisplayInvoiceStatus {
  if (invoice.status === 'paid') return 'paid';
  // Stored as pending — check overdue.
  return invoice.dueDate.toDate() < now ? 'overdue' : 'pending';
}

/** The amount to show as the final total. `grandTotal` if the invoice carries GST/charges, else legacy `total`. */
export function getDisplayTotal(invoice: Pick<Invoice, 'total' | 'grandTotal'>): number {
  return invoice.grandTotal ?? invoice.total;
}

/** Whether the invoice carries any India GST/charges fields (used to choose the totals layout). */
export function hasIndiaTotals(invoice: Pick<Invoice, 'gstPercent' | 'otherCharges' | 'roundOff' | 'grandTotal'>): boolean {
  return (
    (invoice.gstPercent != null && invoice.gstPercent > 0) ||
    (invoice.otherCharges != null && invoice.otherCharges !== 0) ||
    (invoice.roundOff != null && invoice.roundOff !== 0) ||
    invoice.grandTotal != null
  );
}

/**
 * Central accessor for the bill kind. ALWAYS use this instead of touching
 * `inv.kind` directly so legacy docs (written before the field existed) reliably
 * read as `'sales'`. Code-review rule: any new `.kind` access on an Invoice goes
 * through this function.
 */
export function getInvoiceKind(invoice: Pick<Invoice, 'kind'>): InvoiceKind {
  return invoice.kind ?? 'sales';
}
