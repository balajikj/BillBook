import { Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService, DashboardSummary } from '../../core/services/dashboard.service';
import { computeDisplayStatus } from '../../core/models/invoice';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <h1>Dashboard</h1>
    <p class="muted small">Summary covers the last {{ summary()?.windowDays ?? 90 }} days.</p>

    @if (error(); as e) {
      <p class="error">Failed to load dashboard: {{ e }}</p>
    } @else if (!summary()) {
      <p class="muted">Loading…</p>
    } @else if (summary(); as s) {
      <div class="cards">
        <div class="card">
          <h3>Revenue (paid)</h3>
          @if (revenueEntries().length === 0) {
            <p class="muted">No paid invoices.</p>
          } @else {
            @for (e of revenueEntries(); track e.currency) {
              <div class="kv">
                <span>{{ e.currency }}</span>
                <strong>{{ e.amount | number:'1.2-2' }}</strong>
              </div>
            }
          }
        </div>
        <div class="card"><h3>Paid</h3><div class="big">{{ s.paidCount }}</div></div>
        <div class="card"><h3>Pending</h3><div class="big">{{ s.pendingNotOverdueCount }}</div></div>
        <div class="card alert"><h3>Overdue</h3><div class="big">{{ s.overdueCount }}</div></div>
      </div>

      <h2>Recent invoices</h2>
      <table class="grid">
        <thead><tr><th>Number</th><th>Customer</th><th>Total</th><th>Status</th><th>Issued</th></tr></thead>
        <tbody>
          @for (inv of s.recent; track inv.id) {
            <tr>
              <td><a [routerLink]="['/app/invoices', inv.id]">{{ inv.number }}</a></td>
              <td>{{ inv.customer.name }}</td>
              <td>{{ inv.total | number:'1.2-2' }} {{ inv.currency }}</td>
              <td><span class="badge" [class]="displayStatus(inv)">{{ displayStatus(inv) }}</span></td>
              <td>{{ inv.issueDate.toDate() | date:'mediumDate' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="muted">No invoices yet.</td></tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [`
    h1 { margin: 0 0 4px 0; }
    h2 { margin-top: 24px; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 12px; }
    .card { border: 1px solid #ddd; border-radius: 6px; padding: 12px; background: white; }
    .card h3 { font-size: 13px; margin: 0 0 6px 0; color: #555; font-weight: 500; }
    .card .big { font-size: 28px; font-weight: 600; }
    .card.alert { border-color: #f4d3d3; background: #fff8f8; }
    .kv { display: flex; justify-content: space-between; padding: 2px 0; }
    .grid { width: 100%; border-collapse: collapse; margin-top: 8px; background: white; }
    .grid th, .grid td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
    .grid th { background: #f5f5f5; font-size: 12px; }
    .badge { padding: 2px 6px; border-radius: 10px; font-size: 11px; background: #eee; }
    .badge.paid { background: #d3f4d3; color: #1e6f1e; }
    .badge.pending { background: #fff1c1; color: #6a5a00; }
    .badge.overdue { background: #f4d3d3; color: #6f1e1e; }
    .muted { color: #888; }
    .small { font-size: 12px; }
    .error { color: #c0392b; }
  `]
})
export class DashboardComponent {
  private readonly dashboard = inject(DashboardService);
  readonly summary = signal<DashboardSummary | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    this.dashboard.load()
      .then(s => this.summary.set(s))
      .catch(e => this.error.set(e?.message ?? String(e)));
  }

  revenueEntries(): Array<{ currency: string; amount: number }> {
    const s = this.summary();
    if (!s) return [];
    return Object.entries(s.revenueByCurrency).map(([currency, amount]) => ({ currency, amount }));
  }

  displayStatus(inv: any): string {
    return computeDisplayStatus(inv);
  }
}
