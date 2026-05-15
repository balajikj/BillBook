import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-super-admin-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="topbar">
      <strong>BillEasy · Super Admin</strong>
      <nav>
        <a routerLink="/super-admin/companies" routerLinkActive="active">Companies</a>
      </nav>
      <span class="spacer"></span>
      <span class="muted">{{ auth.user()?.email }}</span>
      <button type="button" (click)="signOut()">Sign out</button>
    </header>
    <section class="page"><router-outlet /></section>
  `,
  styles: [`
    .topbar { display: flex; align-items: center; gap: 16px; padding: 10px 16px; background: #2c1c52; color: white; }
    .topbar a { color: white; text-decoration: none; padding: 4px 8px; border-radius: 4px; }
    .topbar a.active, .topbar a:hover { background: rgba(255,255,255,0.12); }
    .spacer { flex: 1; }
    .muted { color: rgba(255,255,255,0.7); font-size: 12px; }
    button { background: transparent; color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; padding: 4px 10px; cursor: pointer; }
    .page { padding: 16px; font-family: system-ui, sans-serif; }
  `]
})
export class SuperAdminShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/super-admin/login');
  }
}
