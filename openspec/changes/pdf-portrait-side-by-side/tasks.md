## 1. Flip orientation and rewrite document assembly

- [ ] 1.1 In [src/app/core/services/pdf.service.ts](src/app/core/services/pdf.service.ts), set `pageOrientation: 'portrait'` (replacing `'landscape'`) on the document definition returned by `buildInvoiceDocDefinition`.
- [ ] 1.2 Replace the existing top-bottom `content` assembly `[...buildInvoiceCopy(...), separator(), ...buildInvoiceCopy(...)]` with a single top-level `columns` element: `{ columns: [ { stack: buildInvoiceCopy(inv, co, 'ORIGINAL FOR RECIPIENT'), width: '*' }, { stack: [verticalSeparator()], width: 'auto' }, { stack: buildInvoiceCopy(inv, co, 'DUPLICATE FOR SUPPLIER'), width: '*' } ], columnGap: 6 }`.
- [ ] 1.3 Update the page-geometry constants at the top of the file: change `SEPARATOR_LINE_WIDTH` to refer to `y2` for the vertical line (rename to `SEPARATOR_LINE_HEIGHT` if helpful; set to ~800pt — the available vertical content area on portrait A4 with the tight 18pt top/bottom margins).
- [ ] 1.4 Implement a new `verticalSeparator()` helper that returns `{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 0, y2: SEPARATOR_LINE_HEIGHT, lineWidth: 0.5, lineColor: '#888', dash: { length: 4, space: 3 } }] }`. Remove the existing horizontal `separator()` helper (or leave it dead if you prefer; delete is cleaner).

## 2. Re-flow the per-copy header

- [ ] 2.1 In `buildInvoiceCopy`, replace the `columns: [billTo, [dates]]` block with a single-column stack: push the `billTo` array's entries directly into `content`, then push three right-aligned text entries for `Invoice date: …`, `Due date: …`, `Status: …` (the Status line stays bold).
- [ ] 2.2 Verify visually (mental model only — actual rendering is later in task 5) that the header now reads top-to-bottom: Bill to → customer → shop → address → GSTIN → phone → email → invoice date → due date → status.

## 3. Re-balance per-copy table widths

- [ ] 3.1 Update the line items `tableWidths` constant inside `buildInvoiceCopy`: `hasHsnColumn ? ['*', 36, 22, 44, 56] : ['*', 22, 44, 56]`.
- [ ] 3.2 Change the totals-block `width` from `240` to `'auto'` and the totals table `widths` from `['*', 'auto']` to `['auto', 'auto']`.
- [ ] 3.3 Confirm the totals block remains right-aligned within the copy (kept inside `{ columns: [ { text: '' }, { width: 'auto', table: ... } ] }`).

## 4. Update tests

- [ ] 4.1 In [src/app/core/services/pdf.service.spec.ts](src/app/core/services/pdf.service.spec.ts), rename the `'two-up landscape layout'` describe block to `'two-up portrait side-by-side layout'`.
- [ ] 4.2 Replace the orientation assertion: `def.pageOrientation` is either `'portrait'` or `undefined`; never `'landscape'`.
- [ ] 4.3 Remove the assertion that the cut-line label string `Cut along the dashed line` appears once. The vertical separator has no text label.
- [ ] 4.4 Replace the existing dashed-line-width assertion (`"x2":794`) with: the rendered content includes a canvas element whose stringified form contains `"x1":0` AND `"x2":0` AND `"y2":` followed by a number `>= 700` (vertical line). Implement this by parsing the stringified content and asserting on the matched substring shape.
- [ ] 4.5 Add an assertion that the top-level content has exactly one `columns` element containing three sub-columns (the two copy stacks and the separator stack).
- [ ] 4.6 Update the existing within-copy assertions to confirm the bill-to+dates re-flow: the customer's GSTIN string appears in the rendered content before the `Invoice date:` string (within each copy's content), confirming the stacked header order.
- [ ] 4.7 Keep all existing content-duplication assertions unchanged (invoice number twice, GSTIN twice, CGST twice, SGST twice, Grand Total twice, amount-in-words twice).
- [ ] 4.8 Run `npx vitest run src/app/core/services/pdf.service.spec.ts` — expect green.
- [ ] 4.9 Run the full core test suite (`npx vitest run src/app/core`) — expect green.

## 5. Visual verification

- [ ] 5.1 `npm start` against the emulator, navigate to a sample India-GST invoice's detail page, click **Download PDF**. Verify: portrait A4 page; two copies side-by-side; vertical dashed cut line down the center; all fields legible at 8pt; no overflow onto a second page; bill-to and dates render as a single stacked column inside each copy. _**User action.**_
- [ ] 5.2 Repeat against a legacy invoice (no GST). Verify both copies render with the legacy single-Total totals block. _**User action.**_
- [ ] 5.3 (Optional) Flip `SHOW_COPY_LABELS = true`, regenerate, confirm `ORIGINAL FOR RECIPIENT` / `DUPLICATE FOR SUPPLIER` badges appear at the top-right of each copy without overlapping the column gap. Flip back to `false` before deploy. _**User action.**_

## 6. Documentation

- [ ] 6.1 In [docs/smoke-test.md](docs/smoke-test.md) step 5a, replace the previous "landscape A4 with two identical copies on a single page, separated by a dashed cut line" verification line with: "Confirm the PDF is **portrait** A4 with two identical copies arranged **side-by-side** (left half + right half) on a single page, separated by a **vertical** dashed cut line down the center."

## 7. Build & deploy

- [ ] 7.1 `npx ng build --configuration=production` — expect clean build.
- [ ] 7.2 `npm run deploy:hosting` — push the updated SPA. No rules / index changes in this change. _**User action.**_
- [ ] 7.3 Hard-refresh production app, download a real invoice PDF, confirm portrait + side-by-side layout. _**User action.**_

## 8. Archive

- [ ] 8.1 Once visual verification passes in production, run `npx openspec archive pdf-portrait-side-by-side` to merge the deltas into `openspec/specs/`. _**User action.**_
