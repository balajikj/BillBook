## Context

The PDF generator in [src/app/core/services/pdf.service.ts](../../../src/app/core/services/pdf.service.ts) already renders each invoice as two side-by-side copies in portrait, with a footer band that holds Bank Details (left) and the Signature block (right). The UPI ID printed in the Bank Details block today is plain text. To make it scannable, we need an actual QR code embedded as an image.

Two facts shape the design:

1. **UPI deep-link format is well-defined**. The canonical deep link is `upi://pay?pa=<vpa>&pn=<payee_name>&am=<amount>&cu=INR&tn=<note>` (and optionally `tr=` for a reference). Most QR generators handle this as a free-form string.
2. **UPI is INR-only**. NPCI does not support other currencies. A QR encoded with `cu=USD` either fails in the user's app or silently ignores the currency hint — neither is desirable. So the QR must be gated on `invoice.currency === 'INR'`.

A third fact: the QR-generation library is small but non-trivial. We want it lazy-loaded behind the existing PDF download trigger, not eagerly loaded on every page navigation.

## Goals / Non-Goals

**Goals:**

- A printed UPI QR code that any UPI app on a phone (GPay, PhonePe, Paytm, BHIM, etc.) can scan and pre-fill payment details from.
- The QR is generated at PDF-render time from the live data — invoice number, grand total, and the company's configured UPI ID — not stored anywhere.
- The change is additive: tenants without UPI configured, non-INR invoices, and paid invoices keep their prior PDF byte-identical to today.
- The QR library does not affect the initial Angular bundle size.
- No new Firestore reads, writes, indexes, or rules.

**Non-Goals:**

- Open-amount QR (let the payer type the amount). Locked-amount is the typical invoice convention.
- Multi-rail QRs (Bharat QR with cards/wallets) — UPI only.
- Embedding a merchant logo in the QR center.
- On-screen QR display in the invoice-detail view.
- Verifying that the configured `upiId` is a valid VPA via a lookup. Trust admin input.
- Persisting the generated QR image (e.g. in Firebase Storage). Always render-time.

## Decisions

### Decision 1: Use the `qrcode` npm package, dynamically imported

`qrcode` (Node + browser, MIT, ~30 KB minified) is the de-facto QR generator for JS. It supports `toDataURL(...)` which is exactly what pdfmake's `image` node wants (base64 data URL). It generates monochrome PNGs at any size.

The import is dynamic — `(await import('qrcode')).default` — so the library lands in a lazy chunk that is fetched only the first time a user clicks **Download PDF**. This mirrors how `pdfmake/build/pdfmake` and `pdfmake/build/vfs_fonts` are already lazy-loaded today.

**Alternatives considered:**

- *Hand-rolled QR encoder.* Rejected — QR encoding is fiddly (Reed–Solomon, masking, alignment patterns). Reinventing it for a 30 KB library is not a sensible trade.
- *`qr-code-styling`.* Heavier (~140 KB), supports gradients/logos we don't need.
- *Remote QR API (e.g. Google Charts).* The official one is deprecated; using a third-party online generator introduces an extra network dep, privacy concerns, and breaks the offline-friendly PDF generation pattern.

### Decision 2: UPI deep-link payload

The QR encodes a single URL of the form:

```
upi://pay?pa=<encoded vpa>&pn=<encoded payee name>&am=<amount>&cu=INR&tn=<encoded note>
```

- `pa` (payee address) — the configured `template.footer.upiId`.
- `pn` (payee name) — the company's `name` (from the gate doc), URL-encoded.
- `am` (amount) — `getDisplayTotal(invoice)` formatted as a plain decimal with up to two fractional digits (e.g. `1227.50`). No locale grouping. No currency symbol.
- `cu` (currency) — always `INR` because UPI is INR-only. (We don't even encode if the gating check fails — we won't render the QR.)
- `tn` (transaction note) — the `invoice.number` (e.g. `INV-2026-0042`), URL-encoded.

The deep-link is built by a small helper (`buildUpiDeepLink`) — pure function, easy to unit test. It uses `encodeURIComponent` for `pa`, `pn`, and `tn` values.

**Why not include `tr` (transaction reference)?** `tr` is intended for end-to-end reference IDs that the payee can reconcile against. `tn` already serves that purpose for a manual invoice flow. Adding `tr` doesn't change UX. Skip.

### Decision 3: Gating — when NOT to render the QR

The QR renders **only** when **all** three hold:

