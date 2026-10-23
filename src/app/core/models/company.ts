import { Timestamp } from '@angular/fire/firestore';

export type CompanyStatus = 'active' | 'inactive';

// Per-tenant feature flags. Written by super-admin only (Firestore rules pin
// this field for company-admin updates). Missing flags read as `false`.
export interface CompanyFeatures {
  /** Allows choosing a GST slab per line item (instead of one slab per bill). */
  itemWiseTax?: boolean;
}

// Publicly readable gate document at /companies/{companyId}. The Firestore
// rules constrain this document to only the fields below.
export interface Company {
  id: string;            // also the document ID and the user-facing company code
  name: string;
  status: CompanyStatus;
  defaultCurrency: string; // ISO 4217 (e.g. 'USD', 'EUR', 'GBP')
  features?: CompanyFeatures;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Private tenant config at /companies/{companyId}/private/{companyId}.
export interface CompanyPrivate {
  billingEmail?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
}
