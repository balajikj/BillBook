import { Injectable, inject } from '@angular/core';
import {
  Firestore, Timestamp, collection, getDocs, limit as fsLimit, orderBy, query, where
} from '@angular/fire/firestore';
import { Invoice } from '../models/invoice';
import { AuthService } from './auth.service';

export interface DashboardSummary {
  revenueByCurrency: Record<string, number>;
  paidCount: number;
  pendingNotOverdueCount: number;
  overdueCount: number;
  recent: Invoice[];
  windowDays: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);

  async load(): Promise<DashboardSummary> {
    const cid = this.auth.companyId();
    if (!cid) throw new Error('No companyId on the current user');
    const windowDays = 90;
    const since = new Date();
    since.setDate(since.getDate() - windowDays);
    const sinceTs = Timestamp.fromDate(since);
    const now = new Date();
    const nowTs = Timestamp.fromDate(now);

    const col = collection(this.db, `companies/${cid}/invoices`);

    // Paid revenue (bounded by 90 days).
    const paidSnap = await getDocs(
      query(col, where('status', '==', 'paid'), where('createdAt', '>=', sinceTs))
    );
    const revenueByCurrency: Record<string, number> = {};
    let paidCount = 0;
    paidSnap.forEach((d) => {
      const inv = d.data() as Invoice;
      revenueByCurrency[inv.currency] = (revenueByCurrency[inv.currency] ?? 0) + inv.total;
      paidCount += 1;
    });

    // Pending in window — split into overdue vs not.
    const pendingSnap = await getDocs(
      query(col, where('status', '==', 'pending'), where('createdAt', '>=', sinceTs))
    );
    let pendingNotOverdueCount = 0;
    let overdueCount = 0;
    pendingSnap.forEach((d) => {
      const inv = d.data() as Invoice;
      if (inv.dueDate.toMillis() < nowTs.toMillis()) overdueCount += 1;
      else pendingNotOverdueCount += 1;
    });

    // Recent invoices (no time-window restriction — bounded by limit(10)).
    const recentSnap = await getDocs(query(col, orderBy('createdAt', 'desc'), fsLimit(10)));
    const recent: Invoice[] = [];
    recentSnap.forEach((d) => recent.push({ id: d.id, ...(d.data() as Omit<Invoice, 'id'>) }));

    return { revenueByCurrency, paidCount, pendingNotOverdueCount, overdueCount, recent, windowDays };
  }
}
