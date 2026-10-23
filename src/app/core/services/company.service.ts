import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData, getDoc, serverTimestamp, updateDoc
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { Company, CompanyFeatures, CompanyStatus } from '../models/company';

function quote(value: string): string {
  if (!/[\s"']/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);

  async getGate(companyCode: string): Promise<Company | null> {
    const snap = await getDoc(doc(this.db, `companies/${companyCode}`));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Company, 'id'>) };
  }

  /** Convenience: read the gate doc for the signed-in tenant. */
  async getMyGate(): Promise<Company | null> {
    const cid = this.auth.companyId();
    if (!cid) return null;
    return this.getGate(cid);
  }

  /**
   * Updates the cosmetic fields (`name`, `defaultCurrency`) of the signed-in
   * tenant's gate document. The doc ID and status remain super-admin-only;
   * Firestore Security Rules enforce that constraint independently.
   *
   * Client-side validation mirrors the rule constraints to surface errors
   * before the network round-trip:
   * - `name` is required, 1..120 characters after trimming.
   * - `defaultCurrency` matches `^[A-Z]{3}$` after trimming + uppercasing.
   */
  async updateGateInfo(args: { name: string; defaultCurrency: string }): Promise<void> {
    const cid = this.auth.companyId();
    if (!cid) throw new Error('Not signed in to a tenant.');
    const name = (args.name ?? '').trim();
    const defaultCurrency = (args.defaultCurrency ?? '').trim().toUpperCase();
    if (name.length < 1 || name.length > 120) {
      throw new Error('Company name must be 1–120 characters.');
    }
    if (!/^[A-Z]{3}$/.test(defaultCurrency)) {
      throw new Error('Default currency must be three uppercase letters (ISO 4217).');
    }
    await updateDoc(doc(this.db, `companies/${cid}`), {
      name,
      defaultCurrency,
      updatedAt: serverTimestamp()
    });
    this.invalidate();
  }

  /**
   * Super-admin only: turn a per-tenant feature flag on/off. Written directly
   * (not via the operator CLI) because the Firestore rules already let a
   * super-admin update the gate doc; company-admins are blocked from touching
   * `features` by the same rules.
   */
  async setFeature(companyCode: string, feature: keyof CompanyFeatures, enabled: boolean): Promise<void> {
    await updateDoc(doc(this.db, `companies/${companyCode}`), {
      [`features.${feature}`]: enabled,
      updatedAt: serverTimestamp()
    });
  }

  /**
   * No-op today — placeholder for future caching of `getGate`. Callers that
   * just wrote the gate doc should still invoke this so the surface stays
   * cache-aware as the codebase grows. Mirrors `CompanyProfileService.invalidate()`.
   */
  invalidate(): void {
    // Intentionally empty.
  }

  listAll$(): Observable<Company[]> {
    const col = collection(this.db, 'companies');
    return collectionData(col, { idField: 'id' }) as Observable<Company[]>;
  }

  get$(companyCode: string): Observable<Company | undefined> {
    return docData(doc(this.db, `companies/${companyCode}`), { idField: 'id' }) as Observable<Company | undefined>;
  }

  // ----- write paths: operator CLI commands -----
  //
  // Writing custom claims requires the Admin SDK. Until the project is on the
  // Blaze plan (and the setUserClaims Cloud Function is deployed), the super-admin
  // UI surfaces a copy-pasteable `admin-ops.mjs` command instead of mutating
  // directly. The operator runs it on a workstation with service-account.json.

  generateCreateCompanyCommand(args: {
    companyCode: string;
    companyName: string;
    defaultCurrency: string;
    adminEmail: string;
    adminDisplayName: string;
  }): string {
    return [
      'node admin-ops.mjs create-company',
      quote(args.companyCode),
      quote(args.companyName),
      quote(args.defaultCurrency),
      quote(args.adminEmail),
      quote(args.adminDisplayName)
    ].join(' ');
  }

  generateSetStatusCommand(companyCode: string, status: CompanyStatus): string {
    return `node admin-ops.mjs set-company-status ${quote(companyCode)} ${status}`;
  }

  generateCreateCompanyAdminCommand(args: {
    companyCode: string;
    email: string;
    displayName: string;
  }): string {
    return [
      'node admin-ops.mjs create-company-admin',
      quote(args.companyCode),
      quote(args.email),
      quote(args.displayName)
    ].join(' ');
  }
}
