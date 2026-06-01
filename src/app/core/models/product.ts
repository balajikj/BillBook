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
  // Inventory stock (added by product-inventory feature). Decimal allowed —
  // matches line-item quantity so products sold by the metre / kg also work.
  // Legacy docs without this field read as 0 via `getProductQuantity`.
  // Negative values are allowed (over-sold); the UI surfaces a warning.
  quantity?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
}

/** Central accessor — legacy products with no `quantity` field read as 0. */
export function getProductQuantity(p: Pick<Product, 'quantity'> | undefined | null): number {
  return p?.quantity ?? 0;
}
