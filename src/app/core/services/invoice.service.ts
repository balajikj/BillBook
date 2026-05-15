import { Injectable, inject } from '@angular/core';
import {
  Firestore, Timestamp, collection, collectionData, deleteDoc, doc, docData,
  getDoc, limit as fsLimit, orderBy, query, runTransaction, serverTimestamp, updateDoc, where
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Invoice, InvoiceLineItem, StoredInvoiceStatus } from '../models/invoice';
import { CustomerSnapshot } from '../models/customer';
import { AuthService } from './auth.service';
import { computeCgstSgst, computeGrandTotal, roundMoney } from '../utils/invoice-math';

export interface InvoiceListOptions {
  status?: StoredInvoiceStatus | 'overdue';
  fromDate?: Date;
  toDate?: Date;
  pageSize?: number;
}

export interface CreateInvoiceArgs {
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
    if (opts.fromDate) constraints.push(where('createdAt', '>=', Timestamp.fromDate(opts.fromDate)));
    if (opts.toDate) constraints.push(where('createdAt', '<=', Timestamp.fromDate(opts.toDate)));
    constraints.push(fsLimit(opts.pageSize ?? 25));
    return collectionData(query(col, ...constraints), { idField: 'id' }) as Observable<Invoice[]>;
  }

  get$(id: string): Observable<Invoice | undefined> {
    return docData(doc(this.db, this.invoicesPath(), id), { idField: 'id' }) as Observable<Invoice | undefined>;
  }

  /** Transactionally allocate the next invoice number and create the invoice. */
  async create(args: CreateInvoiceArgs): Promise<{ id: string; number: string }> {
    const cid = this.cid();
    const uid = this.auth.user()!.uid;
    const subtotal = roundMoney(args.lineItems.reduce((sum, li) => sum + li.lineTotal, 0));
    const gstPercent = Number(args.gstPercent ?? 0);
    const otherCharges = roundMoney(Number(args.otherCharges ?? 0));
    const roundOff = roundMoney(Number(args.roundOff ?? 0));
    const { cgst, sgst } = computeCgstSgst(subtotal, gstPercent);
    const grandTotal = computeGrandTotal(subtotal, cgst, sgst, otherCharges, roundOff);
    // `total` stays for back-compat; it equals subtotal when there's no GST/charges (legacy behaviour),
    // otherwise it mirrors grandTotal so anything that still reads `total` shows the final amount.
    const hasIndiaFields = gstPercent > 0 || otherCharges !== 0 || roundOff !== 0;
    const total = hasIndiaFields ? grandTotal : subtotal;
    const year = new Date().getFullYear();

    return await runTransaction(this.db, async (tx) => {
      const counterRef = doc(this.db, `companies/${cid}/counters/invoice`);
      const counterSnap = await tx.get(counterRef);
      let next: number;
      let yr: number;
      if (!counterSnap.exists()) {
        next = 1; yr = year;
      } else {
        const data = counterSnap.data() as { year: number; next: number };
        if (data.year === year) {
          next = data.next; yr = year;
        } else {
          next = 1; yr = year;
        }
      }
      const number = `INV-${yr}-${String(next).padStart(4, '0')}`;
      tx.set(counterRef, { year: yr, next: next + 1 });

      const invoiceRef = doc(collection(this.db, this.invoicesPath()));
      const doc_: Record<string, unknown> = {
        number,
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
      // Persist India GST fields only when meaningful (keep legacy invoices clean).
      if (hasIndiaFields) {
        doc_['gstPercent'] = gstPercent;
        doc_['cgstAmount'] = cgst;
        doc_['sgstAmount'] = sgst;
        doc_['otherCharges'] = otherCharges;
        doc_['roundOff'] = roundOff;
        doc_['grandTotal'] = grandTotal;
      }
      tx.set(invoiceRef, doc_);
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
