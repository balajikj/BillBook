import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProductService } from '../../core/services/product.service';
import { Product, getProductQuantity } from '../../core/models/product';
import { hsnValidator } from '../../core/validators/gst';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule],
  template: `
    <h1>Products</h1>
    <p><button type="button" (click)="startCreate()">+ New product</button></p>

    @if (editing()) {
      <form [formGroup]="form" (ngSubmit)="submit()" class="card" novalidate>
        <h3>{{ editing()?.id ? 'Edit product' : 'New product' }}</h3>
        <label>Name * <input formControlName="name" /></label>
        @if (showError(form.controls.name)) { <small class="field-error">Required.</small> }
        <label>Description <textarea formControlName="description" rows="2"></textarea></label>
        <label>
          HSN/SAC code
          <input formControlName="hsnSac" maxlength="8" placeholder="6109" />
          <small class="muted small">4–8 digit code from your GST registration (optional).</small>
        </label>
        @if (showError(form.controls.hsnSac)) {
          <small class="field-error">Enter a 4–8 digit numeric code.</small>
        }
        <label>Unit price * <input type="number" min="0" step="0.01" formControlName="unitPrice" /></label>
        <label>Currency * (ISO 4217) <input formControlName="currency" maxlength="3" /></label>
        <label>
          Stock quantity
          <input type="number" step="0.01" formControlName="quantity" placeholder="0" />
          <small class="muted small">Current on-hand stock. Purchases add to this; sales subtract.</small>
        </label>
        @if (error(); as e) { <p class="error">{{ e }}</p> }
        <button type="submit" [disabled]="form.invalid || busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
        <button type="button" (click)="editing.set(null)">Cancel</button>
      </form>
    }

    <div class="table-scroll">
    <table class="grid">
      <thead>
        <tr>
          <th>Name</th>
          @if (showHsn()) { <th>HSN/SAC</th> }
          <th>Unit price</th>
          <th>Currency</th>
          <th>Stock</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        @for (p of products(); track p.id) {
          <tr>
            <td>{{ p.name }}</td>
            @if (showHsn()) { <td>{{ p.hsnSac ?? '' }}</td> }
            <td>{{ p.unitPrice | number:'1.2-2' }}</td>
            <td>{{ p.currency }}</td>
            <td>
              <span [class.stock-neg]="qty(p) < 0">{{ qty(p) | number:'1.0-2' }}</span>
              @if (qty(p) < 0) { <small class="warn">⚠ over-sold</small> }
            </td>
            <td>
              <button type="button" (click)="startEdit(p)">Edit</button>
              <button type="button" (click)="confirmRemove(p)">Delete</button>
            </td>
          </tr>
        } @empty {
          <tr><td [attr.colspan]="totalCols()" class="muted">No products yet.</td></tr>
        }
      </tbody>
    </table>
    </div>
  `,
  styles: [`
    h1 { margin: 0 0 12px 0; }
    .card { border: 1px solid #ddd; padding: 12px; border-radius: 6px; margin: 8px 0; background: #fafafa; }
    .card label { display: block; margin: 6px 0; }
    .card input, .card textarea { display: block; width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    .grid { width: 100%; border-collapse: collapse; background: white; }
    .grid th, .grid td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
    .grid th { background: #f5f5f5; font-size: 13px; }
    button { background: #1e6fff; color: white; border: 0; padding: 6px 10px; border-radius: 4px; margin: 2px 4px 2px 0; cursor: pointer; }
    .muted { color: #888; }
    .small { font-size: 12px; }
    .error { color: #c0392b; }
    .field-error { color: #c0392b; font-size: 12px; display: block; margin-top: 2px; }
    input.ng-invalid.ng-touched, textarea.ng-invalid.ng-touched { border-color: #c0392b; }
    .stock-neg { color: #c0392b; font-weight: 600; }
    .warn { color: #c0392b; margin-left: 4px; }
  `]
})
export class ProductListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly productSvc = inject(ProductService);

  readonly products = toSignal(this.productSvc.list$(), { initialValue: [] as Product[] });
  readonly editing = signal<{ id: string | null } | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly showHsn = computed(() => this.products().some((p) => !!p.hsnSac));
  // Columns: Name, [HSN], Unit price, Currency, Stock, Actions = 5 + HSN
  readonly totalCols = computed(() => 5 + Number(this.showHsn()));

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    description: [''],
    hsnSac: ['', [hsnValidator()]],
    unitPrice: [0, [Validators.required, Validators.min(0)]],
    currency: ['INR', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    quantity: [0]
  });

  qty(p: Product): number {
    return getProductQuantity(p);
  }

  showError(control: { invalid: boolean; touched: boolean; dirty: boolean }): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  startCreate(): void {
    this.editing.set({ id: null });
    this.error.set(null);
    this.form.reset({ name: '', description: '', hsnSac: '', unitPrice: 0, currency: 'INR', quantity: 0 });
  }

  startEdit(p: Product): void {
    this.editing.set({ id: p.id });
    this.error.set(null);
    this.form.reset({
      name: p.name,
      description: p.description ?? '',
      hsnSac: p.hsnSac ?? '',
      unitPrice: p.unitPrice,
      currency: p.currency,
      quantity: getProductQuantity(p)
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const raw = this.form.getRawValue();
      const payload: Record<string, unknown> = {
        name: raw.name.trim(),
        unitPrice: Number(raw.unitPrice),
        currency: raw.currency.toUpperCase(),
        quantity: Number(raw.quantity ?? 0)
      };
      if (raw.description.trim()) payload['description'] = raw.description.trim();
      if (raw.hsnSac.trim()) payload['hsnSac'] = raw.hsnSac.trim();
      const ed = this.editing();
      if (ed?.id) await this.productSvc.update(ed.id, payload as any);
      else await this.productSvc.create(payload as any);
      this.editing.set(null);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed.');
    } finally {
      this.busy.set(false);
    }
  }

  async confirmRemove(p: Product): Promise<void> {
    if (!confirm(`Delete product "${p.name}"? Existing invoices keep their snapshotted price.`)) return;
    try {
      await this.productSvc.remove(p.id);
    } catch (e: any) {
      alert(e?.message ?? 'Failed.');
    }
  }
}
