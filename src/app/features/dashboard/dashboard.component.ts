import { Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DashboardService, DashboardSummary, KindMetrics, RangePresetId, rangeFromPreset
} from '../../core/services/dashboard.service';
import { computeDisplayStatus, getInvoiceKind, Invoice, InvoiceKind } from '../../core/models/invoice';

interface CurrencyEntry { currency: string; amount: number; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, RouterLink],
  template: `
    <h1>Dashboard</h1>

    <form [formGroup]="rangeForm" class="range-picker">
      <label>Range
        <select formControlName="preset">
          <option value="this-month">This month</option>
          <option value="last-month">Last month</option>
          <option value="last-90-days">Last 90 days</option>
          <option value="custom">Custom…</option>
        </select>
      </label>
      @if (rangeForm.controls.preset.value === 'custom') {
        <label>From <input type="date" formControlName="from" /></label>
        <label>To <input type="date" formControlName="to" /></label>
        <button type="button" (click)="applyCustom()">Apply</button>
      }
      @if (summary(); as s) {
        <span class="range-summary muted small">
          {{ s.from | date:'mediumDate' }} – {{ inclusiveToLabel(s) | date:'mediumDate' }}
        </span>
      }
    </form>

    @if (error(); as e) {
      <p class="error">Failed to load dashboard: {{ e }}</p>
    } @else if (!summary() || busy()) {
      <p class="muted">Loading…</p>
    } @else if (summary(); as s) {

      <!-- ---------- Sales ---------- -->
      <h2>Sales</h2>
      <div class="cards">
        <div class="card">
          <h3>Revenue (paid)</h3>
          @if (entriesOf(s.sales).length === 0) {
            <p class="muted">No paid sales.</p>
          } @else {
            @for (e of entriesOf(s.sales); track e.currency) {
              <div class="kv"><span>{{ e.currency }}</span><strong>{{ e.amount | number:'1.2-2' }}</strong></div>
            }
          }
        </div>
        <div class="card"><h3>Paid</h3><div class="big">{{ s.sales.paidCount }}</div></div>
        <div class="card"><h3>Pending</h3><div class="big">{{ s.sales.pendingNotOverdueCount }}</div></div>
        <div class="card alert"><h3>Overdue</h3><div class="big">{{ s.sales.overdueCount }}</div></div>
      </div>

      <!-- ---------- Purchase ---------- -->
      <h2>Purchase</h2>
      <div class="cards">
        <div class="card">
          <h3>Paid out</h3>
          @if (entriesOf(s.purchase).length === 0) {
            <p class="muted">No paid purchases.</p>
          } @else {
            @for (e of entriesOf(s.purchase); track e.currency) {
              <div class="kv"><span>{{ e.currency }}</span><strong>{{ e.amount | number:'1.2-2' }}</strong></div>
            }
          }
        </div>
        <div class="card"><h3>Paid</h3><div class="big">{{ s.purchase.paidCount }}</div></div>
        <div class="card"><h3>Pending</h3><div class="big">{{ s.purchase.pendingNotOverdueCount }}</div></div>
        <div class="card alert"><h3>Overdue</h3><div class="big">{{ s.purchase.overdueCount }}</div></div>
      </div>

      <!-- ---------- GST Summary ---------- -->
      <h2>GST Summary <span class="muted small">(INR only)</span></h2>
      <div class="cards cards-3">
        <div class="card">
          <h3>Output GST <span class="muted small">(sales)</span></h3>
          <div class="big">{{ s.gst.outputInr | number:'1.2-2' }}</div>
          <p class="muted small">INR</p>
        </div>
        <div class="card">
          <h3>Input GST <span class="muted small">(purchase)</span></h3>
          <div class="big">{{ s.gst.inputInr | number:'1.2-2' }}</div>
          <p class="muted small">INR</p>
        </div>
        <div class="card" [class.alert]="s.gst.netInr > 0" [class.ok]="s.gst.netInr < 0">
          <h3>Net liability</h3>
          @if (s.gst.netInr > 0) {
            <div class="big">{{ s.gst.netInr | number:'1.2-2' }}</div>
            <p class="small">INR payable</p>
          } @else if (s.gst.netInr < 0) {
            <div class="big">{{ -s.gst.netInr | number:'1.2-2' }}</div>
            <p class="small">INR ITC available</p>
          } @else {
            <div class="big">0.00</div>
            <p class="small muted">Balanced</p>
          }
        </div>
      </div>
      <p class="muted small caveat">
        INR-only estimate over the selected range. Not a tax filing report.
      </p>

      <!-- ---------- Recent invoices ---------- -->
      <h2>Recent invoices <span class="muted small">(newest 10, all dates)</span></h2>
      <table class="grid">
        <thead><tr><th>Number</th><th>Kind</th><th>Customer / Vendor</th><th>Total</th><th>Status</th><th>Issued</th></tr></thead>
        <tbody>
          @for (inv of s.recent; track inv.id) {
            <tr>
              <td><a [routerLink]="['/app/invoices', inv.id]">{{ inv.number }}</a></td>
              <td><span class="kind-badge" [class]="kindOf(inv)">{{ kindLabel(inv) }}</span></td>
              <td>{{ inv.customer.name }}</td>
              <td>{{ inv.total | number:'1.2-2' }} {{ inv.currency }}</td>
              <td><span class="badge" [class]="displayStatus(inv)">{{ displayStatus(inv) }}</span></td>
              <td>{{ inv.issueDate.toDate() | date:'mediumDate' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="muted">No invoices yet.</td></tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [`
    h1 { margin: 0 0 4px 0; }
    h2 { margin-top: 24px; font-size: 16px; }
    .range-picker { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin: 8px 0 16px; padding: 10px 12px; background: #fafafa; border: 1px solid #ddd; border-radius: 6px; }
    .range-picker label { display: flex; flex-direction: column; font-size: 12px; color: #555; gap: 4px; }
    .range-picker select, .range-picker input { padding: 6px; border: 1px solid #ccc; border-radius: 4px; font: inherit; }
    .range-picker button { background: #1e6fff; color: white; border: 0; padding: 8px 14px; border-radius: 4px; cursor: pointer; }
    .range-summary { margin-left: auto; align-self: center; font-style: italic; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 8px; }
    .cards-3 { grid-template-columns: repeat(3, 1fr); }
    .card { border: 1px solid #ddd; border-radius: 6px; padding: 12px; background: white; }
    .card h3 { font-size: 13px; margin: 0 0 6px 0; color: #555; font-weight: 500; }
    .card .big { font-size: 28px; font-weight: 600; }
    .card.alert { border-color: #f4d3d3; background: #fff8f8; }
    .card.ok { border-color: #d3f4d3; background: #f5fff5; }
    .kv { display: flex; justify-content: space-between; padding: 2px 0; }
    .caveat { margin-top: 6px; font-style: italic; }
    .grid { width: 100%; border-collapse: collapse; margin-top: 8px; background: white; }
    .grid th, .grid td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
    .grid th { background: #f5f5f5; font-size: 12px; }
    .badge { padding: 2px 6px; border-radius: 10px; font-size: 11px; background: #eee; }
    .badge.paid { background: #d3f4d3; color: #1e6f1e; }
    .badge.pending { background: #fff1c1; color: #6a5a00; }
    .badge.overdue { background: #f4d3d3; color: #6f1e1e; }
    .kind-badge { padding: 2px 6px; border-radius: 10px; font-size: 11px; }
    .kind-badge.sales { background: #e3f0ff; color: #1e3a8a; }
    .kind-badge.purchase { background: #f3e8ff; color: #5b21b6; }
    .muted { color: #888; }
    .small { font-size: 12px; }
    .error { color: #c0392b; }
  `]
})
export class DashboardComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dashboard = inject(DashboardService);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  /** The range form. `preset` drives the dashboard reload on change; the
   *  `from`/`to` inputs are only honored when `preset === 'custom'` and the
   *  user clicks Apply. */
  readonly rangeForm = this.fb.nonNullable.group({
    preset: 'last-90-days' as RangePresetId,
    from: '',
    to: ''
  });

  constructor() {
    this.reload();
    // Preset changes (excluding Custom) auto-reload. Custom waits for Apply
    // because the user typically types both dates before recomputing.
    this.rangeForm.controls.preset.valueChanges.subscribe((p) => {
      if (p !== 'custom') this.reload();
    });
  }

  applyCustom(): void {
    this.reload();
  }

  /** Last day of the reporting interval (inclusive), for display only. */
  inclusiveToLabel(s: DashboardSummary): Date {
    const d = new Date(s.toExclusive);
    d.setDate(d.getDate() - 1);
    return d;
  }

  private reload(): void {
    const v = this.rangeForm.getRawValue();
    const range = rangeFromPreset(v.preset, { from: v.from, to: v.to });
    this.busy.set(true);
    this.error.set(null);
    this.dashboard.load(range)
      .then(s => this.summary.set(s))
      .catch(e => this.error.set(e?.message ?? String(e)))
      .finally(() => this.busy.set(false));
  }

  entriesOf(metrics: KindMetrics): CurrencyEntry[] {
    return Object.entries(metrics.totalByCurrency).map(([currency, amount]) => ({ currency, amount }));
  }

  displayStatus(inv: Invoice): string {
    return computeDisplayStatus(inv);
  }

  kindOf(inv: Invoice): InvoiceKind {
    return getInvoiceKind(inv);
  }

  kindLabel(inv: Invoice): string {
    return getInvoiceKind(inv) === 'purchase' ? 'Purchase' : 'Sales';
  }
}
