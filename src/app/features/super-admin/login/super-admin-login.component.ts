import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-super-admin-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <main class="login-shell">
      <h1>BillEasy Super Admin</h1>
      <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
        <label>Email <input type="email" formControlName="email" autocomplete="email" /></label>
        <label>Password <input type="password" formControlName="password" autocomplete="current-password" /></label>
        @if (error(); as e) { <p class="error">{{ e }}</p> }
        <button type="submit" [disabled]="form.invalid || busy()">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
      <p class="muted small"><a href="/login">Company sign in</a></p>
    </main>
  `,
  styles: [`
    .login-shell { max-width: 360px; margin: 60px auto; font-family: system-ui, sans-serif; padding: 20px; }
    h1 { margin: 0 0 16px 0; }
    form > label { display: block; margin: 8px 0; }
    form input { display: block; width: 100%; padding: 8px; margin-top: 4px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    button { padding: 8px 14px; background: #6c3fb5; color: white; border: 0; border-radius: 4px; cursor: pointer; margin-top: 8px; }
    button[disabled] { opacity: 0.6; cursor: progress; }
    .muted { color: #666; }
    .small { font-size: 12px; margin-top: 24px; }
    .error { color: #c0392b; }
  `]
})
export class SuperAdminLoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.signInWithEmail(email, password);
      const claims = await this.auth.refreshClaims(true);
      if (claims.role !== 'super-admin') {
        await this.auth.signOut();
        this.error.set('Not authorized as super admin.');
        return;
      }
      await this.router.navigateByUrl('/super-admin/companies');
    } catch (err) {
      this.error.set('Sign-in failed. Check your email and password.');
    } finally {
      this.busy.set(false);
    }
  }
}