1. `template?.footer?.upiId` is a non-empty string.
2. `invoice.currency === 'INR'` (UPI is INR-only).
3. `invoice.status !== 'paid'` (a paid invoice's locked-amount QR would prompt a duplicate payment).

If any of those fails, no QR area is rendered — no caption, no white space — so the existing Bank Details column looks exactly like today's PDF. This preserves byte-identity for the empty-profile case carved out by the prior `invoice-branding` change and avoids surprising tenants who issue USD invoices.

**Trade-off**: an admin who configures UPI and then changes the invoice currency to non-INR sees the UPI ID printed (text) but no QR. That's intentional and matches the underlying reality (UPI only pays INR).

### Decision 4: Placement — under Bank Details in the left footer column

The footer band already has two columns: Bank Details (left) and Signature (right). The QR slots in as the last entry of the Bank Details column:

```
+--------------------------------+--------------------------+
| Bank Details                   |                          |
| Account Name: …                |                          |
| Bank: …                        |        (signature        |
| Account No.: …                 |          block)          |
| IFSC: …                        |                          |
| Branch: …                      |                          |
| UPI: acme@hdfcbank             |                          |
|                                |                          |
|    [Scan to pay]               |                          |
|    +-------------+             |                          |
|    |             |             |                          |
|    |    QR       |             |                          |
|    |             |             |                          |
|    +-------------+             |                          |
+--------------------------------+--------------------------+
```

Dimensions:

- QR image: **72 × 72 pt** (~25 mm at 72 DPI — comfortably scannable from screen-pixel-density phones at a typical reading distance).
- Caption: `Scan to pay` in 7 pt bold, 4 pt top margin between the bank text and the caption.
- The QR sits below the caption, left-aligned to match the bank field labels.

**Why not a third column** (Bank | QR | Signature)? Each invoice copy is only ~268 pt wide. Splitting into three columns leaves ~80 pt for each, which is too narrow for any of them. Keeping the QR inside the Bank Details column preserves readability.

### Decision 5: PDF rendering is async to accommodate the QR generation

`qrcode.toDataURL(...)` returns a Promise. `pdf.service.ts`'s `generateInvoicePdf` is already `async`, so we await the QR before building the pdfmake document definition. The flow becomes:

1. Dynamically import `pdfmake`, `vfs_fonts`, and (conditionally) `qrcode`.
2. If the gating conditions are met, generate the QR data URL.
3. Call `buildInvoiceDocDefinition(invoice, company, template, qrDataUrl)`.
4. Trigger the download.

The `buildInvoiceDocDefinition` and `buildInvoiceCopy` functions get a new optional `qrDataUrl: string | null` argument threaded through. When the argument is null/undefined, the footer band renders today's content unchanged.

### Decision 6: QR error-correction level — `M` (medium)

`qrcode` defaults to level `M` (~15% data recovery). That's right for an invoice PDF: small enough to keep the QR dense (faster scan) but resilient to the typical print smudge / small logo dust. We do not override the default.

### Decision 7: Amount formatting — plain decimal, no symbol, no grouping

UPI's `am` parameter is a number in plain decimal form. Examples: `1227`, `1227.50`, `0.99`. The current `getDisplayTotal(invoice)` returns a `number`; we format it with `(n).toFixed(2)` and strip a trailing `.00` to keep the QR payload compact. We do not include the currency symbol or thousands-separator grouping — both would be encoded literally and most UPI apps treat them as invalid.

## Risks / Trade-offs

- [**QR encodes a payable URL — printed in plain sight**] → That is the point of an invoice QR. The QR encodes only public-by-design data (the VPA already prints on the bill; the invoice number and total are already on the bill). No new information is leaked.
- [**An admin can typo the UPI ID and the QR will still scan to a wrong VPA**] → We trust admin input. The user's UPI app shows the resolved merchant name when the VPA is scanned; the payer can refuse to proceed if it looks wrong. Adding a server-side VPA validator is deferred.
- [**Library is ~30 KB**] → Acceptable; lazy-loaded, so the cost is paid only by users downloading PDFs.
- [**Locked-amount QR is dangerous on a partially-paid invoice**] → We don't track partial payments today; any "paid" invoice suppresses the QR (Decision 3.3). Future partial-payment work would need to revisit this.
- [**QR-image bytes embedded base64 in the PDF inflate file size**] → A 72-pt QR is ~3 KB base64; trivial.

## Migration Plan

Pure rendering change. No data migration.

**Deploy:**

1. `npm install` — `package.json` now lists `qrcode`. CI/operator must reinstall.
2. `npm run build` — verify the lazy chunk is created and the initial bundle is unchanged in size.
3. `npm run deploy:hosting`.

No rules or function deploy required.

**Rollback:** `firebase hosting:rollback`. The QR library file in `node_modules` is harmless if left behind.

## Open Questions

- **Should we honour a `Pa: name` (case-mixed) variant** if the admin types a UPI ID that contains uppercase characters? Currently UPI is case-insensitive on the `pa` part; we'll pass through the admin's entry verbatim. Defer normalisation.
- **Should we ever encode a `purpose-code` field (UPI 2.0 attribute)?** Out of scope.
- **Should we expose the deep-link as plain text under the QR for users on a device that can't scan?** Considered. The current invoice already shows the UPI ID textually above the QR, which is a usable fallback. We do not duplicate the full deep-link as text — it would clutter the copy.
