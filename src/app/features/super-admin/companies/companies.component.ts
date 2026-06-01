import { Component, inject, signal } from '@angular/core';
import { AsyncPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CompanyService } from '../../../core/services/company.service';
import { COMPANY_CODE_PATTERN } from '../../../core/models/role';

@Component({
  selector: 'app-companies',
  standalone: true,
  imports: [AsyncPipe, DatePipe, ReactiveFormsModule],
  template: `
    <h1>Companies</h1>

    <p class="muted small">
      Privileged operations (create company, change status, add admin) emit a
      <code>node admin-ops.mjs</code> command for the operator to run.
      Until the project is upgraded to the Blaze plan, the UI does not mutate these directly.
    </p>

    <details class="card" [open]="showCreate()">
      <summary (click)="showCreate.set(!showCreate())">Create company</summary>
      <form [formGroup]="form" (ngSubmit)="onCreate()" novalidate>
        <label>
          Company code (lowercase, digits, hyphens, 3-32)
          <input formControlName="companyCode" />
          @if (showError(form.controls.companyCode)) {
            <small class="field-error">Must be 3-32 chars: lowercase letters, digits, hyphens. Example: <code>acme-co</code>.</small>
          }
        </label>
        <label>
          Company name
          <input formControlName="companyName" />
          @if (showError(form.controls.companyName)) {
            <small class="field-error">Required.</small>
          }
        </label>
        <label>
          Default currency (ISO 4217, e.g. USD)
          <input formControlName="defaultCurrency" maxlength="3" />
          @if (showError(form.controls.defaultCurrency)) {
            <small class="field-error">Three uppercase letters, e.g. <code>USD</code>.</small>
          }
        </label>
        <fieldset>
          <legend>Bootstrap admin</legend>
          <label>
            Admin email
            <input type="email" formControlName="adminEmail" />
            @if (showError(form.controls.adminEmail)) {
              <small class="field-error">Enter a valid email.</small>
            }
          </label>
          <label>
            Admin display name
            <input formControlName="adminDisplayName" />
            @if (showError(form.controls.adminDisplayName)) {
              <small class="field-error">Required.</small>
            }
          </label>
        </fieldset>
        @if (form.invalid && form.touched) {
          <p class="field-error">
            Fix the field(s) above to enable <strong>Generate command</strong>.
          </p>
        }
        <button type="submit" [disabled]="form.invalid">Generate command</button>
        @if (createCommand(); as cmd) {
          <div class="command-block">
            <p class="ok">Run this on the operator workstation:</p>
            <textarea readonly rows="3" #createCmd>{{ cmd }}</textarea>
            <button type="button" (click)="copy(cmd, createCopied)">
              {{ createCopied() ? 'Copied' : 'Copy' }}
            </button>
            <p class="muted small">After running it, the operator will email the password-reset link to the new admin.</p>
          </div>
        }
      </form>
    </details>

    <div class="table-scroll">
    <table class="grid">
      <thead><tr><th>Code</th><th>Name</th><th>Default ccy</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>
        @for (c of (companies$ | async) ?? []; track c.id) {
          <tr>
            <td><code>{{ c.id }}</code></td>
            <td>{{ c.name }}</td>
            <td>{{ c.defaultCurrency }}</td>
            <td>
              <span class="badge" [class.inactive]="c.status !== 'active'">{{ c.status }}</span>
            </td>
            <td>{{ c.createdAt?.toDate() | date:'mediumDate' }}</td>
            <td>
              <button type="button" (click)="toggleStatus(c.id, c.status)">
                {{ c.status === 'active' ? 'Deactivate' : 'Activate' }}
              </button>
              <button type="button" (click)="addAdmin(c.id)">Add admin</button>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="muted">No companies yet.</td></tr>
        }
      </tbody>
    </table>
    </div>

    @if (statusCommand(); as sc) {
      <div class="card command-block">
        <p class="ok">Run this on the operator workstation to {{ sc.action }} <code>{{ sc.code }}</code>:</p>
        <textarea readonly rows="2">{{ sc.command }}</textarea>
        <button type="button" (click)="copy(sc.command, statusCopied)">
          {{ statusCopied() ? 'Copied' : 'Copy' }}
        </button>
        <button type="button" (click)="statusCommand.set(null); statusCopied.set(false)">Close</button>
      </div>
    }

    @if (addAdminFor()) {
      <div class="card">
        <h3>Add admin to <code>{{ addAdminFor() }}</code></h3>
        <form [formGroup]="addAdminForm" (ngSubmit)="submitAddAdmin()" novalidate>
          <label>
            Email
            <input type="email" formControlName="email" />
            @if (showError(addAdminForm.controls.email)) {
              <small class="field-error">Enter a valid email.</small>
            }
          </label>
          <label>
            Display name
            <input formControlName="displayName" />
            @if (showError(addAdminForm.controls.displayName)) {
              <small class="field-error">Required.</small>
            }
          </label>
          <button type="submit" [disabled]="addAdminForm.invalid">Generate command</button>
          <button type="button" (click)="closeAddAdmin()">Close</button>
          @if (addAdminCommand(); as cmd) {
            <div class="command-block">
              <p class="ok">Run this on the operator workstation:</p>
              <textarea readonly rows="3">{{ cmd }}</textarea>
              <button type="button" (click)="copy(cmd, addAdminCopied)">
                {{ addAdminCopied() ? 'Copied' : 'Copy' }}
              </button>
            </div>
          }
        </form>
      </div>
    }
  `,
  styles: [`
    h1 { margin: 0 0 16px 0; }
    .card { border: 1px solid #ddd; border-radius: 6px; padding: 14px; margin: 12px 0; background: #fafafa; }
    .grid { width: 100%; border-collapse: collapse; background: white; }
    .grid th, .grid td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; vertical-align: middle; }
    .grid th { background: #f5f5f5; font-size: 13px; }
    .badge { padding: 2px 6px; border-radius: 12px; background: #d3f4d3; color: #1e6f1e; font-size: 12px; }
    .badge.inactive { background: #f4d3d3; color: #6f1e1e; }
    form label { display: block; margin: 6px 0; }
    form input { display: block; width: 100%; padding: 6px; margin-top: 4px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    fieldset { border: 1px solid #ddd; padding: 8px; margin: 8px 0; }
    legend { font-size: 13px; padding: 0 6px; }
    button { padding: 6px 12px; background: #1e6fff; color: white; border: 0; border-radius: 4px; cursor: pointer; margin: 4px 4px 4px 0; }
    button[disabled] { opacity: 0.6; cursor: not-allowed; }
    .muted { color: #888; }
    .small { font-size: 12px; }
    .ok { color: #1e6f1e; margin: 4px 0; }
    .field-error { color: #c0392b; font-size: 12px; display: block; margin-top: 4px; }
    input.ng-invalid.ng-touched { border-color: #c0392b; }
    .command-block { margin-top: 10px; padding: 10px; background: #1e1e1e; border-radius: 4px; }
    .command-block .ok, .command-block .muted { color: #cce5cc; }
    .command-block textarea {
      width: 100%; background: #000; color: #c0f0c0; border: 0; font-family: ui-monospace, monospace;
      font-size: 12px; padding: 8px; border-radius: 3px; resize: vertical; box-sizing: border-box;
    }
    code { background: #eee; padding: 1px 4px; border-radius: 3px; }
  `]
})
export class CompaniesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);

  readonly companies$ = this.companies.listAll$();
  readonly showCreate = signal(false);
  readonly createCommand = signal<string | null>(null);
  readonly createCopied = signal(false);

  readonly form = this.fb.nonNullable.group({
    companyCode: ['', [Validators.required, Validators.pattern(COMPANY_CODE_PATTERN)]],
    companyName: ['', [Validators.required]],
    defaultCurrency: ['USD', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]],
    adminEmail: ['', [Validators.required, Validators.email]],
    adminDisplayName: ['', [Validators.required]]
  });

  readonly statusCommand = signal<{ code: string; action: string; command: string } | null>(null);
  readonly statusCopied = signal(false);

  readonly addAdminFor = signal<string | null>(null);
  readonly addAdminCommand = signal<string | null>(null);
  readonly addAdminCopied = signal(false);
  readonly addAdminForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    displayName: ['', [Validators.required]]
  });

  constructor() {
    // Auto-normalize: company code → lowercase, currency → uppercase.
    this.form.controls.companyCode.valueChanges.subscribe((v) => {
      const normalized = (v ?? '').toLowerCase().trim();
      if (normalized !== v) this.form.controls.companyCode.setValue(normalized, { emitEvent: false });
    });
    this.form.controls.defaultCurrency.valueChanges.subscribe((v) => {
      const normalized = (v ?? '').toUpperCase().trim();
      if (normalized !== v) this.form.controls.defaultCurrency.setValue(normalized, { emitEvent: false });
    });
  }

  /** Show validation message when the control is touched or dirty and has errors. */
  showError(control: { invalid: boolean; touched: boolean; dirty: boolean }): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  onCreate(): void {
    if (this.form.invalid) return;
    const cmd = this.companies.generateCreateCompanyCommand(this.form.getRawValue());
    this.createCommand.set(cmd);
    this.createCopied.set(false);
  }

  toggleStatus(code: string, current: 'active' | 'inactive'): void {
    const next = current === 'active' ? 'inactive' : 'active';
    const command = this.companies.generateSetStatusCommand(code, next);
    this.statusCommand.set({ code, action: next === 'active' ? 'activate' : 'deactivate', command });
    this.statusCopied.set(false);
  }

  addAdmin(code: string): void {
    this.addAdminFor.set(code);
    this.addAdminCommand.set(null);
    this.addAdminCopied.set(false);
    this.addAdminForm.reset({ email: '', displayName: '' });
  }

  closeAddAdmin(): void {
    this.addAdminFor.set(null);
    this.addAdminCommand.set(null);
    this.addAdminCopied.set(false);
  }

  submitAddAdmin(): void {
    const code = this.addAdminFor();
    if (!code || this.addAdminForm.invalid) return;
    const { email, displayName } = this.addAdminForm.getRawValue();
    const cmd = this.companies.generateCreateCompanyAdminCommand({ companyCode: code, email, displayName });
    this.addAdminCommand.set(cmd);
    this.addAdminCopied.set(false);
  }

  async copy(text: string, flag: { set: (v: boolean) => void }): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      flag.set(true);
    } catch {
      flag.set(false);
    }
  }
}
