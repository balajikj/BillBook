import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { CompanyService } from './company.service';
import { CompanyFeatures } from '../models/company';

/**
 * Per-tenant feature flags (set by the super-admin on the company gate doc).
 * Loaded once per companyId and cached; a failed read leaves every flag off
 * so the app falls back to the default behaviour.
 */
@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly companies = inject(CompanyService);
  private readonly auth = inject(AuthService);
  private loading: { cid: string | null; promise: Promise<CompanyFeatures> } | null = null;
  private readonly featuresSig = signal<CompanyFeatures>({});
  readonly features = this.featuresSig.asReadonly();

  /** Resolves with the signed-in tenant's flags (cached after the first call). */
  load(): Promise<CompanyFeatures> {
    const cid = this.auth.companyId();
    if (!this.loading || this.loading.cid !== cid) {
      const promise = this.companies
        .getMyGate()
        .then((gate) => gate?.features ?? {})
        .catch(() => ({} as CompanyFeatures))
        .then((f) => { this.featuresSig.set(f); return f; });
      this.loading = { cid, promise };
    }
    return this.loading.promise;
  }

  async isEnabled(feature: keyof CompanyFeatures): Promise<boolean> {
    return !!(await this.load())[feature];
  }

  /** Forces a re-read on the next `load()`. */
  reset(): void {
    this.loading = null;
    this.featuresSig.set({});
  }
}
