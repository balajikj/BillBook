import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="topbar">
      <strong>BillEasy</strong>
      <span class="muted small">{{ companyId() }}</span>
      <span class="spacer"></span>
      <span class="muted small">{{ auth.user()?.email }} · {{ auth.role() }}</span>
      <button type="button" (click)="signOut()">Sign out</button>
    </header>
    <div class="layout">
      <aside class="sidenav">
        @if (isAdmin()) {
          <a routerLink="/app/dashboard" routerLinkActive="active">Dashboard</a>
        }
        <a routerLink="/app/invoices" routerLinkActive="active">Invoices</a>
        @if (isAdmin()) {
          <a routerLink="/app/customers" routerLinkActive="active">Customers</a>
          <a routerLink="/app/products" routerLinkActive="active">Products</a>
          <a routerLink="/app/users" routerLinkActive="active">Users</a>
        }
      </aside>
      <main class="page"><router-outlet /></main>
    </div>
  `,
  styles: [`
    .topbar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #1c2c52; color: white; }
    .spacer { flex: 1; }
    .muted { color: rgba(255,255,255,0.75); }
    .small { font-size: 12px; }
    button { background: transparent; color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; padding: 4px 10px; cursor: pointer; }
    .layout { display: flex; min-height: calc(100vh - 44px); }
    .sidenav { width: 180px; padding: 16px 8px; background: #f3f4f7; }
    .sidenav a { display: block; padding: 8px 12px; border-radius: 4px; text-decoration: none; color: #333; }
    .sidenav a.active, .sidenav a:hover { background: #dde3ef; color: #1e3266; }
    .page { flex: 1; padding: 18px; font-family: system-ui, sans-serif; }
  `]
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly companyId = computed(() => this.auth.companyId() ?? '');
  readonly isAdmin = computed(() => this.auth.role() === 'company-admin');

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
