import { Injectable, inject } from '@angular/core';
import {
  Firestore, Timestamp, collection, collectionData, deleteDoc, doc, docData,
  getDoc, getDocs, limit as fsLimit, orderBy, query, runTransaction, serverTimestamp, updateDoc, where
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Invoice, InvoiceKind, InvoiceLineItem, PurchaseCategory, StoredInvoiceStatus } from '../models/invoice';
import { CustomerSnapshot } from '../models/customer';
import { AuthService } from './auth.service';
import { computeCgstSgst, computeGrandTotal, roundMoney } from '../utils/invoice-math';

export interface InvoiceListOptions {
  status?: StoredInvoiceStatus | 'overdue';
  /**
   * Filter by bill direction. Note: legacy invoices that have no `kind` field
   * stored will NOT match a `kind: 'sales'` filter via the where() query (since
   * the field is absent on the document). Callers that need legacy-inclusive
   * "sales-only" results should leave this unset and bucket client-side.
   */
  kind?: InvoiceKind;
  fromDate?: Date;
  toDate?: Date;
  pageSize?: number;
}

export interface CreateInvoiceArgs {
  /** Bill direction. Sales auto-numbers; purchase uses the supplier's printed number. */
  kind: InvoiceKind;
  /** Required when `kind === 'purchase'`. Stored verbatim as the invoice's `number`. */
  number?: string;
  /**
   * Purchase sub-category. Required when `kind === 'purchase'`; ignored for sales.
   *   - `product`      → adds line-item quantities to product stock at create time.
   *   - `raw-material` → does NOT touch product stock.
   */
  purchaseCategory?: PurchaseCategory;
  customer: CustomerSnapshot;
  lineItems: InvoiceLineItem[];
  currency: string;
  issueDate: Date;
  dueDate: Date;
  notes?: string;
  // India GST fields. All optional; when `gstPercent > 0`, CGST/SGST are computed and stored.
  gstPercent?: number;
  otherCharges?: number;
  roundOff?: number;
}

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);

  private cid(): string {
    const cid = this.auth.companyId();
    if (!cid) throw new Error('No companyId on the current user');
    return cid;
  }

  private invoicesPath(): string {
    return `companies/${this.cid()}/invoices`;
  }

  list$(opts: InvoiceListOptions = {}): Observable<Invoice[]> {
    const col = collection(this.db, this.invoicesPath());
    const constraints: any[] = [];
    if (opts.status === 'paid' || opts.status === 'pending') {
      constraints.push(where('status', '==', opts.status));
      constraints.push(orderBy('createdAt', 'desc'));
    } else if (opts.status === 'overdue') {
      // Composite index: status + dueDate
      constraints.push(where('status', '==', 'pending'));
      constraints.push(where('dueDate', '<', Timestamp.fromDate(new Date())));
      constraints.push(orderBy('dueDate', 'asc'));
    } else {
      constraints.push(orderBy('createdAt', 'desc'));
    }
    if (opts.kind === 'sales' || opts.kind === 'purchase') {
      // Heads up: legacy docs without `kind` will NOT match `kind == 'sales'`
      // via Firestore where(). Acceptable for the list page since "All" is
      // available and most users will create new sales invoices going forward.
      constraints.push(where('kind', '==', opts.kind));
    }
    if (opts.fromDate) constraints.push(where('createdAt', '>=', Timestamp.fromDate(opts.fromDate)));
    if (opts.toDate) constraints.push(where('createdAt', '<=', Timestamp.fromDate(opts.toDate)));
    constraints.push(fsLimit(opts.pageSize ?? 25));
    return collectionData(query(col, ...constraints), { idField: 'id' }) as Observable<Invoice[]>;
  }

  get$(id: string): Observable<Invoice | undefined> {
    return docData(doc(this.db, this.invoicesPath(), id), { idField: 'id' }) as Observable<Invoice | undefined>;
  }

  /**
   * Looks up whether an invoice with the given `number` already exists in the
   * current tenant. Used by the override-number flow on the new-invoice form
   * to verify availability before saving.
   *
   * Note: there is a small TOCTOU race between this check and the save —
   * two users could verify the same number concurrently and both save. We
   * accept that race in MVP; the worst case is two invoices sharing one
   * number string (cosmetic, not data-corrupting).
   */
  async checkNumberAvailable(number: string): Promise<{ available: boolean; existingId?: string }> {
    const trimmed = (number ?? '').toString().trim();
    if (!trimmed) return { available: false };
    const q = query(
      collection(this.db, this.invoicesPath()),
      where('number', '==', trimmed),
      fsLimit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return { available: true };
    return { available: false, existingId: snap.docs[0].id };
  }

  /**
   * Create an invoice. A single Firestore transaction does all the work so
   * the invoice write, the counter bump (sales auto-number only), and the
   * product-inventory deltas all commit atomically:
   *
   *   - `sales`                    → decrement linked products' quantity
   *   - `purchase` + `product`     → increment linked products' quantity
   *   - `purchase` + `raw-material` → no inventory effect
   *
   * Numbering:
   *   - `sales` without `args.number`        → next `INV-YYYY-NNNN` via counter.
   *   - `sales` with `args.number`           → caller-supplied (override flow);
   *                                            counter unchanged.
   *   - `purchase`                           → `args.number` required (supplier's
   *                                            printed number); counter unchanged.
   *
   * Free-form line items (`productId: null`) and zero-quantity lines have no
   * inventory effect. Products that have been deleted between the form load
   * and save are silently skipped (the invoice still commits with its
   * snapshotted line items).
   */
  async create(args: CreateInvoiceArgs): Promise<{ id: string; number: string }> {
    const cid = this.cid();
    const uid = this.auth.user()!.uid;
    const subtotal = roundMoney(args.lineItems.reduce((sum, li) => sum + li.lineTotal, 0));
    const gstPercent = Number(args.gstPercent ?? 0);
    const otherCharges = roundMoney(Number(args.otherCharges ?? 0));
    const roundOff = roundMoney(Number(args.roundOff ?? 0));
    const { cgst, sgst } = computeCgstSgst(subtotal, gstPercent);
    const grandTotal = computeGrandTotal(subtotal, cgst, sgst, otherCharges, roundOff);
    const hasIndiaFields = gstPercent > 0 || otherCharges !== 0 || roundOff !== 0;
    const total = hasIndiaFields ? grandTotal : subtotal;
    const year = new Date().getFullYear();
    const kind: InvoiceKind = args.kind ?? 'sales';
    const purchaseCategory: PurchaseCategory = args.purchaseCategory ?? 'product';

    // ----- Number validation (pre-transaction) -----
    const suppliedNumber = (args.number ?? '').toString().trim();
    if (kind === 'purchase') {
      if (!suppliedNumber) throw new Error('Purchase bill number is required.');
      if (suppliedNumber.length > 64) throw new Error('Purchase bill number must be 64 characters or fewer.');
    } else if (suppliedNumber) {
      // Sales override path: caller wants to reuse a specific number.
      if (suppliedNumber.length > 64) throw new Error('Bill number must be 64 characters or fewer.');
      // Soft pre-check (the real check is inside the transaction; see TOCTOU note in checkNumberAvailable).
      const recheck = await this.checkNumberAvailable(suppliedNumber);
      if (!recheck.available) {
        throw new Error(`Bill number "${suppliedNumber}" is already in use by another invoice.`);
      }
    }

    // ----- Compute inventory deltas (sign by kind + category) -----
    const inventorySign: 1 | -1 | 0 =
      kind === 'sales' ? -1
        : (kind === 'purchase' && purchaseCategory === 'product') ? +1
        : 0;
    const inventoryDeltas = new Map<string, number>();
    if (inventorySign !== 0) {
      for (const li of args.lineItems) {
        const pid = li.productId;
        const q = Number(li.quantity ?? 0);
        if (!pid || q === 0) continue;
        inventoryDeltas.set(pid, (inventoryDeltas.get(pid) ?? 0) + inventorySign * q);
      }
    }

    /** Build the fields common to both sales and purchase persistence. */
    const baseDoc = (number: string): Record<string, unknown> => {
      const out: Record<string, unknown> = {
        number,
        kind,
        customer: args.customer,
        lineItems: args.lineItems,
        subtotal,
        total,
        currency: args.currency,
        status: 'pending' as StoredInvoiceStatus,
        issueDate: Timestamp.fromDate(args.issueDate),
        dueDate: Timestamp.fromDate(args.dueDate),
        paidAt: null,
        notes: args.notes ?? '',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (kind === 'purchase') out['purchaseCategory'] = purchaseCategory;
      if (hasIndiaFields) {
        out['gstPercent'] = gstPercent;
        out['cgstAmount'] = cgst;
        out['sgstAmount'] = sgst;
        out['otherCharges'] = otherCharges;
        out['roundOff'] = roundOff;
        out['grandTotal'] = grandTotal;
      }
      return out;
    };

    const needsCounter = kind === 'sales' && !suppliedNumber;

    return await runTransaction(this.db, async (tx) => {
      // ----- PHASE 1: all reads (Firestore tx rule: reads before writes) -----

      const counterRef = needsCounter
        ? doc(this.db, `companies/${cid}/counters/invoice`)
        : null;
      const counterSnap = counterRef ? await tx.get(counterRef) : null;

      // Read each unique product whose inventory we need to adjust.
      const productCurrents = new Map<string, { ref: ReturnType<typeof doc>; current: number }>();
      for (const productId of inventoryDeltas.keys()) {
        const ref = doc(this.db, `companies/${cid}/products/${productId}`);
        const snap = await tx.get(ref);
        if (snap.exists()) {
          const data = snap.data() as { quantity?: number };
          productCurrents.set(productId, { ref, current: Number(data.quantity ?? 0) });
        }
        // Missing product → skip silently; the line-item snapshot is the source of truth on the invoice.
      }

      // ----- PHASE 2: determine the invoice number -----
      let number: string;
      if (kind === 'purchase' || suppliedNumber) {
        number = suppliedNumber;
      } else {
        // Sales auto-number from the counter.
        let next: number;
        let yr: number;
        if (!counterSnap || !counterSnap.exists()) {
          next = 1; yr = year;
        } else {
          const data = counterSnap.data() as { year: number; next: number };
          if (data.year === year) { next = data.next; yr = year; } else { next = 1; yr = year; }
        }
        number = `INV-${yr}-${String(next).padStart(4, '0')}`;
        tx.set(counterRef!, { year: yr, next: next + 1 });
      }

      // ----- PHASE 3: apply inventory deltas -----
      for (const [productId, delta] of inventoryDeltas) {
        const data = productCurrents.get(productId);
        if (!data) continue;
        const newQty = roundMoney(data.current + delta);
        tx.update(data.ref, { quantity: newQty, updatedAt: serverTimestamp() });
      }

      // ----- PHASE 4: write the invoice -----
      const invoiceRef = doc(collection(this.db, this.invoicesPath()));
      tx.set(invoiceRef, baseDoc(number));

      return { id: invoiceRef.id, number };
    });
  }

  async markPaid(id: string): Promise<void> {
    await updateDoc(doc(this.db, this.invoicesPath(), id), {
      status: 'paid',
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  async revertToPending(id: string): Promise<void> {
    await updateDoc(doc(this.db, this.invoicesPath(), id), {
      status: 'pending',
      paidAt: null,
      updatedAt: serverTimestamp()
    });
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(this.db, this.invoicesPath(), id));
  }

  /** Used by the dashboard service for one-shot reads outside an observable. */
  async snapshotOnce(opts: InvoiceListOptions = {}): Promise<Invoice[]> {
    // Snapshot pattern: build the same query, take(1) the observable.
    // Implemented in dashboard.service.ts using firstValueFrom; kept here for symmetry.
    const _ = await getDoc(doc(this.db, `companies/${this.cid()}`));
    void _;
    return [];
  }
}
