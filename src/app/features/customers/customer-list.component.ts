import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CustomerService } from '../../core/services/customer.service';
import { Customer } from '../../core/models/customer';
import { gstinValidator, phoneValidator } from '../../core/validators/gst';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <h1>Customers</h1>
    <p><button type="button" (click)="startCreate()">+ New customer</button></p>

    @if (editing(); as e) {
      <form [formGroup]="form" (ngSubmit)="submit()" class="card" novalidate>
        <h3>{{ e.id ? 'Edit customer' : 'New customer' }}</h3>
        <label>Name * <input formControlName="name" /></label>
        @if (showError(form.controls.name)) { <small class="field-error">Required.</small> }
        <label>Email <input type="email" formControlName="email" /></label>
        <label>Phone number <input formControlName="phoneNumber" placeholder="+91 9876543210" /></label>
        @if (showError(form.controls.phoneNumber)) {
          <small class="field-error">Enter 10 digits, optionally prefixed with a country code (e.g. +91).</small>
        }
        <label>Shop name <input formControlName="shopName" /></label>
        <label>Full address <textarea formControlName="fullAddress" rows="2"></textarea></label>
        <label>GST number <input formControlName="gstNumber" placeholder="29ABCDE1234F1Z5" maxlength="15" /></label>
        @if (showError(form.controls.gstNumber)) {
          <small class="field-error">Enter a valid 15-character GSTIN.</small>
        }
        <label>Legacy address (one-line, optional) <textarea formControlName="address" rows="2"></textarea></label>
        <label>Currency override (optional, ISO 4217) <input formControlName="currency" maxlength="3" /></label>
        @if (error(); as msg) { <p class="error">{{ msg }}</p> }
        <button type="submit" [disabled]="form.invalid || busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
        <button type="button" (click)="editing.set(null)">Cancel</button>
      </form>
    }

    <table class="grid">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          @if (showShop()) { <th>Shop</th> }
          @if (showPhone()) { <th>Phone</th> }
          @if (showGstin()) { <th>GSTIN</th> }
          <th>Currency</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        @for (c of customers(); track c.id) {
          <tr>
            <td>{{ c.name }}</td>
            <td>{{ c.email ?? '' }}</td>
            @if (showShop()) { <td>{{ c.shopName ?? '' }}</td> }
            @if (showPhone()) { <td>{{ c.phoneNumber ?? '' }}</td> }
            @if (showGstin()) { <td>{{ c.gstNumber ?? '' }}</td> }
            <td>{{ c.currency ?? '' }}</td>
            <td>
              <button type="button" (click)="startEdit(c)">Edit</button>
              <button type="button" (click)="confirmRemove(c)">Delete</button>
            </td>
          </tr>
        } @empty {
          <tr><td [attr.colspan]="totalCols()" class="muted">No customers yet.</td></tr>
        }
      </tbody>
    </table>
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
    button[disabled] { opacity: 0.6; }
    .muted { color: #888; }
    .error { color: #c0392b; }
    .field-error { color: #c0392b; font-size: 12px; display: block; margin-top: 2px; }
    input.ng-invalid.ng-touched, textarea.ng-invalid.ng-touched { border-color: #c0392b; }
  `]
})
export class CustomerListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly customerSvc = inject(CustomerService);

  readonly customers = toSignal(this.customerSvc.list$(), { initialValue: [] as Customer[] });
  readonly editing = signal<{ id: string | null } | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly showShop = computed(() => this.customers().some((c) => !!c.shopName));
  readonly showPhone = computed(() => this.customers().some((c) => !!c.phoneNumber));
  readonly showGstin = computed(() => this.customers().some((c) => !!c.gstNumber));
  readonly totalCols = computed(() => 4 + Number(this.showShop()) + Number(this.showPhone()) + Number(this.showGstin()));

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: [''],
    phoneNumber: ['', [phoneValidator()]],
    shopName: [''],
    fullAddress: [''],
    gstNumber: ['', [gstinValidator()]],
    address: [''],
    currency: ['']
  });

  showError(control: { invalid: boolean; touched: boolean; dirty: boolean }): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  startCreate(): void {
    this.editing.set({ id: null });
    this.error.set(null);
    this.form.reset({
      name: '', email: '', phoneNumber: '', shopName: '', fullAddress: '',
      gstNumber: '', address: '', currency: ''
    });
  }

  startEdit(c: Customer): void {
    this.editing.set({ id: c.id });
    this.error.set(null);
    this.form.reset({
      name: c.name,
      email: c.email ?? '',
      phoneNumber: c.phoneNumber ?? '',
      shopName: c.shopName ?? '',
      fullAddress: c.fullAddress ?? '',
      gstNumber: c.gstNumber ?? '',
      address: c.address ?? '',
      currency: c.currency ?? ''
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const raw = this.form.getRawValue();
      const payload: Record<string, unknown> = { name: raw.name.trim() };
      if (raw.email.trim()) payload['email'] = raw.email.trim();
      if (raw.phoneNumber.trim()) payload['phoneNumber'] = raw.phoneNumber.trim();
      if (raw.shopName.trim()) payload['shopName'] = raw.shopName.trim();
      if (raw.fullAddress.trim()) payload['fullAddress'] = raw.fullAddress.trim();
      if (raw.gstNumber.trim()) payload['gstNumber'] = raw.gstNumber.trim().toUpperCase();
      if (raw.address.trim()) payload['address'] = raw.address.trim();
      if (raw.currency.trim()) payload['currency'] = raw.currency.trim().toUpperCase();
      const ed = this.editing();
      if (ed?.id) await this.customerSvc.update(ed.id, payload as any);
      else await this.customerSvc.create(payload as any);
      this.editing.set(null);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed.');
    } finally {
      this.busy.set(false);
    }
  }

  async confirmRemove(c: Customer): Promise<void> {
    if (!confirm(`Delete customer "${c.name}"? Existing invoices keep their snapshot.`)) return;
    try {
      await this.customerSvc.remove(c.id);
    } catch (e: any) {
      alert(e?.message ?? 'Failed to delete.');
    }
  }
}
