## 1. Refactor PDF generation into a per-copy block builder

- [x] 1.1 In [src/app/core/services/pdf.service.ts](src/app/core/services/pdf.service.ts), extract the invoice-rendering content (company header, bill-to block, line items table, totals block, amount-in-words footer) out of `buildInvoiceDocDefinition` into a new private helper `buildInvoiceCopy(invoice, company): Content[]` that returns the pdfmake content array for **one** copy.
- [x] 1.2 Add a top-of-file constant `SHOW_COPY_LABELS: boolean = false`. When `true`, each copy's content array includes a small label badge (`ORIGINAL FOR RECIPIENT` on the upper copy, `DUPLICATE FOR SUPPLIER` on the lower copy) at top-right; when `false` (default), no label is rendered.
- [x] 1.3 Update `buildInvoiceCopy` to accept an optional `copyLabel?: string` argument that is rendered (only when `SHOW_COPY_LABELS` is `true`) as a small right-aligned 8pt label at the very top of the copy's content.

## 2. Assemble the two-up landscape document

- [x] 2.1 Update `buildInvoiceDocDefinition` to set `pageOrientation: 'landscape'`, `pageSize: 'A4'`, and `pageMargins: [24, 18, 24, 18]`.
- [x] 2.2 Build the `content` array as: `[...buildInvoiceCopy(inv, co, 'ORIGINAL FOR RECIPIENT'), separator(), ...buildInvoiceCopy(inv, co, 'DUPLICATE FOR SUPPLIER')]`.
- [x] 2.3 Implement the `separator()` helper that returns a stack containing (a) a `canvas` element drawing a dashed horizontal line from x=0 to x=794, lineWidth 0.5, color `#888`, with `dash: { length: 4, space: 3 }`; (b) a centered text label `'✂ Cut along the dashed line'` at 7pt, color `#888`, with small vertical margin above.

## 3. Tighten typography and table layouts

- [x] 3.1 Set `defaultStyle: { fontSize: 8 }` on the document definition (was 10).
- [x] 3.2 Update the `styles` map: `companyHeader: { fontSize: 13, bold: true }` (was 16), `invoiceHeader: { fontSize: 11, margin: [0, 4, 0, 0] }` (was 14), `footer: { fontSize: 7, color: '#888', margin: [0, 4, 0, 0] }` (was 8 and `margin: [0, 24, 0, 0]`).
- [x] 3.3 Tighten the per-section vertical margins inside `buildInvoiceCopy` so each copy comfortably fits the available ~270pt vertical budget (e.g. reduce `margin: [0, 16, 0, 0]` on the table to `[0, 6, 0, 0]`; reduce `margin: [0, 10, 0, 0]` on the totals block to `[0, 4, 0, 0]`; reduce `margin: [0, 8, 0, 0]` on the amount-in-words line to `[0, 4, 0, 0]`).
- [x] 3.4 Re-balance the line items table column widths for landscape proportions. The available content width is `842 − 24 − 24 = 794`. Use widths roughly `[*, 60, 36, 70, 80]` when the HSN/SAC column is present, `[*, 36, 70, 80]` otherwise — same shape as today but with the description column flexing wider in landscape.

## 4. Update tests

- [x] 4.1 In [src/app/core/services/pdf.service.spec.ts](src/app/core/services/pdf.service.spec.ts), add a new `describe` block "two-up landscape layout" with assertions:
  - `def.pageOrientation === 'landscape'`
  - `def.pageSize === 'A4'`
  - `def.pageMargins` equals `[24, 18, 24, 18]`
  - `def.defaultStyle?.fontSize === 8`
  - `(def.styles?.companyHeader as any)?.fontSize === 13`
  - `(def.styles?.invoiceHeader as any)?.fontSize === 11`
  - The stringified content includes the invoice number string exactly **twice** (one count per copy).
  - The stringified content includes `'Cut along the dashed line'` exactly **once** (one separator between two copies).
- [x] 4.2 Update the existing India-invoice spec to assert that CGST/SGST/Grand-Total/Amount-in-words appear **twice** (once per copy), and that the legacy-invoice spec asserts `Total` appears twice.
- [x] 4.3 Run `npx vitest run src/app/core/services/pdf.service.spec.ts` — expect green. _Result: 31 tests pass, full core suite is 95/95 green._

## 5. Visual verification

- [ ] 5.1 Start `npm start` against the emulator, navigate to a sample India-GST invoice's detail page, click **Download PDF**. Open the file and verify: landscape A4 page; two copies stacked vertically; cut-line label centered; all fields legible at the new 8pt body size; no overflow onto a second page. _**User action.**_
- [ ] 5.2 Repeat against a legacy invoice (no GST). Verify both copies render with single Total row and no Amount-in-words footer. _**User action.**_
- [ ] 5.3 (Optional) Temporarily flip `SHOW_COPY_LABELS = true`, regenerate, and visually confirm the badges appear correctly on each copy. Flip back to `false` before commit. _**User action.**_

## 6. Documentation

- [x] 6.1 In [docs/smoke-test.md](docs/smoke-test.md), append a verification line to step 5a: "Confirm the PDF is landscape A4 with two identical copies on a single page, separated by a dashed cut line."

## 7. Build & deploy verification

- [x] 7.1 Run `npx ng build --configuration=production` — expect a clean build (no errors). _Result: clean build in 9s._
- [ ] 7.2 Deploy hosting only: `npm run deploy:hosting` (no rules/index changes in this change). _**User action.**_
- [ ] 7.3 Hard-refresh the production app, download a real invoice's PDF, confirm landscape + two-up. _**User action.**_

## 8. Archive

- [ ] 8.1 Once the visual smoke verification passes in production, run `openspec archive pdf-two-copies-landscape` to merge the deltas into `openspec/specs/`. _**User action** (after step 7.3 passes)._
