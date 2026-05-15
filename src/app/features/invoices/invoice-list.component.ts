import { Component, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { InvoiceService, InvoiceListOptions } from '../../core/services/invoice.service';
import { computeDisplayStatus } from '../../core/models/invoice';

type StatusFilter = '' | 'paid' | 'pending' | 'overdue';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [AsyncPipe, DatePipe, DecimalPipe, ReactiveFormsModule, RouterLink],
  template: `
    <header class="row">
      <h1>Invoices</h1>
      <a routerLink="/app/invoices/new" class="btn">+ New invoice</a>
    </header>

    <form [formGroup]="filterForm" class="filters">
      <label>Status
        <select formControlName="status">
          <option value="">All</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending (not overdue)</option>
          <option value="overdue">Overdue</option>
        </select>
      </label>
      <label>From <input type="date" formControlName="fromDate" /></label>
      <label>To <input type="date" formControlName="toDate" /></label>
    </form>

    <table class="grid">
      <thead><tr><th>Number</th><th>Customer</th><th>Total</th><th>Status</th><th>Issued</th><th>Due</th></tr></thead>
      <tbody>
        @for (inv of (invoices$ | async) ?? []; track inv.id) {
          <tr (click)="open(inv.id)">
            <td>{{ inv.number }}</td>
            <td>{{ inv.customer.name }}</td>
            <td>{{ inv.total | number:'1.2-2' }} {{ inv.currency }}</td>
            <td><span class="badge" [class]="statusFor(inv)">{{ statusFor(inv) }}</span></td>
            <td>{{ inv.issueDate.toDate() | date:'mediumDate' }}</td>
            <td>{{ inv.dueDate.toDate() | date:'mediumDate' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="muted">No invoices match.</td></tr>
        }
      </tbody>
    </table>
    <p class="muted small">Showing up to 25 invoices.</p>
  `,
  styles: [`
    .row { display: flex; align-items: center; justify-content: space-between; }
    h1 { margin: 0 0 12px 0; }
    .btn { background: #1e6fff; color: white; padding: 8px 12px; border-radius: 4px; text-decoration: none; }
    .filters { display: flex; gap: 12px; margin: 8px 0; }
    .filters label { font-size: 13px; }
    .filters select, .filters input { padding: 4px; }
    .grid { width: 100%; border-collapse: collapse; background: white; }
    .grid th, .grid td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
    .grid th { background: #f5f5f5; font-size: 13px; }
    .grid tbody tr { cursor: pointer; }
    .grid tbody tr:hover { background: #f9fbff; }
    .badge { padding: 2px 6px; border-radius: 10px; font-size: 11px; background: #eee; }
    .badge.paid { background: #d3f4d3; color: #1e6f1e; }
    .badge.pending { background: #fff1c1; color: #6a5a00; }
    .badge.overdue { background: #f4d3d3; color: #6f1e1e; }
    .muted { color: #888; }
    .small { font-size: 12px; }
  `]
})
export class InvoiceListComponent {
  private readonly invoices = inject(InvoiceService);
  private readonly router = inject(Router);

  readonly filterForm = new FormGroup({
    status: new FormControl<StatusFilter>('', { nonNullable: true }),
    fromDate: new FormControl<string>('', { nonNullable: true }),
    toDate: new FormControl<string>('', { nonNullable: true })
  });

  private readonly filtersSig = signal<InvoiceListOptions>({ pageSize: 25 });
  readonly invoices$ = toObservable(this.filtersSig).pipe(
    switchMap((opts) => this.invoices.list$(opts))
  );

  constructor() {
    this.filterForm.valueChanges.subscribe((v) => {
      const opts: InvoiceListOptions = { pageSize: 25 };
      if (v.status) opts.status = v.status as InvoiceListOptions['status'];
      if (v.fromDate) opts.fromDate = new Date(v.fromDate);
      if (v.toDate) opts.toDate = new Date(v.toDate);
      this.filtersSig.set(opts);
    });
  }

  statusFor(inv: any): string {
    return computeDisplayStatus(inv);
  }

  open(id: string): void {
    this.router.navigate(['/app/invoices', id]);
  }
}
