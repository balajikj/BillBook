import { Timestamp } from '@angular/fire/firestore';

// Per-tenant invoice template at /companies/{companyId}/private/invoice-template.
// Editable by company-admin only. All fields are optional — an empty document is
// the zero value and produces the same PDF as a tenant that hasn't saved a profile.
export interface InvoiceTemplate {
  header?: InvoiceTemplateHeader;
  footer?: InvoiceTemplateFooter;
  signature?: InvoiceTemplateSignature;
  termsAndConditions?: string; // multi-line; line breaks preserved in PDF
  disclaimer?: string;          // multi-line; renders as small italic under signature
  updatedAt?: Timestamp;
  updatedBy?: string;           // uid of the admin who last saved
}

export interface InvoiceTemplateHeader {
  phone?: string;
  email?: string;
  /** Free-form address text. Line breaks in the string are preserved in the PDF. */
  address?: string;
  gstin?: string;
  pan?: string;
  cin?: string;
  website?: string;
}

export interface InvoiceTemplateFooter {
  bankAccountName?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  branch?: string;
  upiId?: string;
}

export interface InvoiceTemplateSignature {
  signatoryName?: string;
  signatoryTitle?: string;      // defaults to "Authorized Signatory" at render time
}

/** Empty template — equivalent to a tenant that has never saved a profile. */
export const EMPTY_INVOICE_TEMPLATE: InvoiceTemplate = Object.freeze({
  header: Object.freeze({}),
  footer: Object.freeze({}),
  signature: Object.freeze({})
}) as InvoiceTemplate;

// ----- format helpers (used by both the editor and the PDF renderer) -----

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_NUMBER_REGEX = /^[0-9]{6,18}$/;
export const TEXT_AREA_MAX = 2000;
