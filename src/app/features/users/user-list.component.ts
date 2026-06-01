import { Component, inject, signal } from '@angular/core';
import { AsyncPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserAdminService } from '../../core/services/user-admin.service';
import { AuthService } from '../../core/services/auth.service';
import { CompanyUser } from '../../core/models/user';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [AsyncPipe, DatePipe, ReactiveFormsModule],
  template: `
    <h1>Users</h1>
    <p class="muted small">
      Add/remove emits a <code>node admin-ops.mjs</code> command for the operator to run.
      Role changes take effect on the user's next sign-in or token refresh (up to 1 hour).
    </p>

    <details class="card" [open]="creating()">
      <summary (click)="creating.set(!creating())">+ New user</summary>
      <form [formGroup]="form" (ngSubmit)="onCreate()" novalidate>
        <label>Email <input type="email" formControlName="email" /></label>
        <label>Display name <input formControlName="displayName" /></label>
        <button type="submit" [disabled]="form.invalid">Generate command</button>
        @if (createCommand(); as cmd) {
          <div class="command-block">
            <p class="ok">Run this on the operator workstation:</p>
            <textarea readonly rows="3">{{ cmd }}</textarea>
            <button type="button" (click)="copy(cmd, createCopied)">
              {{ createCopied() ? 'Copied' : 'Copy' }}
            </button>
            <p class="muted small">After running it, the operator will email the password-reset link to the new user.</p>
          </div>
        }
      </form>
    </details>

    <div class="table-scroll">
    <table class="grid">
      <thead><tr><th>Email</th><th>Display name</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>
        @for (u of (users$ | async) ?? []; track u.uid) {
          <tr>
            <td>{{ u.email }}</td>
            <td>{{ u.displayName }}</td>
            <td>{{ u.role }}</td>
            <td>{{ u.createdAt?.toDate() | date:'mediumDate' }}</td>
            <td>
              @if (u.uid !== auth.user()?.uid) {
                <button type="button" (click)="remove(u)" class="danger">Remove</button>
              } @else {
                <span class="muted small">(you)</span>
              }
            </td>
          </tr>
        } @empty {
          <tr><td colspan="5" class="muted">No users in this company.</td></tr>
        }
      </tbody>
    </table>
    </div>

    @if (removeCommand(); as rc) {
      <div class="card command-block">
        <p class="ok">Run this on the operator workstation to remove <code>{{ rc.email }}</code>:</p>
        <textarea readonly rows="2">{{ rc.command }}</textarea>
        <button type="button" (click)="copy(rc.command, removeCopied)">
          {{ removeCopied() ? 'Copied' : 'Copy' }}
        </button>
        <button type="button" (click)="removeCommand.set(null); removeCopied.set(false)">Close</button>
      </div>
    }
  `,
  styles: [`
    h1 { margin: 0 0 8px 0; }
    .card { border: 1px solid #ddd; padding: 14px; border-radius: 6px; margin: 12px 0; background: #fafafa; }
    .card label { display: block; margin: 6px 0; }
    .card input { display: block; width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    .grid { width: 100%; border-collapse: collapse; background: white; }
    .grid th, .grid td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
    .grid th { background: #f5f5f5; font-size: 13px; }
    button { background: #1e6fff; color: white; border: 0; padding: 6px 10px; border-radius: 4px; cursor: pointer; margin-right: 4px; }
    button.danger { background: #c0392b; }
    button[disabled] { opacity: 0.6; cursor: not-allowed; }
    .muted { color: #888; }
    .small { font-size: 12px; }
    .ok { color: #1e6f1e; margin: 4px 0; }
    .command-block { margin-top: 10px; padding: 10px; background: #1e1e1e; border-radius: 4px; }
    .command-block .ok, .command-block .muted { color: #cce5cc; }
    .command-block textarea {
      width: 100%; background: #000; color: #c0f0c0; border: 0; font-family: ui-monospace, monospace;
      font-size: 12px; padding: 8px; border-radius: 3px; resize: vertical; box-sizing: border-box;
    }
    code { background: #eee; padding: 1px 4px; border-radius: 3px; }
  `]
})
export class UserListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly users = inject(UserAdminService);
  protected readonly auth = inject(AuthService);

  readonly users$ = this.users.list$();
  readonly creating = signal(false);
  readonly createCommand = signal<string | null>(null);
  readonly createCopied = signal(false);

  readonly removeCommand = signal<{ email: string; command: string } | null>(null);
  readonly removeCopied = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    displayName: ['', [Validators.required]]
  });

  onCreate(): void {
    if (this.form.invalid) return;
    const cmd = this.users.generateCreateUserCommand(this.form.getRawValue());
    this.createCommand.set(cmd);
    this.createCopied.set(false);
  }

  remove(u: CompanyUser): void {
    if (u.uid === this.auth.user()?.uid) {
      alert('You cannot remove yourself.');
      return;
    }
    const command = this.users.generateRemoveUserCommand(u.uid);
    this.removeCommand.set({ email: u.email, command });
    this.removeCopied.set(false);
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
