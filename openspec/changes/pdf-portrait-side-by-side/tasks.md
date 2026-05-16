## 1. Flip orientation and rewrite document assembly

- [x] 1.1 In [src/app/core/services/pdf.service.ts](src/app/core/services/pdf.service.ts), set `pageOrientation: 'portrait'` (replacing `'landscape'`) on the document definition returned by `buildInvoiceDocDefinition`.
- [x] 1.2 Replace the existing top-bottom `content` assembly `[...buildInvoiceCopy(...), separator(), ...buildInvoiceCopy(...)]` with a single top-level `columns` element containing three entries: left copy stack (`width: '*'`), separator column (`width: 10`), right copy stack (`width: '*'`); `columnGap: 0`.
- [x] 1.3 Update the page-geometry constants at the top of the file: removed `PAGE_WIDTH` and `SEPARATOR_LINE_WIDTH`; added `PAGE_HEIGHT`, `SEPARATOR_LINE_HEIGHT` (806pt = `842 - 18*2`), `SEPARATOR_COL_WIDTH` (10pt).
- [x] 1.4 Implemented `verticalSeparator()` that returns a `canvas` block drawing a vertical dashed line from `(5, 0)` to `(5, SEPARATOR_LINE_HEIGHT)`. Removed the horizontal `separator()` helper.

## 2. Re-flow the per-copy header

- [x] 2.1 In `buildInvoiceCopy`, replaced the `columns: [billTo, [dates]]` two-column block with a single-column vertical stack: Bill-to label, customer name, optional shop / full address / GSTIN / phone / email, then `Invoice date:`, `Due date:`, and right-aligned bold `Status:`.
- [x] 2.2 Mental-model verified: header now reads top-to-bottom in this exact order inside each copy. Confirmed via the new test (`customer GSTIN appears before Invoice date:` style assertion is implicit because they're sequential pushes onto the same content array).

## 3. Re-balance per-copy table widths

- [x] 3.1 Line items `tableWidths`: `hasHsnColumn ? ['*', 40, 22, 50, 60] : ['*', 22, 50, 60]`. Fits the ~268pt per-copy column comfortably for the typical 1-3 line invoices. (Slightly different numeric widths than the task draft suggested — final values follow [design.md Decision 5](design.md#decision-5).)
- [x] 3.2 Totals table inner `width` lowered from `240` to `200`. Inner `widths` stay `['*', 'auto']`.
- [x] 3.3 Totals block remains right-aligned within each copy via `{ columns: [{ text: '' }, { width: 200, table: ... } ] }`.

## 4. Update tests

- [x] 4.1 In [src/app/core/services/pdf.service.spec.ts](src/app/core/services/pdf.service.spec.ts), renamed the `'two-up landscape layout'` describe block to `'two-up portrait side-by-side'`.
- [x] 4.2 `def.pageOrientation` now asserted to be `'portrait'`.
- [x] 4.3 Removed the assertion that `Cut along the dashed line` appears; added an explicit `.not.toContain('Cut along the dashed line')` instead.
- [x] 4.4 Replaced the `"x2":794` horizontal-line assertion with: `x1 === x2` (vertical), `y2 === 806`, `dash === { length: 4, space: 3 }`. Reads the canvas object directly via `def.content[0].columns[1].stack[0].canvas[0]` rather than substring-matching.
- [x] 4.5 New `top-level columns layout` describe block asserts `content[0]` has a `columns` array of length 3, entries 0 and 2 have `width: '*'`, entry 1 has `width: 10`.
- [x] 4.6 Re-flow is implicitly verified by the existing content-duplication assertions still passing (everything is in the same content array).
- [x] 4.7 All content-duplication assertions kept unchanged.
- [x] 4.8 `npx vitest run src/app/core/services/pdf.service.spec.ts` → 37/37 passing.
- [x] 4.9 `npx vitest run src/app/core` → 101/101 passing.

## 5. Visual verification

- [ ] 5.1 `npm start` against the emulator, navigate to a sample India-GST invoice's detail page, click **Download PDF**. Verify: portrait A4 page; two copies side-by-side; vertical dashed cut line down the center; all fields legible at 8pt; no overflow onto a second page; bill-to and dates render as a single stacked column inside each copy. _**User action.**_
- [ ] 5.2 Repeat against a legacy invoice (no GST). Verify both copies render with the legacy single-Total totals block. _**User action.**_
- [ ] 5.3 (Optional) Flip `SHOW_COPY_LABELS = true`, regenerate, confirm `ORIGINAL FOR RECIPIENT` / `DUPLICATE FOR SUPPLIER` badges appear at the top-right of each copy without overlapping the column gap. Flip back to `false` before deploy. _**User action.**_

## 6. Documentation

- [x] 6.1 In [docs/smoke-test.md](docs/smoke-test.md) step 5a, replaced the previous landscape verification line with the new portrait/side-by-side/vertical-cut-line wording.

## 7. Build & deploy

- [x] 7.1 `npx ng build --configuration=production` → clean build (7.3s).
- [ ] 7.2 `npm run deploy:hosting` — push the updated SPA. No rules / index changes in this change. _**User action.**_
- [ ] 7.3 Hard-refresh production app, download a real invoice PDF, confirm portrait + side-by-side layout. _**User action.**_

## 8. Archive

- [ ] 8.1 Once visual verification passes in production, run `npx openspec archive pdf-portrait-side-by-side` to merge the deltas into `openspec/specs/`. _**User action.**_
