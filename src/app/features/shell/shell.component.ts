import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="topbar">
      <button
        type="button"
        class="hamburger"
        aria-label="Open menu"
        [class.open]="drawerOpen()"
        (click)="toggleDrawer()"
      >
        <span></span><span></span><span></span>
      </button>
      <strong class="brand">BillEasy</strong>
      <span class="muted small tag">{{ companyId() }}</span>
      <span class="spacer"></span>
      <span class="muted small user-tag">{{ auth.user()?.email }} · {{ auth.role() }}</span>
      <button type="button" class="signout" (click)="signOut()">Sign out</button>
    </header>

    <div class="layout">
      <!-- Sidenav: persistent column on desktop, slide-in drawer on phones. -->
      <aside class="sidenav" [class.drawer-open]="drawerOpen()">
        @if (isAdmin()) {
          <a routerLink="/app/dashboard" routerLinkActive="active" (click)="closeDrawer()">Dashboard</a>
        }
        <a routerLink="/app/invoices" routerLinkActive="active" (click)="closeDrawer()">Invoices</a>
        @if (isAdmin()) {
          <a routerLink="/app/customers" routerLinkActive="active" (click)="closeDrawer()">Customers</a>
          <a routerLink="/app/products" routerLinkActive="active" (click)="closeDrawer()">Products</a>
          <a routerLink="/app/users" routerLinkActive="active" (click)="closeDrawer()">Users</a>
          <a routerLink="/app/profile" routerLinkActive="active" (click)="closeDrawer()">Profile</a>
        }
      </aside>

      <!-- Tap-anywhere-else-to-close backdrop, shown only on phones when open. -->
      @if (drawerOpen()) {
        <div class="backdrop" (click)="closeDrawer()" aria-hidden="true"></div>
      }

      <main class="page"><router-outlet /></main>
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* ---------- Top bar ---------- */
    .topbar {
      display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-2) var(--sp-3);
      background: #1c2c52; color: #fff;
      min-height: var(--shell-topbar-h);
    }
    .brand { font-size: var(--fs-16); }
    .tag, .user-tag { color: rgba(255,255,255,0.75); }
    .spacer { flex: 1; }
    .signout {
      background: transparent; color: #fff;
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: var(--radius); padding: 6px 12px; cursor: pointer;
    }

    /* Hamburger: hidden on desktop, visible at the left of the topbar on phones. */
    .hamburger {
      display: none; flex-direction: column; justify-content: center; gap: 4px;
      width: 36px; height: 36px;
      background: transparent; border: 0; padding: 8px;
      cursor: pointer;
    }
    .hamburger span {
      display: block; height: 2px; background: #fff; border-radius: 2px;
      transition: transform .2s ease, opacity .2s ease;
    }
    .hamburger.open span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
    .hamburger.open span:nth-child(2) { opacity: 0; }
    .hamburger.open span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

    /* ---------- Layout ---------- */
    .layout {
      position: relative;
      display: flex; min-height: calc(100vh - var(--shell-topbar-h));
    }
    .sidenav {
      width: var(--shell-sidenav-w);
      padding: var(--sp-4) var(--sp-2);
      background: var(--color-bg-shell);
      border-right: 1px solid var(--color-border);
    }
    .sidenav a {
      display: block;
      padding: 10px var(--sp-3);
      border-radius: var(--radius);
      text-decoration: none; color: #333; font-size: var(--fs-14);
      min-height: var(--tap-min);
      display: flex; align-items: center;
    }
    .sidenav a.active, .sidenav a:hover { background: #dde3ef; color: #1e3266; }

    .page { flex: 1; min-width: 0; padding: var(--sp-4); }

    /* ---------- Phone: drawer + collapsed user tag + scrim ---------- */
    @media (max-width: 759px) {
      .hamburger { display: flex; }
      .user-tag { display: none; }
      .tag { display: none; }

      /* Sidenav becomes a left-sliding drawer. */
      .sidenav {
        position: fixed; top: var(--shell-topbar-h); left: 0; bottom: 0;
        z-index: 30;
        transform: translateX(-100%);
        transition: transform .25s ease;
        box-shadow: 2px 0 8px rgba(0,0,0,0.12);
      }
      .sidenav.drawer-open { transform: translateX(0); }
      .backdrop {
        position: fixed; top: var(--shell-topbar-h); left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.32);
        z-index: 20;
      }
      .page { padding: var(--sp-3); }
    }
  `]
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly companyId = computed(() => this.auth.companyId() ?? '');
  readonly isAdmin = computed(() => this.auth.role() === 'company-admin');

  readonly drawerOpen = signal(false);

  constructor() {
    // Auto-close drawer on any successful navigation (covers programmatic
    // routing and back/forward buttons, in addition to the explicit (click)
    // close handler on each link).
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.drawerOpen.set(false);
    });
  }

  toggleDrawer(): void { this.drawerOpen.update(v => !v); }
  closeDrawer(): void { this.drawerOpen.set(false); }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
