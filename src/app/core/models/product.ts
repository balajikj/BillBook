import { Timestamp } from '@angular/fire/firestore';

export interface Product {
  id: string;
  name: string;
  description?: string;
  unitPrice: number;     // non-negative
  currency: string;      // ISO 4217
  // India-specific (optional; added by india-gst-invoicing).
  // HSN (goods) or SAC (services) code — 4-8 digits.
  hsnSac?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
}
