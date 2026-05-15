import { Injectable, computed, inject, signal } from '@angular/core';
import { Auth, User, authState, idToken, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { Role } from '../models/role';

interface AuthClaims {
  role: Role | null;
  companyId: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);

  private readonly userSig = signal<User | null>(null);
  private readonly claimsSig = signal<AuthClaims>({ role: null, companyId: null });
  private readonly readySig = signal(false);

  readonly user = this.userSig.asReadonly();
  readonly role = computed(() => this.claimsSig().role);
  readonly companyId = computed(() => this.claimsSig().companyId);
  readonly isSignedIn = computed(() => this.userSig() !== null);
  readonly ready = this.readySig.asReadonly();

  constructor() {
    // Track auth state and ID-token changes (claims propagate here).
    authState(this.auth).subscribe(async (u) => {
      this.userSig.set(u ?? null);
      if (!u) {
        this.claimsSig.set({ role: null, companyId: null });
        this.readySig.set(true);
        return;
      }
      await this.refreshClaims();
      this.readySig.set(true);
    });

    idToken(this.auth).subscribe(async () => {
      if (this.auth.currentUser) {
        await this.refreshClaims();
      }
    });
  }

  /** Force-refresh the ID token and update cached claims. Call after role changes. */
  async refreshClaims(forceRefresh = false): Promise<AuthClaims> {
    const current = this.auth.currentUser;
    if (!current) {
      const empty: AuthClaims = { role: null, companyId: null };
      this.claimsSig.set(empty);
      return empty;
    }
    const result = await current.getIdTokenResult(forceRefresh);
    const claims: AuthClaims = {
      role: (result.claims['role'] as Role | undefined) ?? null,
      companyId: (result.claims['companyId'] as string | undefined) ?? null
    };
    this.claimsSig.set(claims);
    return claims;
  }

  signInWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  signOut() {
    return signOut(this.auth);
  }

  /** Resolve after the first auth state emission. Used by guards. */
  async waitForReady(): Promise<void> {
    if (this.readySig()) return;
    await firstValueFrom(authState(this.auth));
  }
}
