import { Component, computed, inject, signal } from '@angular/core';
import { AsyncPipe, DecimalPipe } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CustomerService } from '../../core/services/customer.service';
import { ProductService } from '../../core/services/product.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { Customer } from '../../core/models/customer';
import { Product } from '../../core/models/product';
import { InvoiceKind, InvoiceLineItem } from '../../core/models/invoice';
import { gstPercentValidator, hsnValidator } from '../../core/validators/gst';
import { computeCgstSgst, computeGrandTotal, roundMoney } from '../../core/utils/invoice-math';
import { numberToWords } from '../../core/utils/number-to-words';

@Component({
  selector: 'app-invoice-form',
  standalone: true,
  imports: [AsyncPipe, DecimalPipe, ReactiveFormsModule],
  template: `
    <h1>{{ pageHeading() }}</h1>

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <fieldset class="kind-toggle">
        <legend>Bill kind</legend>
        <label>
          <input type="radio" formControlName="kind" value="sales" /> Sales <span class="muted small">(I am issuing this bill)</span>
        </label>
        <label>
          <input type="radio" formControlName="kind" value="purchase" /> Purchase <span class="muted small">(I received this bill from a supplier)</span>
        </label>
      </fieldset>

      <div class="row">
        <label>{{ counterpartyLabel() }} *
          <select formControlName="customerId" (change)="onCustomerChange()">
            <option value="">— select —</option>
            @for (c of (customers$ | async) ?? []; track c.id) {
              <option [value]="c.id">{{ c.name }}</option>
            }
          </select>
        </label>
        @if (kindValue() === 'purchase') {
          <label>Supplier bill number *
            <input formControlName="number" maxlength="64" placeholder="e.g. VEN/2026/4521" />
            @if (showError(form.controls.number)) {
              <small class="field-error">Required; 1–64 characters.</small>
            }
          </label>
        } @else {
          <label>Invoice number
            <input value="Will be assigned automatically (INV-YYYY-NNNN)" readonly />
          </label>
        }
        <label>Currency *
          <input formControlName="currency" maxlength="3" />
        </label>
        <label>{{ kindValue() === 'purchase' ? 'Bill date' : 'Invoice date' }} *
          <input type="date" formControlName="issueDate" />
        </label>
        <label>Due date *
          <input type="date" formControlName="dueDate" />
        </label>
      </div>

      @if (selectedCustomer(); as c) {
        <div class="bill-to-card">
          <h3>{{ kindValue() === 'purchase' ? 'Bill from' : 'Bill to' }}</h3>
          <p class="bill-to-name">{{ c.name }}</p>
          @if (c.shopName) { <p>{{ c.shopName }}</p> }
          @if (c.fullAddress) { <p class="address">{{ c.fullAddress }}</p> }
          @if (c.gstNumber) {
            <p><strong>GSTIN:</strong> <code>{{ c.gstNumber }}</code></p>
          } @else {
            <p class="hint">GSTIN not set on this customer — edit the customer record to add one.</p>
          }
          @if (c.phoneNumber) { <p><strong>Phone:</strong> {{ c.phoneNumber }}</p> }
        </div>
      }

      <h3>Line items</h3>
      <table class="grid" formArrayName="lineItems">
        <thead><tr><th>Product</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Unit price</th><th>Line total</th><th></th></tr></thead>
        <tbody>
          @for (li of lineItems.controls; track $index; let i = $index) {
            <tr [formGroupName]="i">
              <td>
                <select formControlName="productId" (change)="onProductChange(i)">
                  <option value="">— free-form —</option>
                  @for (p of (products$ | async) ?? []; track p.id) {
                    <option [value]="p.id">{{ p.name }}</option>
                  }
                </select>
              </td>
              <td><input formControlName="description" /></td>
              <td><input formControlName="hsnSac" maxlength="8" placeholder="6109" /></td>
              <td><input type="number" min="1" step="1" formControlName="quantity" (input)="recompute(i)" /></td>
              <td><input type="number" min="0" step="0.01" formControlName="unitPrice" (input)="recompute(i)" /></td>
              <td class="right">{{ li.get('lineTotal')?.value | number:'1.2-2' }}</td>
              <td><button type="button" (click)="removeLine(i)" [disabled]="lineItems.length === 1">×</button></td>
            </tr>
          }
        </tbody>
      </table>
      <p><button type="button" (click)="addLine()">+ Add line</button></p>

      <p><label>Notes <textarea formControlName="notes" rows="2"></textarea></label></p>

      <section class="totals-block">
        <h3>Tax &amp; Charges</h3>
        <div class="row">
          <label>GST %
            <input type="number" min="0" max="50" step="0.01" formControlName="gstPercent" (input)="recomputeAll()" />
            <small class="muted small">Indian intra-state. Splits as CGST and SGST. Leave 0 for non-GST invoices.</small>
          </label>
          <span class="kv"><span class="k">CGST ({{ halfGst() | number:'1.0-2' }}%):</span> <span class="v">{{ cgst() | number:'1.2-2' }}</span></span>
          <span class="kv"><span class="k">SGST ({{ halfGst() | number:'1.0-2' }}%):</span> <span class="v">{{ sgst() | number:'1.2-2' }}</span></span>
        </div>
        @if (showError(form.controls.gstPercent)) {
          <small class="field-error">GST must be between 0 and 50.</small>
        }
        <div class="row">
          <label>Other Charges
            <input type="number" min="0" step="0.01" formControlName="otherCharges" (input)="recomputeAll()" />
          </label>
          @if (showError(form.controls.otherCharges)) {
            <small class="field-error">Must be 0 or greater.</small>
          }
          <label>Round Off
            <input type="number" step="0.01" formControlName="roundOff" (input)="recomputeAll()" />
            <small class="muted small">Signed adjustment (e.g. -0.40 to round down).</small>
          </label>
        </div>
      </section>

      <section class="grand-total-block">
        <p class="row-line"><span>Subtotal</span><span>{{ subtotal() | number:'1.2-2' }} {{ form.value.currency }}</span></p>
        @if (gstPercentValue() > 0) {
          <p class="row-line"><span>CGST ({{ halfGst() | number:'1.0-2' }}%)</span><span>{{ cgst() | number:'1.2-2' }} {{ form.value.currency }}</span></p>
          <p class="row-line"><span>SGST ({{ halfGst() | number:'1.0-2' }}%)</span><span>{{ sgst() | number:'1.2-2' }} {{ form.value.currency }}</span></p>
        }
        @if (otherChargesValue() !== 0) {
          <p class="row-line"><span>Other Charges</span><span>{{ otherChargesValue() | number:'1.2-2' }} {{ form.value.currency }}</span></p>
        }
        @if (roundOffValue() !== 0) {
          <p class="row-line"><span>Round Off</span><span>{{ roundOffValue() | number:'1.2-2' }} {{ form.value.currency }}</span></p>
        }
        <p class="grand-row"><span>Grand Total</span><span>{{ grandTotal() | number:'1.2-2' }} {{ form.value.currency }}</span></p>
        <p class="words"><strong>Amount in words:</strong> {{ grandTotalWords() }}</p>
      </section>

      @if (error(); as e) { <p class="error">{{ e }}</p> }
      <button type="submit" [disabled]="form.invalid || busy() || lineItems.length === 0">
        {{ busy() ? 'Creating…' : (kindValue() === 'purchase' ? 'Create purchase bill' : 'Create invoice') }}
      </button>
      <button type="button" (click)="cancel()">Cancel</button>
    </form>
  `,
  styles: [`
    h1 { margin: 0 0 12px 0; }
    h3 { margin: 14px 0 6px 0; }
    .kind-toggle { border: 1px solid #ddd; border-radius: 6px; padding: 8px 12px; margin: 4px 0 12px; background: #fafafa; display: flex; gap: 20px; align-items: center; }
    .kind-toggle legend { padding: 0 6px; font-size: 12px; color: #555; }
    .kind-toggle label { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
    .row label { display: flex; flex-direction: column; font-size: 13px; gap: 4px; }
    .row input, .row select { padding: 6px; border: 1px solid #ccc; border-radius: 4px; }
    .grid { width: 100%; border-collapse: collapse; margin: 8px 0; background: white; }
    .grid th, .grid td { border-bottom: 1px solid #eee; padding: 6px; vertical-align: middle; }
    .grid th { background: #f5f5f5; font-size: 12px; text-align: left; }
    .grid input, .grid select { width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 3px; box-sizing: border-box; }
    .grid td.right { text-align: right; }
    button { background: #1e6fff; color: white; border: 0; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-right: 6px; }
    button[disabled] { opacity: 0.6; cursor: not-allowed; }
    .error { color: #c0392b; }
    .field-error { color: #c0392b; font-size: 12px; display: block; margin-top: 2px; }
    .muted { color: #888; }
    .small { font-size: 11px; }
    textarea { width: 100%; box-sizing: border-box; padding: 6px; border: 1px solid #ccc; border-radius: 4px; }
    input.ng-invalid.ng-touched { border-color: #c0392b; }
    .bill-to-card { border: 1px solid #ddd; background: #fafafa; border-radius: 6px; padding: 10px 14px; margin: 12px 0; }
    .bill-to-card h3 { margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; color: #666; }
    .bill-to-card p { margin: 2px 0; }
    .bill-to-card .bill-to-name { font-weight: 600; }
    .bill-to-card .address { white-space: pre-line; }
    .bill-to-card .hint { font-size: 12px; color: #b8862f; }
    .bill-to-card code { background: #eee; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
    .totals-block { margin: 12px 0; border: 1px solid #e0e0e0; padding: 12px; border-radius: 6px; background: #fcfcfc; }
    .totals-block .kv { display: flex; flex-direction: column; gap: 4px; font-size: 13px; padding-bottom: 4px; }
    .totals-block .kv .k { color: #666; }
    .totals-block .kv .v { font-weight: 600; }
    .grand-total-block { margin: 12px 0; border: 1px solid #b8d4ff; background: #f0f6ff; padding: 12px 16px; border-radius: 6px; max-width: 480px; }
    .grand-total-block .row-line { display: flex; justify-content: space-between; margin: 2px 0; }
    .grand-total-block .grand-row { display: flex; justify-content: space-between; font-weight: 700; font-size: 18px; border-top: 1px solid #b8d4ff; padding-top: 6px; margin-top: 6px; }
    .grand-total-block .words { margin-top: 8px; font-style: italic; color: #333; }
  `]
})
export class InvoiceFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly customerSvc = inject(CustomerService);
  private readonly productSvc = inject(ProductService);
  private readonly invoiceSvc = inject(InvoiceService);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly customers$ = this.customerSvc.list$();
  readonly products$ = this.productSvc.list$();
  private customersCache: Customer[] = [];
  private productsCache: Product[] = [];

  readonly selectedCustomerId = signal<string>('');
  readonly selectedCustomer = computed<Customer | null>(() => {
    const id = this.selectedCustomerId();
    return id ? this.customersCache.find((c) => c.id === id) ?? null : null;
  });

  readonly form = this.fb.nonNullable.group({
    kind: ['sales' as InvoiceKind, [Validators.required]],
    number: [''], // only used when kind === 'purchase'; validators applied dynamically
    customerId: ['', [Validators.required]],
    currency: ['INR', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]],
    issueDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    dueDate: [this.defaultDueDate(), [Validators.required]],
    notes: [''],
    gstPercent: [0, [gstPercentValidator()]],
    otherCharges: [0, [Validators.min(0)]],
    roundOff: [0],
    lineItems: this.fb.array<FormGroup>([])
  });

  /** Selected bill kind, exposed as a signal for the template. */
  readonly kindValue = signal<InvoiceKind>('sales');
  readonly pageHeading = computed(() => this.kindValue() === 'purchase' ? 'New purchase bill' : 'New sales bill');
  readonly counterpartyLabel = computed(() => this.kindValue() === 'purchase' ? 'Vendor' : 'Customer');

  // Live signals driven by the form. Updated explicitly via recompute() / recomputeAll().
  readonly subtotal = signal(0);
  readonly gstPercentValue = signal(0);
  readonly otherChargesValue = signal(0);
  readonly roundOffValue = signal(0);

  readonly halfGst = computed(() => roundMoney(this.gstPercentValue() / 2));
  readonly cgst = computed(() => computeCgstSgst(this.subtotal(), this.gstPercentValue()).cgst);
  readonly sgst = computed(() => computeCgstSgst(this.subtotal(), this.gstPercentValue()).sgst);
  readonly grandTotal = computed(() =>
    computeGrandTotal(this.subtotal(), this.cgst(), this.sgst(), this.otherChargesValue(), this.roundOffValue())
  );
  readonly grandTotalWords = computed(() => numberToWords(this.grandTotal(), this.form.value.currency ?? 'INR'));

  constructor() {
    this.addLine();
    this.customers$.subscribe((cs) => (this.customersCache = cs));
    this.products$.subscribe((ps) => (this.productsCache = ps));
    // Keep the `kindValue` signal in sync with the form and swap the `number`
    // field's validators when the user flips the toggle.
    const numberCtrl = this.form.controls.number;
    this.form.controls.kind.valueChanges.subscribe((k) => {
      this.kindValue.set((k as InvoiceKind) ?? 'sales');
      if (k === 'purchase') {
        numberCtrl.setValidators([Validators.required, Validators.maxLength(64)]);
      } else {
        numberCtrl.setValidators([]);
        numberCtrl.setValue('', { emitEvent: false });
      }
      numberCtrl.updateValueAndValidity({ emitEvent: false });
    });
  }

  get lineItems(): FormArray<FormGroup> {
    return this.form.get('lineItems') as FormArray<FormGroup>;
  }

  showError(control: { invalid: boolean; touched: boolean; dirty: boolean }): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  addLine(): void {
    const g = this.fb.nonNullable.group({
      productId: [''],
      description: ['', [Validators.required]],
      hsnSac: ['', [hsnValidator()]],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unitPrice: [0, [Validators.required, Validators.min(0)]],
      lineTotal: [0]
    });
    this.lineItems.push(g);
    this.recomputeAll();
  }

  removeLine(index: number): void {
    this.lineItems.removeAt(index);
    this.recomputeAll();
  }

  recompute(index: number): void {
    const g = this.lineItems.at(index);
    if (!g) return;
    const q = Number(g.get('quantity')?.value ?? 0);
    const p = Number(g.get('unitPrice')?.value ?? 0);
    g.get('lineTotal')?.setValue(roundMoney(q * p), { emitEvent: false });
    this.recomputeAll();
  }

  recomputeAll(): void {
    const sub = this.lineItems.controls.reduce((sum, g) => sum + Number(g.get('lineTotal')?.value ?? 0), 0);
    this.subtotal.set(roundMoney(sub));
    this.gstPercentValue.set(Number(this.form.get('gstPercent')?.value ?? 0));
    this.otherChargesValue.set(roundMoney(Number(this.form.get('otherCharges')?.value ?? 0)));
    this.roundOffValue.set(roundMoney(Number(this.form.get('roundOff')?.value ?? 0)));
  }

  onCustomerChange(): void {
    const id = this.form.get('customerId')?.value ?? '';
    this.selectedCustomerId.set(id);
    const c = this.customersCache.find((x) => x.id === id);
    if (c?.currency) this.form.get('currency')?.setValue(c.currency);
  }

  onProductChange(index: number): void {
    const g = this.lineItems.at(index);
    if (!g) return;
    const productId = g.get('productId')?.value;
    if (!productId) return;
    const p = this.productsCache.find((x) => x.id === productId);
    if (!p) return;
    g.patchValue({
      description: p.description ?? p.name,
      hsnSac: p.hsnSac ?? '',
      unitPrice: p.unitPrice
    });
    this.recompute(index);
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.lineItems.length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const v = this.form.getRawValue();
      const customer = this.customersCache.find((c) => c.id === v.customerId);
      if (!customer) throw new Error('Customer not found.');

      const lineItems: InvoiceLineItem[] = (v.lineItems as any[]).map((li) => {
        const q = Number(li.quantity);
        const u = Number(li.unitPrice);
        return {
          productId: li.productId || null,
          description: (li.description ?? '').toString().trim(),
          hsnSac: li.hsnSac ? String(li.hsnSac).trim() : null,
          quantity: q,
          unitPrice: u,
          lineTotal: roundMoney(q * u)
        };
      });

      const customerSnapshot = {
        id: customer.id,
        name: customer.name,
        email: customer.email ?? null,
        address: customer.address ?? null,
        phoneNumber: customer.phoneNumber ?? null,
        shopName: customer.shopName ?? null,
        fullAddress: customer.fullAddress ?? null,
        gstNumber: customer.gstNumber ?? null
      };

      const res = await this.invoiceSvc.create({
        kind: v.kind as InvoiceKind,
        number: v.kind === 'purchase' ? (v.number ?? '').trim() : undefined,
        customer: customerSnapshot,
        lineItems,
        currency: v.currency,
        issueDate: new Date(v.issueDate),
        dueDate: new Date(v.dueDate),
        notes: v.notes,
        gstPercent: Number(v.gstPercent ?? 0),
        otherCharges: Number(v.otherCharges ?? 0),
        roundOff: Number(v.roundOff ?? 0)
      });
      await this.router.navigate(['/app/invoices', res.id]);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed.');
    } finally {
      this.busy.set(false);
    }
  }

  cancel(): void {
    this.router.navigateByUrl('/app/invoices');
  }

  private defaultDueDate(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
