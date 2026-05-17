import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { CompanyProfileService } from '../../core/services/company-profile.service';
import {
  ACCOUNT_NUMBER_REGEX,
  GSTIN_REGEX,
  IFSC_REGEX,
  InvoiceTemplate,
  PAN_REGEX,
  TEXT_AREA_MAX
} from '../../core/models/invoice-template';

// Regex-when-non-empty: skips validation if the control is blank, so the field
// stays optional. Returns a synchronous validator function.
function optionalPattern(re: RegExp, key: string) {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = (c.value ?? '').toString().trim();
    if (v === '') return null;
    return re.test(v) ? null : { [key]: true };
  };
}

function optionalEmail(c: AbstractControl): ValidationErrors | null {
  const v = (c.value ?? '').toString().trim();
  if (v === '') return null;
  return Validators.email(new FormControl(v));
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="row">
      <h1>Invoice profile</h1>
      <span class="muted small">Configures the header, footer, signature, and disclaimer printed on every invoice PDF for this company.</span>
    </header>

    <form [formGroup]="form" (ngSubmit)="onSave()" novalidate>

      <!-- ============================================================== -->
      <!-- HEADER -->
      <!-- ============================================================== -->
      <section class="card" formGroupName="header">
        <h2>Header info <span class="muted small">(printed at the top of each invoice)</span></h2>

        <div class="grid">
          <label>
            Phone
            <input formControlName="phone" placeholder="+91 9876543210" />
          </label>
          <label>
            Email
            <input formControlName="email" type="email" placeholder="sales@example.com" />
            @if (showError(headerCtrl('email'))) { <small class="field-error">Enter a valid email.</small> }
          </label>
          <label>
            Website
            <input formControlName="website" placeholder="example.com" />
          </label>
          <label>
            GSTIN
            <input formControlName="gstin" placeholder="29ABCDE1234F1Z5" maxlength="15" />
            @if (showError(headerCtrl('gstin'))) { <small class="field-error">15 chars in GSTIN format.</small> }
          </label>
          <label>
            PAN
            <input formControlName="pan" placeholder="ABCDE1234F" maxlength="10" />
            @if (showError(headerCtrl('pan'))) { <small class="field-error">10 chars in PAN format.</small> }
          </label>
          <label>
            CIN
            <input formControlName="cin" placeholder="(optional)" maxlength="21" />
          </label>
        </div>

        <h3 class="muted small">Address</h3>
        <div formArrayName="addressLines">
          @for (line of addressLines.controls; track $index; let i = $index) {
            <div class="row">
              <input [formControlName]="i" placeholder="Address line {{ i + 1 }}" />
              <button type="button" (click)="removeAddressLine(i)" [disabled]="addressLines.length === 1">−</button>
            </div>
          }
        </div>
        <p><button type="button" (click)="addAddressLine()">+ Add address line</button></p>
      </section>

      <!-- ============================================================== -->
      <!-- FOOTER -->
      <!-- ============================================================== -->
      <section class="card" formGroupName="footer">
        <h2>Footer / Payment info <span class="muted small">(printed near the bottom)</span></h2>

        <div class="grid">
          <label>
            Bank account name
            <input formControlName="bankAccountName" placeholder="Acme Pvt. Ltd." />
          </label>
          <label>
            Bank name
            <input formControlName="bankName" placeholder="HDFC Bank" />
          </label>
          <label>
            Account number
            <input formControlName="accountNumber" placeholder="50100123456789" />
            @if (showError(footerCtrl('accountNumber'))) { <small class="field-error">6–18 digits.</small> }
          </label>
          <label>
            IFSC
            <input formControlName="ifsc" placeholder="HDFC0000123" maxlength="11" />
            @if (showError(footerCtrl('ifsc'))) { <small class="field-error">4 letters, "0", 6 letters/digits.</small> }
          </label>
          <label>
            Branch
            <input formControlName="branch" placeholder="MG Road, Bengaluru" />
          </label>
          <label>
            UPI ID
            <input formControlName="upiId" placeholder="acme@hdfcbank" />
          </label>
        </div>
      </section>

      <!-- ============================================================== -->
      <!-- SIGNATURE & DISCLAIMER -->
      <!-- ============================================================== -->
      <section class="card">
        <h2>Signature &amp; Disclaimer</h2>

        <div class="grid" formGroupName="signature">
          <label>
            Signatory name
            <input formControlName="signatoryName" placeholder="Alice Smith" />
          </label>
          <label>
            Signatory title
            <input formControlName="signatoryTitle" placeholder="Authorized Signatory (default)" />
          </label>
        </div>

        <label class="block">
          Terms &amp; Conditions <span class="muted small">(multi-line, up to {{ maxTextLen }} chars; printed on each copy)</span>
          <textarea formControlName="termsAndConditions" rows="3" [maxlength]="maxTextLen"></textarea>
          @if (showError(form.controls.termsAndConditions)) {
            <small class="field-error">Must be {{ maxTextLen }} characters or fewer.</small>
          }
        </label>

        <label class="block">
          Disclaimer <span class="muted small">(multi-line, up to {{ maxTextLen }} chars; printed as small italic at the bottom)</span>
          <textarea formControlName="disclaimer" rows="2" [maxlength]="maxTextLen"></textarea>
          @if (showError(form.controls.disclaimer)) {
            <small class="field-error">Must be {{ maxTextLen }} characters or fewer.</small>
          }
        </label>
      </section>

      <p class="muted small">All fields are optional. Fields you leave blank are simply omitted from the printed invoice.</p>

      @if (saveError(); as e) { <p class="error">{{ e }}</p> }
      @if (savedOk() && !form.dirty) { <p class="ok">Saved.</p> }
      @if (form.invalid && form.touched) {
        <p class="field-error">Fix the field(s) above to enable <strong>Save</strong>.</p>
      }

      <div class="actions">
        <button type="submit" [disabled]="form.invalid || busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
        <button type="button" (click)="resetFromServer()" [disabled]="busy()">Revert</button>
      </div>
    </form>
  `,
  styles: [`
    h1 { margin: 0; }
    h2 { font-size: 16px; margin: 0 0 12px 0; }
    h3 { font-size: 13px; margin: 12px 0 6px 0; font-weight: 600; }
    .row { display: flex; align-items: center; gap: 8px; }
    .card { border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin: 12px 0; background: #fafafa; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
    .grid label, label.block { display: flex; flex-direction: column; font-size: 13px; gap: 4px; }
    input, textarea {
      padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px;
      font: inherit; box-sizing: border-box; width: 100%;
    }
    textarea { font-family: ui-monospace, monospace; font-size: 12px; }
    input.ng-invalid.ng-touched, textarea.ng-invalid.ng-touched { border-color: #c0392b; }
    .field-error { color: #c0392b; font-size: 12px; }
    .muted { color: #888; }
    .small { font-size: 12px; }
    .actions { margin-top: 16px; display: flex; gap: 8px; }
    button { background: #1e6fff; color: white; border: 0; padding: 8px 14px; border-radius: 4px; cursor: pointer; }
    button[disabled] { opacity: 0.6; cursor: not-allowed; }
    .error { color: #c0392b; }
    .ok { color: #1e6f1e; }
  `]
})
export class ProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly profileSvc = inject(CompanyProfileService);

  readonly maxTextLen = TEXT_AREA_MAX;
  readonly busy = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly savedOk = signal(false);

  readonly form = this.fb.nonNullable.group({
    header: this.fb.nonNullable.group({
      phone: [''],
      email: ['', [optionalEmail]],
      website: [''],
      gstin: ['', [optionalPattern(GSTIN_REGEX, 'gstin')]],
      pan: ['', [optionalPattern(PAN_REGEX, 'pan')]],
      cin: [''],
      addressLines: this.fb.array<FormControl<string>>([this.fb.nonNullable.control('')])
    }),
    footer: this.fb.nonNullable.group({
      bankAccountName: [''],
      bankName: [''],
      accountNumber: ['', [optionalPattern(ACCOUNT_NUMBER_REGEX, 'accountNumber')]],
      ifsc: ['', [optionalPattern(IFSC_REGEX, 'ifsc')]],
      branch: [''],
      upiId: ['']
    }),
    signature: this.fb.nonNullable.group({
      signatoryName: [''],
      signatoryTitle: ['']
    }),
    termsAndConditions: ['', [Validators.maxLength(TEXT_AREA_MAX)]],
    disclaimer: ['', [Validators.maxLength(TEXT_AREA_MAX)]]
  });

  get addressLines(): FormArray<FormControl<string>> {
    return this.form.controls.header.controls.addressLines as FormArray<FormControl<string>>;
  }

  constructor() {
    // Auto-uppercase GSTIN, PAN, IFSC on every change.
    this.autoUppercase(this.headerCtrl('gstin'));
    this.autoUppercase(this.headerCtrl('pan'));
    this.autoUppercase(this.footerCtrl('ifsc'));
    this.autoUppercase(this.headerCtrl('cin'));
    this.resetFromServer();
  }

  /** Re-fetches the profile and patches the form. Used as the "Revert" action. */
  resetFromServer(): void {
    this.profileSvc.invalidate();
    this.busy.set(true);
    this.profileSvc.getOrLoadForEdit().then((tpl) => this.patchFromTemplate(tpl))
      .catch((e) => this.saveError.set(e?.message ?? 'Failed to load profile.'))
      .finally(() => this.busy.set(false));
  }

  private patchFromTemplate(tpl: InvoiceTemplate): void {
    // Rebuild the address-lines array to match the loaded count.
    const lines = tpl.header?.addressLines ?? [];
    while (this.addressLines.length > 0) this.addressLines.removeAt(0);
    if (lines.length === 0) {
      this.addressLines.push(this.fb.nonNullable.control(''));
    } else {
      for (const line of lines) this.addressLines.push(this.fb.nonNullable.control(line ?? ''));
    }

    this.form.patchValue({
      header: {
        phone: tpl.header?.phone ?? '',
        email: tpl.header?.email ?? '',
        website: tpl.header?.website ?? '',
        gstin: tpl.header?.gstin ?? '',
        pan: tpl.header?.pan ?? '',
        cin: tpl.header?.cin ?? ''
      },
      footer: {
        bankAccountName: tpl.footer?.bankAccountName ?? '',
        bankName: tpl.footer?.bankName ?? '',
        accountNumber: tpl.footer?.accountNumber ?? '',
        ifsc: tpl.footer?.ifsc ?? '',
        branch: tpl.footer?.branch ?? '',
        upiId: tpl.footer?.upiId ?? ''
      },
      signature: {
        signatoryName: tpl.signature?.signatoryName ?? '',
        signatoryTitle: tpl.signature?.signatoryTitle ?? ''
      },
      termsAndConditions: tpl.termsAndConditions ?? '',
      disclaimer: tpl.disclaimer ?? ''
    });
    this.form.markAsPristine();
    this.savedOk.set(false);
  }

  addAddressLine(): void {
    this.addressLines.push(this.fb.nonNullable.control(''));
    this.addressLines.markAsDirty();
  }

  removeAddressLine(i: number): void {
    if (this.addressLines.length === 1) return; // keep at least one input visible
    this.addressLines.removeAt(i);
    this.addressLines.markAsDirty();
  }

  async onSave(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.saveError.set(null);
    try {
      const raw = this.form.getRawValue();
      let website = (raw.header.website ?? '').trim();
      if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
      const template: InvoiceTemplate = {
        header: { ...raw.header, website, addressLines: raw.header.addressLines as string[] },
        footer: { ...raw.footer },
        signature: { ...raw.signature },
        termsAndConditions: raw.termsAndConditions,
        disclaimer: raw.disclaimer
      };
      await this.profileSvc.save(template);
      this.form.markAsPristine();
      this.savedOk.set(true);
      // Refresh from server so any server-side transformations (timestamps) show up.
      const fresh = await this.profileSvc.getOrLoadForEdit();
      this.patchFromTemplate(fresh);
      this.savedOk.set(true);
    } catch (e: any) {
      this.saveError.set(e?.message ?? 'Save failed.');
    } finally {
      this.busy.set(false);
    }
  }

  // ----- helpers used by the template -----

  showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  headerCtrl(name: 'phone' | 'email' | 'website' | 'gstin' | 'pan' | 'cin'): AbstractControl {
    return this.form.controls.header.get(name)!;
  }
  footerCtrl(name: 'bankAccountName' | 'bankName' | 'accountNumber' | 'ifsc' | 'branch' | 'upiId'): AbstractControl {
    return this.form.controls.footer.get(name)!;
  }

  private autoUppercase(control: AbstractControl): void {
    control.valueChanges.subscribe((v: string | null) => {
      const upper = (v ?? '').toUpperCase().trim();
      if (upper !== v) control.setValue(upper, { emitEvent: false });
    });
  }
}
