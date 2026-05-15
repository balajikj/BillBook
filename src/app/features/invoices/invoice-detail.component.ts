import { Component, Input, computed, inject, signal } from '@angular/core';
import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { switchMap, of } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { InvoiceService } from '../../core/services/invoice.service';
import { CompanyService } from '../../core/services/company.service';
import { AuthService } from '../../core/services/auth.service';
import { PdfService } from '../../core/services/pdf.service';
import { Invoice, computeDisplayStatus, getDisplayTotal, hasIndiaTotals } from '../../core/models/invoice';
import { numberToWords } from '../../core/utils/number-to-words';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [AsyncPipe, DatePipe, DecimalPipe, RouterLink],
  template: `
    <p><a routerLink="/app/invoices">← Invoices</a></p>

    @if (invoice$ | async; as inv) {
      <header class="row">
        <h1>{{ inv.number }}</h1>
        <span class="badge" [class]="status(inv)">{{ status(inv) }}</span>
      </header>

      <section class="row gap">
        <div class="bill-to">
          <h3>Bill to</h3>
          <p class="bill-to-name">{{ inv.customer.name }}</p>
          @if (inv.customer.shopName) { <p>{{ inv.customer.shopName }}</p> }
          @if (inv.customer.fullAddress) { <p class="address">{{ inv.customer.fullAddress }}</p> }
          @else if (inv.customer.address) { <p>{{ inv.customer.address }}</p> }
          @if (inv.customer.gstNumber) { <p><strong>GSTIN:</strong> <code>{{ inv.customer.gstNumber }}</code></p> }
          @if (inv.customer.phoneNumber) { <p><strong>Phone:</strong> {{ inv.customer.phoneNumber }}</p> }
          @if (inv.customer.email) { <p>{{ inv.customer.email }}</p> }
        </div>
        <div>
          <h3>Dates</h3>
          <p>Invoice date: {{ inv.issueDate.toDate() | date:'mediumDate' }}</p>
          <p>Due: {{ inv.dueDate.toDate() | date:'mediumDate' }}</p>
          @if (inv.paidAt) { <p>Paid: {{ inv.paidAt.toDate() | date:'mediumDate' }}</p> }
        </div>
      </section>

      <table class="grid">
        <thead>
          <tr>
            <th>Description</th>
            @if (hasHsnColumn(inv)) { <th>HSN/SAC</th> }
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          @for (li of inv.lineItems; track $index) {
            <tr>
              <td>{{ li.description }}</td>
              @if (hasHsnColumn(inv)) { <td>{{ li.hsnSac ?? '' }}</td> }
              <td>{{ li.quantity }}</td>
              <td>{{ li.unitPrice | number:'1.2-2' }} {{ inv.currency }}</td>
              <td>{{ li.lineTotal | number:'1.2-2' }} {{ inv.currency }}</td>
            </tr>
          }
        </tbody>
      </table>

      @if (hasIndia(inv)) {
        <div class="totals-card">
          <p class="row-line"><span>Subtotal</span><span>{{ inv.subtotal | number:'1.2-2' }} {{ inv.currency }}</span></p>
          @if ((inv.gstPercent ?? 0) > 0) {
            <p class="row-line"><span>CGST ({{ halfGst(inv) | number:'1.0-2' }}%)</span><span>{{ inv.cgstAmount | number:'1.2-2' }} {{ inv.currency }}</span></p>
            <p class="row-line"><span>SGST ({{ halfGst(inv) | number:'1.0-2' }}%)</span><span>{{ inv.sgstAmount | number:'1.2-2' }} {{ inv.currency }}</span></p>
          }
          @if ((inv.otherCharges ?? 0) !== 0) {
            <p class="row-line"><span>Other Charges</span><span>{{ inv.otherCharges | number:'1.2-2' }} {{ inv.currency }}</span></p>
          }
          @if ((inv.roundOff ?? 0) !== 0) {
            <p class="row-line"><span>Round Off</span><span>{{ inv.roundOff | number:'1.2-2' }} {{ inv.currency }}</span></p>
          }
          <p class="grand-row"><span>Grand Total</span><span>{{ getDisplayTotal(inv) | number:'1.2-2' }} {{ inv.currency }}</span></p>
          <p class="words"><strong>Amount in words:</strong> {{ grandTotalWords(inv) }}</p>
        </div>
      } @else {
        <p class="right"><strong>Subtotal:</strong> {{ inv.subtotal | number:'1.2-2' }} {{ inv.currency }}</p>
        <p class="right"><strong>Total:</strong> {{ inv.total | number:'1.2-2' }} {{ inv.currency }}</p>
      }

      @if (inv.notes) { <p class="notes">{{ inv.notes }}</p> }

      <div class="actions">
        <button type="button" (click)="downloadPdf(inv)" [disabled]="downloading()">
          {{ downloading() ? 'Generating…' : 'Download PDF' }}
        </button>
        @if (isAdmin()) {
          @if (inv.status === 'pending') {
            <button type="button" (click)="markPaid(inv.id)">Mark as Paid</button>
          } @else {
            <button type="button" (click)="revertToPending(inv.id)">Revert to Pending</button>
          }
          <button type="button" (click)="confirmRemove(inv)" class="danger">Delete</button>
        }
      </div>
      @if (error(); as e) { <p class="error">{{ e }}</p> }
    } @else {
      <p>Loading…</p>
    }
  `,
  styles: [`
    h1 { margin: 0; }
    .row { display: flex; align-items: center; gap: 12px; }
    .gap { gap: 40px; align-items: flex-start; margin: 12px 0; }
    .bill-to .bill-to-name { font-weight: 600; }
    .bill-to .address { white-space: pre-line; }
    .bill-to code { background: #eee; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
    .grid { width: 100%; border-collapse: collapse; margin: 12px 0; background: white; }
    .grid th, .grid td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
    .grid th { background: #f5f5f5; font-size: 13px; }
    .badge { padding: 2px 8px; border-radius: 10px; font-size: 12px; background: #eee; text-transform: uppercase; }
    .badge.paid { background: #d3f4d3; color: #1e6f1e; }
    .badge.pending { background: #fff1c1; color: #6a5a00; }
    .badge.overdue { background: #f4d3d3; color: #6f1e1e; }
    .right { text-align: right; margin: 4px 0; }
    .totals-card { margin: 12px 0 16px auto; max-width: 480px; padding: 12px 16px; border: 1px solid #b8d4ff; background: #f0f6ff; border-radius: 6px; }
    .totals-card .row-line { display: flex; justify-content: space-between; margin: 2px 0; }
    .totals-card .grand-row { display: flex; justify-content: space-between; font-weight: 700; font-size: 18px; border-top: 1px solid #b8d4ff; padding-top: 6px; margin-top: 6px; }
    .totals-card .words { margin-top: 8px; font-style: italic; color: #333; }
    .notes { font-style: italic; color: #555; padding: 8px; background: #f9f9f9; border-radius: 4px; }
    .actions { margin: 16px 0; display: flex; gap: 8px; }
    button { background: #1e6fff; color: white; border: 0; padding: 8px 14px; border-radius: 4px; cursor: pointer; }
    button[disabled] { opacity: 0.6; cursor: progress; }
    button.danger { background: #c0392b; }
    .error { color: #c0392b; }
  `]
})
export class InvoiceDetailComponent {
  private readonly invoiceSvc = inject(InvoiceService);
  private readonly companySvc = inject(CompanyService);
  private readonly pdfSvc = inject(PdfService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  // Component-input-binding wires the :id route param into this signal.
  @Input() id: string | undefined;
  private readonly idSig = signal<string | undefined>(undefined);
  ngOnChanges(): void { this.idSig.set(this.id); }

  readonly invoice$ = toObservable(this.idSig).pipe(
    switchMap((id) => (id ? this.invoiceSvc.get$(id) : of(undefined)))
  );

  readonly isAdmin = computed(() => this.auth.role() === 'company-admin');
  readonly downloading = signal(false);
  readonly error = signal<string | null>(null);

  status(inv: Invoice): string {
    return computeDisplayStatus(inv);
  }

  hasIndia(inv: Invoice): boolean {
    return hasIndiaTotals(inv);
  }

  hasHsnColumn(inv: Invoice): boolean {
    return inv.lineItems.some((li) => !!li.hsnSac);
  }

  halfGst(inv: Invoice): number {
    return (inv.gstPercent ?? 0) / 2;
  }

  getDisplayTotal(inv: Invoice): number {
    return getDisplayTotal(inv);
  }

  grandTotalWords(inv: Invoice): string {
    return numberToWords(getDisplayTotal(inv), inv.currency);
  }

  async markPaid(id: string): Promise<void> {
    try { await this.invoiceSvc.markPaid(id); }
    catch (e: any) { this.error.set(e?.message ?? 'Failed.'); }
  }

  async revertToPending(id: string): Promise<void> {
    try { await this.invoiceSvc.revertToPending(id); }
    catch (e: any) { this.error.set(e?.message ?? 'Failed.'); }
  }

  async confirmRemove(inv: Invoice): Promise<void> {
    if (!confirm(`Delete invoice ${inv.number}? This cannot be undone.`)) return;
    try {
      await this.invoiceSvc.remove(inv.id);
      await this.router.navigateByUrl('/app/invoices');
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed.');
    }
  }

  async downloadPdf(inv: Invoice): Promise<void> {
    this.downloading.set(true);
    this.error.set(null);
    try {
      const cid = this.auth.companyId();
      if (!cid) throw new Error('No companyId on session.');
      const gate = await this.companySvc.getGate(cid);
      if (!gate) throw new Error('Company not found.');
      await this.pdfSvc.generateInvoicePdf(inv, { name: gate.name, defaultCurrency: gate.defaultCurrency });
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to generate PDF.');
    } finally {
      this.downloading.set(false);
    }
  }
}
