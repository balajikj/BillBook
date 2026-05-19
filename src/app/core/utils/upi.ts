// UPI deep-link helpers. Pure functions, no Angular / Firebase imports — easy
// to unit-test in isolation.
//
// The canonical UPI payment deep-link format (NPCI):
//   upi://pay?pa=<vpa>&pn=<payee_name>&am=<amount>&cu=INR&tn=<note>
//
// All values must be URL-encoded. `cu` is always INR because UPI does not
// support any other currency.

export interface UpiDeepLinkArgs {
  /** Payee VPA, e.g. `acme@hdfcbank`. */
  vpa: string;
  /** Payee's display name. URL-encoded inside the deep link. */
  payeeName: string;
  /** Invoice amount. Formatted as a plain decimal — no symbol, no thousands separator. */
  amount: number;
  /** Free-form transaction note. Typically the invoice number. */
  transactionNote: string;
}

/**
 * Builds a UPI deep-link suitable for embedding in a QR code.
 *
 * - Amount is formatted via `toFixed(2)` then trimmed: `1227` stays `1227`,
 *   `1227.50` stays `1227.50`. A trailing `.00` is stripped so the QR payload
 *   is as compact as possible (denser QR = faster scan).
 * - `vpa`, `payeeName`, and `transactionNote` are passed through
 *   `encodeURIComponent` so spaces, `&`, `?`, etc. don't break the URL.
 */
export function buildUpiDeepLink(args: UpiDeepLinkArgs): string {
  const am = formatUpiAmount(args.amount);
  const pa = encodeURIComponent(args.vpa.trim());
  const pn = encodeURIComponent(args.payeeName.trim());
  const tn = encodeURIComponent(args.transactionNote.trim());
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
}

/**
 * UPI `am` value: 2-decimal string, but with a trailing `.00` stripped so an
 * integer amount renders as plain digits.
 *
 * - `1227.50` → `1227.50`
 * - `1227.00` → `1227`
 * - `0.99`    → `0.99`
 * - `0`       → `0`
 */
export function formatUpiAmount(amount: number): string {
  const fixed = (Math.max(0, amount) || 0).toFixed(2);
  return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
}
