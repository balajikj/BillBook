import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CompanyService } from '../../core/services/company.service';
import { COMPANY_CODE_PATTERN } from '../../core/models/role';

type Step = 'company' | 'credentials';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <main class="login-shell">
      <h1>BillEasy</h1>

      @if (step() === 'company') {
        <form [formGroup]="companyForm" (ngSubmit)="onSubmitCompany()" novalidate>
          <h2>Step 1 of 2 — Company</h2>
          <label>
            Company code
            <input formControlName="companyCode" autocomplete="off" autocapitalize="off"
                   placeholder="acme-co" />
          </label>
          @if (companyError(); as e) { <p class="error">{{ e }}</p> }
          <button type="submit" [disabled]="companyForm.invalid || busy()">
            {{ busy() ? 'Checking…' : 'Continue' }}
          </button>
        </form>
      } @else {
        <form [formGroup]="credentialsForm" (ngSubmit)="onSubmitCredentials()" novalidate>
          <h2>Step 2 of 2 — Sign in to <strong>{{ gatedCompanyName() }}</strong></h2>
          <p class="muted">Company code: <code>{{ gatedCompanyCode() }}</code> <button type="button" class="link" (click)="resetToCompanyStep()">change</button></p>
          <label>Email <input type="email" formControlName="email" autocomplete="email" /></label>
          <label>Password <input type="password" formControlName="password" autocomplete="current-password" /></label>
          @if (credentialsError(); as e) { <p class="error">{{ e }}</p> }
          <button type="submit" [disabled]="credentialsForm.invalid || busy()">
            {{ busy() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      }

      <p class="muted small">
        Super admin? <a href="/super-admin/login">Sign in here</a>.
      </p>
    </main>
  `,
  styles: [`
    .login-shell { max-width: 360px; margin: 60px auto; font-family: system-ui, sans-serif; padding: 20px; }
    h1 { margin: 0 0 16px 0; }
    h2 { font-size: 14px; color: #555; margin: 0 0 12px 0; font-weight: 500; }
    form > label { display: block; margin: 8px 0; }
    form input { display: block; width: 100%; padding: 8px; margin-top: 4px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    button { padding: 8px 14px; background: #1e6fff; color: white; border: 0; border-radius: 4px; cursor: pointer; margin-top: 8px; }
    button[disabled] { opacity: 0.6; cursor: progress; }
    button.link { background: transparent; color: #1e6fff; padding: 0; text-decoration: underline; }
    .muted { color: #666; }
    .small { font-size: 12px; margin-top: 24px; }
    .error { color: #c0392b; }
    code { background: #f3f3f3; padding: 1px 4px; border-radius: 3px; }
  `]
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly companies = inject(CompanyService);
  private readonly router = inject(Router);

  readonly step = signal<Step>('company');
  readonly busy = signal(false);
  readonly companyError = signal<string | null>(null);
  readonly credentialsError = signal<string | null>(null);
  readonly gatedCompanyCode = signal<string>('');
  readonly gatedCompanyName = signal<string>('');

  readonly companyForm = this.fb.nonNullable.group({
    companyCode: ['', [Validators.required, Validators.pattern(COMPANY_CODE_PATTERN)]]
  });

  readonly credentialsForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  async onSubmitCompany(): Promise<void> {
    if (this.companyForm.invalid) return;
    this.companyError.set(null);
    this.busy.set(true);
    try {
      const code = this.companyForm.controls.companyCode.value.trim();
      const gate = await this.companies.getGate(code);
      if (!gate || gate.status !== 'active') {
        this.companyError.set('Company not found or not active.');
        return;
      }
      this.gatedCompanyCode.set(gate.id);
      this.gatedCompanyName.set(gate.name);
      this.step.set('credentials');
    } catch (err) {
      // Deliberately uniform message — don't leak enumeration.
      this.companyError.set('Company not found or not active.');
    } finally {
      this.busy.set(false);
    }
  }

  async onSubmitCredentials(): Promise<void> {
    if (this.credentialsForm.invalid) return;
    this.credentialsError.set(null);
    this.busy.set(true);
    try {
      const { email, password } = this.credentialsForm.getRawValue();
      await this.auth.signInWithEmail(email, password);
      const claims = await this.auth.refreshClaims(true);
      if (claims.companyId !== this.gatedCompanyCode()) {
        await this.auth.signOut();
        this.credentialsError.set('Account does not belong to this company.');
        return;
      }
      if (claims.role === 'company-admin') {
        await this.router.navigateByUrl('/app/dashboard');
      } else if (claims.role === 'company-user') {
        await this.router.navigateByUrl('/app/invoices');
      } else {
        await this.auth.signOut();
        this.credentialsError.set('Account does not belong to this company.');
      }
    } catch (err: any) {
      this.credentialsError.set('Sign-in failed. Check your email and password.');
    } finally {
      this.busy.set(false);
    }
  }

  resetToCompanyStep(): void {
    this.step.set('company');
    this.credentialsForm.reset({ email: '', password: '' });
    this.credentialsError.set(null);
  }
}
