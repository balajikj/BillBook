import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
// Note: FormControl is used inside optionalEmail() below.
import { CompanyProfileService } from '../../core/services/company-profile.service';
import { CompanyService } from '../../core/services/company.service';
import { Company } from '../../core/models/company';
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
      <!-- COMPANY (admin self-service for name + defaultCurrency) -->
      <!-- ============================================================== -->
      <section class="card" formGroupName="company">
        <h2>Company</h2>

        <div class="grid">
          <label>
            Code
            <input formControlName="code" />
            <small class="muted small">Set by platform admin.</small>
          </label>
          <label>
            Status
            <input formControlName="status" />
            <small class="muted small">Set by platform admin.</small>
          </label>
          <label>
            Name
            <input formControlName="name" placeholder="Acme Co." maxlength="120" />
            @if (showError(companyCtrl('name'))) { <small class="field-error">Required, 1–120 characters.</small> }
          </label>
          <label>
            Default currency
            <input formControlName="defaultCurrency" maxlength="3" placeholder="USD" />
            @if (showError(companyCtrl('defaultCurrency'))) { <small class="field-error">Three uppercase letters, e.g. <code>USD</code>.</small> }
            <small class="muted small">Default for new invoices and new customers; existing records keep their saved currency.</small>
          </label>
        </div>
      </section>

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

        <label class="block">
          Address <span class="muted small">(free-form; use Enter to break across lines if you want)</span>
          <textarea formControlName="address" rows="3" placeholder="12 MG Road, Bengaluru 560001"></textarea>
        </label>
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
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px 16px; }
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
  private readonly companies = inject(CompanyService);

  readonly maxTextLen = TEXT_AREA_MAX;
  readonly busy = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly savedOk = signal(false);

  readonly form = this.fb.nonNullable.group({
    company: this.fb.nonNullable.group({
      code: [{ value: '', disabled: true }],
      status: [{ value: '', disabled: true }],
      name: ['', [Validators.required, Validators.maxLength(120)]],
      defaultCurrency: ['', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]]
    }),
    header: this.fb.nonNullable.group({
      phone: [''],
      email: ['', [optionalEmail]],
      website: [''],
      gstin: ['', [optionalPattern(GSTIN_REGEX, 'gstin')]],
      pan: ['', [optionalPattern(PAN_REGEX, 'pan')]],
      cin: [''],
      address: ['']
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
    disclaimer: ['', [Validators.maxLength(TEXT_AREA_MAX)]]
  });

  constructor() {
    // Auto-uppercase GSTIN, PAN, IFSC, CIN, and the company default currency on every change.
    this.autoUppercase(this.headerCtrl('gstin'));
    this.autoUppercase(this.headerCtrl('pan'));
    this.autoUppercase(this.footerCtrl('ifsc'));
    this.autoUppercase(this.headerCtrl('cin'));
    this.autoUppercase(this.companyCtrl('defaultCurrency'));
    this.resetFromServer();
  }

  /** Re-fetches the profile + company gate and patches the form. Used as the "Revert" action. */
  resetFromServer(): void {
    this.profileSvc.invalidate();
    this.companies.invalidate();
    this.busy.set(true);
    Promise.all([this.profileSvc.getOrLoadForEdit(), this.companies.getMyGate()])
      .then(([tpl, gate]) => {
        this.patchFromTemplate(tpl);
        this.patchFromGate(gate);
      })
      .catch((e) => this.saveError.set(e?.message ?? 'Failed to load profile.'))
      .finally(() => this.busy.set(false));
  }

  private patchFromGate(gate: Company | null): void {
    this.form.controls.company.patchValue({
      code: gate?.id ?? '',
      status: gate?.status ?? '',
      name: gate?.name ?? '',
      defaultCurrency: gate?.defaultCurrency ?? ''
    });
    this.form.controls.company.markAsPristine();
  }

  private patchFromTemplate(tpl: InvoiceTemplate): void {
    this.form.patchValue({
      header: {
        phone: tpl.header?.phone ?? '',
        email: tpl.header?.email ?? '',
        website: tpl.header?.website ?? '',
        gstin: tpl.header?.gstin ?? '',
        pan: tpl.header?.pan ?? '',
        cin: tpl.header?.cin ?? '',
        address: tpl.header?.address ?? ''
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
      disclaimer: tpl.disclaimer ?? ''
    });
    this.form.markAsPristine();
    this.savedOk.set(false);
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
        header: { ...raw.header, website },
        footer: { ...raw.footer },
        signature: { ...raw.signature },
        disclaimer: raw.disclaimer
      };

      const companyDirty = this.form.controls.company.dirty;
      const writes: Array<{ label: string; promise: Promise<void> }> = [
        { label: 'invoice template', promise: this.profileSvc.save(template) }
      ];
      if (companyDirty) {
        const c = this.form.controls.company.controls;
        writes.push({
          label: 'company info',
          promise: this.companies.updateGateInfo({
            name: c.name.value,
            defaultCurrency: c.defaultCurrency.value
          })
        });
      }

      // Per-write error attribution: we want the user to know WHICH write
      // failed if one of them does, rather than a generic "save failed".
      const results = await Promise.allSettled(writes.map((w) => w.promise));
      const failures = results
        .map((r, i) => ({ r, label: writes[i].label }))
        .filter((x) => x.r.status === 'rejected') as Array<{ r: PromiseRejectedResult; label: string }>;
      if (failures.length) {
        const msgs = failures.map((f) => `${f.label}: ${f.r.reason?.message ?? f.r.reason}`);
        throw new Error(`Failed to save ${msgs.join('; ')}`);
      }

      this.form.markAsPristine();
      this.savedOk.set(true);
      // Refresh from server so any server-side transformations (timestamps) show up.
      const [fresh, freshGate] = await Promise.all([
        this.profileSvc.getOrLoadForEdit(),
        this.companies.getMyGate()
      ]);
      this.patchFromTemplate(fresh);
      this.patchFromGate(freshGate);
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
  companyCtrl(name: 'code' | 'status' | 'name' | 'defaultCurrency'): AbstractControl {
    return this.form.controls.company.get(name)!;
  }

  private autoUppercase(control: AbstractControl): void {
    control.valueChanges.subscribe((v: string | null) => {
      const upper = (v ?? '').toUpperCase().trim();
      if (upper !== v) control.setValue(upper, { emitEvent: false });
    });
  }
}
