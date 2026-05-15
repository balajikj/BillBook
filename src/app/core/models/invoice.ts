import { Timestamp } from '@angular/fire/firestore';
import { CustomerSnapshot } from './customer';

export type StoredInvoiceStatus = 'pending' | 'paid';

// Status as displayed in the UI — `overdue` is derived (not stored).
export type DisplayInvoiceStatus = StoredInvoiceStatus | 'overdue';

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
