## 1. Data model & service

- [x] 1.1 Add a TypeScript interface `InvoiceTemplate` in `src/app/core/models/invoice-template.ts` with nested `header`, `footer`, `signature` sections plus top-level `termsAndConditions`, `disclaimer`, `updatedAt`, `updatedBy` — all fields optional. Re-export from `src/app/core/models/index.ts`.
- [x] 1.2 Build a `CompanyProfileService` in `src/app/core/services/company-profile.service.ts` that:
  - Reads `/companies/{cid}/private/invoice-template` once per session via `getOrLoad()`, caches the result as a signal, and returns the empty template (`{ header:{}, footer:{}, signature:{} }`) when the doc does not exist.
  - Exposes `save(template: InvoiceTemplate)` that writes the doc (using `setDoc({ ...template, updatedAt: serverTimestamp(), updatedBy: <uid> }, { merge: false })`) and invalidates the in-memory cache.
  - Exposes `invalidate()` so the editor can force a re-read after concurrent edits.
  - Strips blank-string fields before writing so the persisted document does not store empty strings (use `null` or omit).

## 2. Routes & navigation

- [x] 2.1 Add the `/app/profile` route under the existing tenant shell in `src/app/app.routes.ts`, guarded by `authGuard` and `roleGuard(['company-admin'])`, lazy-loading a new `ProfileComponent`.
- [x] 2.2 Add a `Profile` link to the side navigation in `src/app/features/shell/shell.component.ts`, inside the existing `@if (isAdmin())` block so non-admins do not see it.

## 3. Profile editor page

- [x] 3.1 Scaffold `src/app/features/profile/profile.component.ts` as a standalone Angular component using a reactive form with three logical sections: Header info, Footer / Payment info, Signature & Disclaimer.
- [x] 3.2 Wire `profileForm.patchValue(...)` from `CompanyProfileService.getOrLoad()` on init so saved values pre-populate.
- [x] 3.3 Implement client-side validators:
  - email format on `header.email` (only when non-empty)
  - URL format on `header.website` (auto-prepend `https://` on save if user typed bare host)
  - GSTIN regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$` (only when non-empty)
  - PAN regex `^[A-Z]{5}[0-9]{4}[A-Z]{1}$` (only when non-empty)
  - IFSC regex `^[A-Z]{4}0[A-Z0-9]{6}$` (only when non-empty)
  - `accountNumber` digits-only, 6–18 characters (only when non-empty)
  - `maxLength(2000)` on `termsAndConditions` and `disclaimer`
- [x] 3.4 Render inline per-field error messages using the same touched/dirty pattern as the super-admin Companies form (`showError(control)` helper), so a disabled Save button is never the only signal of invalidity.
- [x] 3.5 Auto-uppercase the GSTIN, PAN, and IFSC inputs on every keystroke (mirrors the auto-uppercase pattern used for currency on the Companies form).
- [x] 3.6 Implement the address-lines editor as a `FormArray<FormControl<string>>` with "+ Add address line" / "Remove" buttons so the admin can build a multi-line address without typing literal `\n`.
- [x] 3.7 Implement `Save` that calls `CompanyProfileService.save(...)` after stripping blanks; surfaces success and error states clearly.
- [x] 3.8 Show an "(Optional)" / placeholder hint on every field so the admin understands all fields are optional.

## 4. PDF generator integration

- [x] 4.1 Update `PdfService.generateInvoicePdf` in `src/app/core/services/pdf.service.ts` to accept a third argument `template: InvoiceTemplate | null`, defaulting to `null`. Treat `null` and an empty template as identical.
- [x] 4.2 Inside the per-copy renderer (the function that returns the content stack for one of the two side-by-side copies), insert the new bands in this order: (a) **Header band** just after the company-name line and before the existing invoice-header row; (b) the existing bill-to / line-items / totals / amount-in-words; (c) **Footer band**; (d) **Signature block**; (e) **Disclaimer**. Each new band MUST return a zero-height stack when its underlying template fields are empty.
- [x] 4.3 Implement `renderHeaderBand(template)` as a small pure helper that returns a pdfmake `stack` containing only the lines whose fields are populated. Tax-ID line (`GSTIN: … · PAN: … · CIN: …`) MUST drop any absent identifiers and their separator.
- [x] 4.4 Implement `renderFooterBand(template)` as a pdfmake `columns` with two columns (Bank Details left, Terms & Conditions right). Each column's contents MUST be empty when its underlying fields are blank. When BOTH columns are empty, return an empty stack (so the band is fully omitted).
- [x] 4.5 Implement `renderSignatureBlock(template, company)` returning a stack containing `For <company.name>`, a ~36pt vertical gap, the signatory name (only if set), and the signatory title (or `Authorized Signatory` if unset). Anchor the block to the right side of its column.
- [x] 4.6 Implement `renderDisclaimer(template)` returning a small italic (~7pt) text node spanning the full copy width when `template.disclaimer` is set; otherwise an empty stack.
- [x] 4.7 Update all callers of `PdfService.generateInvoicePdf` — currently only the invoice-detail page's "Download PDF" handler — to fetch the profile via `CompanyProfileService.getOrLoad()` before calling the generator, and pass the result through. Show a spinner / disabled state during the download just like today.

## 5. Rules tests

- [x] 5.1 Add a `describe('invoice-template profile doc')` block to `firestore-rules-tests/test/rules.test.ts` covering:
  - admin in tenant A CAN read and write `/companies/A/private/invoice-template`;
  - admin in tenant A CANNOT read `/companies/B/private/invoice-template`;
  - non-admin in tenant A CANNOT read or write the template doc;
  - unauthenticated client CANNOT read the template doc.

## 6. Smoke test update

- [x] 6.1 Add a step in `docs/smoke-test.md` between the existing "company admin path" and the "non-admin path" titled "Configure invoice profile" that walks: sign in as admin → open `/app/profile` → fill the three sections (with sample Indian-style data) → Save → return to invoice detail → Download PDF → verify the configured header lines, bank details, signature, and disclaimer appear in BOTH copies of the PDF.
- [x] 6.2 Append a paragraph to the step instructing the operator to also verify that the legacy invoice from earlier in the smoke test (created before the profile was populated) now reflects the newly saved template when re-downloaded — proves the cache-invalidation path works.

## 7. Documentation

- [x] 7.1 Update the repo `README.md` "Roles & data isolation" or features list to mention that company admins can configure an invoice template under `/app/profile`. Keep the addition under 5 lines.
- [x] 7.2 Add a short subsection or note in the README listing the explicit non-goals from `proposal.md` (no image uploads yet, single template per company, PDF-only — not on-screen) so future contributors don't redo the analysis.

## 8. Build & verify

- [x] 8.1 `npm run build` — must complete with no errors and no new warnings.
- [ ] 8.2 `npm run test:rules` — the new profile-doc rules tests must pass. _**Owner action**: requires `npx firebase emulators:exec` (Java + Firebase CLI) on a workstation. Test code authored at [firestore-rules-tests/test/rules.test.ts](../../../firestore-rules-tests/test/rules.test.ts) — search for `describe('invoice-template profile doc'`._
- [ ] 8.3 Manually walk the updated smoke test against the running emulator suite, including the "re-download legacy invoice after profile save" step. _**Owner action**: see [docs/smoke-test.md](../../../docs/smoke-test.md) step 3a + the new bullets in step 5._
