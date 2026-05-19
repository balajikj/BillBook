## Why

The invoice PDF already prints the company's UPI ID in the Bank Details column of the footer band, but the recipient has to type it manually into their UPI app to pay — an awkward step that defeats the purpose of digital invoicing. Indian invoicing convention is to print a scannable UPI QR code on the invoice that pre-fills the payee VPA, the merchant name, the exact amount, and the transaction note (the invoice number). Scanning the QR opens the recipient's UPI app with the payment ready to confirm.

This change generates a UPI QR code client-side at PDF-render time, embeds it as an image inside the footer band, and makes the printed invoice immediately payable. No new server-side cost, no new Firestore documents, no rule changes — the data sources (UPI ID from the profile, amount from the invoice) already exist.

## What Changes

- Add a tiny `qrcode` dev dependency (the standard `qrcode` npm package, ~30 KB minified, MIT licensed) and an `UpiQrService` (or a small pure helper) that, given `{ vpa, payeeName, amount, currency, transactionNote }`, returns a base64 PNG data URL of the QR.
- Construct the QR payload from the standard UPI deep-link format: `upi://pay?pa=<vpa>&pn=<encoded payee name>&am=<amount>&cu=INR&tn=<invoice number>`. All values are URL-encoded.
- Embed the QR as a pdfmake `image` node inside the footer band, anchored under the existing Bank Details block on the left of each invoice copy. A small caption above the image reads `Scan to pay`. The QR is roughly 70×70 pt.
- The QR renders **only** when **all** of the following hold (otherwise the layout stays exactly as today, no QR area, no caption):
  - The company has a `upiId` configured in the invoice profile.
  - The invoice's `currency === 'INR'` (UPI only supports INR).
  - The invoice's stored status is **not** `paid` (a paid invoice's QR would tempt a duplicate payment; better to suppress).
- The QR is dynamically imported alongside the existing dynamic import of `pdfmake` so the QR library doesn't bloat the initial bundle. Users who never download a PDF never pay the QR-library download cost.
- Update the smoke test to walk: generate an INR invoice while a UPI ID is configured → download PDF → confirm the QR appears under Bank Details and decodes to a `upi://pay?…` URL with the right `pa`, `pn`, `am`, `cu`, `tn`.

## Capabilities

### New Capabilities

<!-- None — this change extends an existing capability only. -->

### Modified Capabilities

- `pdf-billing`: the invoice PDF now embeds a UPI QR code in the footer band when the company has configured a UPI ID, the invoice currency is INR, and the invoice is not yet paid. The QR pre-fills payee, amount, and invoice number for a one-tap payment via any UPI app.

## Impact

- **Code**: one new helper file (`src/app/core/services/upi-qr.service.ts` or inline utility) that wraps `qrcode.toDataURL(...)` and exposes a function that builds the UPI deep-link string. Small additive change to `pdf.service.ts` inside `renderFooterBand` (or a sibling helper) to insert the QR image when the gating conditions are met. No changes to any Firestore document, rule, route, or UI outside the PDF generator.
- **Dependencies**: adds `qrcode` (npm) as a runtime dependency. ~30 KB minified, dynamically imported.
- **Bundle**: the QR library is in a lazy chunk loaded only when a PDF is downloaded (same pattern as pdfmake/vfs_fonts). The initial bundle is unaffected.
- **Data / rules**: zero changes. No new fields stored. No schema migration. No rules to update.
- **Quota**: no additional Firestore reads or writes. PDF generation stays purely client-side.
- **Compatibility**:
  - Tenants without a UPI ID, or those issuing non-INR invoices, see exactly the same PDF as today.
  - Paid invoices show no QR; the rest of the layout is unchanged for them.
  - Existing PDFs already downloaded are not affected (this is render-time only).
- **Out of scope** (intentionally deferred):
  - Open-amount QR (let the payer type the amount themselves) — not for MVP; locked-amount is the typical invoice convention.
  - Multi-rail QRs (Bharat QR with cards/wallets) — UPI-only is sufficient at MVP scope.
  - QR code with embedded merchant logo in the centre.
  - Showing the QR on the on-screen invoice detail view (in addition to the PDF) — PDF only for this change.
  - Verifying that the configured `upiId` is a valid VPA via a lookup service — we trust admin-entered values and rely on the user's UPI app to surface errors if the VPA is bogus.
