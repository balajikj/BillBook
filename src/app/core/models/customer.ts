import { Timestamp } from '@angular/fire/firestore';

export interface Customer {
  id: string;
  name: string;
  email?: string;
  address?: string;
  currency?: string; // optional override of the company default
  // India-specific (optional; added by india-gst-invoicing).
  phoneNumber?: string;
  shopName?: string;
  fullAddress?: string;
  gstNumber?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
}

// Snapshot embedded in an invoice so the invoice survives customer edits/deletes.
export interface CustomerSnapshot {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  // India-specific snapshots (optional, nullable).
  phoneNumber?: string | null;
  shopName?: string | null;
  fullAddress?: string | null;
  gstNumber?: string | null;
}
