/**
 * Canonical Indian GST rate slabs surfaced as a dropdown on the invoice form.
 *
 * Values are the FULL GST rate (CGST + SGST combined). The invoice form
 * splits each into halves at compute time — e.g. 18% renders as 9% CGST + 9%
 * SGST on the bill.
 *
 * Order is from lowest to highest. The description after the rate gives the
 * admin a short anchor for "which slab does my goods fall under?" without
 * pretending to be a substitute for the CBIC's tariff tables.
 */

export interface GstSlab {
  /** Full GST rate as a percentage (e.g. 18 means 18%, not 0.18). */
  value: number;
  /** Single-line label shown in the dropdown — `<rate>% — <description>`. */
  label: string;
}

export const GST_SLABS: readonly GstSlab[] = [
  { value: 0,    label: '0% — essential goods (exempt)' },
  { value: 0.25, label: '0.25% — special category (rough diamonds)' },
  { value: 3,    label: '3% — precious metals (gold, silver)' },
  { value: 5,    label: '5% — basic / essential goods' },
  { value: 12,   label: '12% — standard goods + services' },
  { value: 18,   label: '18% — most commonly used slab' },
  { value: 28,   label: '28% — luxury / sin goods' }
];
