import { Injectable, inject, signal } from '@angular/core';
import { Firestore, doc, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { EMPTY_INVOICE_TEMPLATE, InvoiceTemplate } from '../models/invoice-template';
import { AuthService } from './auth.service';

/**
 * Loads and caches the per-tenant invoice template document at
 * `/companies/{cid}/private/invoice-template`. One Firestore read per session
 * (cache invalidated by `save()` and by `invalidate()`).
 */
@Injectable({ providedIn: 'root' })
export class CompanyProfileService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);

  // Per-companyId cache. Holds the resolved Promise so concurrent callers
  // share a single in-flight read. Resolved value is `null` when the doc
  // doesn't exist (lets the PDF renderer keep its byte-identical prior layout
  // for tenants that have never touched their profile).
  private cache = new Map<string, Promise<InvoiceTemplate | null>>();

  /** Loads the profile for the current tenant, returning `null` if no doc exists. */
  async getOrLoad(): Promise<InvoiceTemplate | null> {
    const cid = this.requireCid();
    const existing = this.cache.get(cid);
    if (existing) return existing;
    const promise = this.fetch(cid);
    this.cache.set(cid, promise);
    try {
      return await promise;
    } catch (err) {
      // Failure means the next call should retry, not return a stale error.
      this.cache.delete(cid);
      throw err;
    }
  }

  /** Like getOrLoad, but returns the empty template instead of `null` for callers
   *  that want a "ready-to-edit" value (e.g. the Profile editor form). */
  async getOrLoadForEdit(): Promise<InvoiceTemplate> {
    return (await this.getOrLoad()) ?? cloneEmpty();
  }

  /** Forces the next `getOrLoad` to re-fetch (e.g. after a concurrent edit). */
  invalidate(): void {
    const cid = this.auth.companyId();
    if (cid) this.cache.delete(cid);
    else this.cache.clear();
  }

  /**
   * Saves the template. Strips blank/null/undefined fields so the persisted
   * document does not store empty strings, then sets `updatedAt`/`updatedBy`.
   * Replaces the document in full (no merge) to remove fields the admin cleared.
   * Invalidates the cache so the next read returns the freshly saved values.
   */
  async save(template: InvoiceTemplate): Promise<void> {
    const cid = this.requireCid();
    const uid = this.auth.user()?.uid;
    if (!uid) throw new Error('Not signed in.');

    const cleaned = stripEmpty(template);
    cleaned.updatedAt = serverTimestamp() as any;
    cleaned.updatedBy = uid;
    await setDoc(doc(this.db, `companies/${cid}/private/invoice-template`), cleaned);
    this.invalidate();
  }

  // ----- internals -----

  private requireCid(): string {
    const cid = this.auth.companyId();
    if (!cid) throw new Error('No companyId on the current session.');
    return cid;
  }

  private async fetch(cid: string): Promise<InvoiceTemplate | null> {
    const snap = await getDoc(doc(this.db, `companies/${cid}/private/invoice-template`));
    if (!snap.exists()) return null;
    const raw = snap.data() as InvoiceTemplate;
    return {
      header: raw.header ?? {},
      footer: raw.footer ?? {},
      signature: raw.signature ?? {},
      termsAndConditions: raw.termsAndConditions ?? undefined,
      disclaimer: raw.disclaimer ?? undefined,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy
    };
  }
}

function cloneEmpty(): InvoiceTemplate {
  // EMPTY_INVOICE_TEMPLATE is frozen; consumers may want to mutate, so hand back a fresh copy.
  return { header: {}, footer: {}, signature: {} };
}

/**
 * Returns a copy of `template` with blank strings, undefined, null, empty
 * arrays, and empty nested objects removed. Used before persisting so the
 * stored document only carries fields the admin actually filled in.
 */
function stripEmpty(template: InvoiceTemplate): InvoiceTemplate {
  const out: any = {};
  const header = stripStringFields(template.header ?? {});
  // Header's addressLines is an array; the generic string-field stripper kept it as-is.
  if (Array.isArray(header['addressLines'])) {
    const lines = (header['addressLines'] as string[])
      .map((l) => (l ?? '').trim())
      .filter((l) => l !== '');
    if (lines.length) header['addressLines'] = lines;
    else delete header['addressLines'];
  }
  if (Object.keys(header).length) out.header = header;

  const footer = stripStringFields(template.footer ?? {});
  if (Object.keys(footer).length) out.footer = footer;

  const signature = stripStringFields(template.signature ?? {});
  if (Object.keys(signature).length) out.signature = signature;

  const t = (template.termsAndConditions ?? '').trim();
  if (t) out.termsAndConditions = t;
  const d = (template.disclaimer ?? '').trim();
  if (d) out.disclaimer = d;

  return out;
}

function stripStringFields(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed !== '') out[k] = trimmed;
      continue;
    }
    out[k] = v;
  }
  return out;
}
