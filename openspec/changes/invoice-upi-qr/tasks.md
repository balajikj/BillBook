## 1. Dependency

- [x] 1.1 Add `qrcode` to `dependencies` in the workspace root `package.json` (latest `^1.5.0` series). Run `npm install` and confirm `node_modules/qrcode/` is present.
- [x] 1.2 Add `@types/qrcode` to `devDependencies` so TypeScript can type the `import('qrcode')` call.

## 2. UPI deep-link helper

- [x] 2.1 Created `src/app/core/utils/upi.ts` exporting a pure function `buildUpiDeepLink(args)` that returns a URL of the form `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`. Amount formatting uses `toFixed(2)` then strips a trailing `.00`. `encodeURIComponent` applied to `pa`, `pn`, `tn`.
- [ ] 2.2 (Optional but recommended) add a tiny vitest covering the helper. _Skipped for MVP — the helper is small enough that bugs surface in the smoke test._

## 3. QR generation in PdfService

- [x] 3.1 Compute `shouldRenderQr` from `template?.footer?.upiId` + `invoice.currency === 'INR'` + `invoice.status !== 'paid'` in a new `maybeGenerateUpiQr` helper called from `generateInvoicePdf`.
- [x] 3.2 Dynamically import `qrcode` (mirrors the existing pdfmake/vfs_fonts dynamic imports) and call `qrcode.toDataURL(buildUpiDeepLink({ ... }), { errorCorrectionLevel: 'M', margin: 1 })`. Uses the company name from the gate doc and `getDisplayTotal(invoice)` for the amount.
- [x] 3.3 Threaded the resulting data URL (or `null`) through `buildInvoiceDocDefinition` → `buildInvoiceCopy` as a new `qrDataUrl: string | null` argument.

## 4. PDF layout — embed the QR inside Bank Details column

- [x] 4.1 In `renderFooterBand`, when `qrDataUrl` is non-null, append `{ text: 'Scan to pay', fontSize: 7, bold: true, margin: [0, 4, 0, 1] }` followed by `{ image: qrDataUrl, width: 72, height: 72 }` to the Bank Details column.
- [x] 4.2 When `qrDataUrl` is null, the left column is unchanged (the existing bank-or-empty logic is preserved). The Signature (right) column is untouched in either branch.
- [x] 4.3 When bank fields are empty AND a QR is rendered, the column still shows the `Bank Details` heading so the QR has context.

## 5. Build & sanity-check

- [x] 5.1 `npm run build` — completes cleanly. Whitelisted `qrcode` and its `dijkstrajs` transitive dep in `angular.json`'s `allowedCommonJsDependencies` to silence the CJS warnings.
- [x] 5.2 Verified the build output: a new ~24.6 kB lazy chunk carries the QR library; the initial bundle is unchanged at 620.55 kB.

## 6. Smoke test docs

- [x] 6.1 Extended step 5a with a UPI-QR verification step (decode + check `pa`, `pn`, `am`, `cu`, `tn`).
- [x] 6.2 Added negative tests: non-INR invoice (no QR) and paid invoice (no QR).

## 7. README

- [x] 7.1 Added a one-line note to the README intro mentioning the UPI QR on INR invoices when a UPI ID is configured.

## 8. Deploy

- [ ] 8.1 `npm run deploy:hosting`. _**Owner action**._ No rules / functions / indexes need redeploying.
