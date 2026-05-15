## 1. Shared utilities & validators

- [ ] 1.1 Create `src/app/core/validators/gst.ts` exporting `GSTIN_PATTERN`, `HSN_PATTERN`, `PHONE_PATTERN`, `GST_PERCENT_RANGE` constants and corresponding Angular `ValidatorFn` factories (e.g. `gstinValidator()`, `hsnValidator()`, `phoneValidator()`).
- [ ] 1.2 Add a `vitest` suite at `src/app/core/validators/gst.spec.ts` covering: valid 15-char GSTIN, invalid 14-char GSTIN, valid 4- and 8-digit HSN, invalid 3-digit and alpha-mixed HSN, valid `+91`-prefixed and bare 10-digit phones, invalid 5-digit phone, empty inputs (all three should pass since fields are optional).
- [ ] 1.3 Create `src/app/core/utils/invoice-math.ts` exporting `computeCgstSgst(subtotal, gstPercent): {cgst, sgst}`, `computeGrandTotal(subtotal, cgst, sgst, otherCharges, roundOff): number`, and a `roundMoney(value): number` (two-decimal, half-to-even). Pure functions, no dependencies on Angular.
- [ ] 1.4 Add `src/app/core/utils/invoice-math.spec.ts` covering: 18% GST on ₹1000, 0% GST, fractional rounding (e.g. ₹333.33 × 18%), negative `roundOff`, zero `otherCharges` and `roundOff`.
- [ ] 1.5 Create `src/app/core/utils/number-to-words.ts` exporting `numberToWords(amount, currency): string`. Supports Indian numbering when `currency === 'INR'` (Rupees / Paise, Lakh / Crore) and short-scale otherwise (Dollars / Cents or generic for unrecognised currencies). Always terminates with `Only.`
- [ ] 1.6 Add `src/app/core/utils/number-to-words.spec.ts` covering: `0`, `1`, `99`, `100`, `1000`, `100000` (one lakh, INR), `10000000` (one crore, INR), `1234.56` with `INR` (paise), `1234.56` with `USD` (cents), negative amounts (define and test behaviour — probably reject or treat as absolute with a `Minus` prefix).

## 2. Domain model extensions

- [ ] 2.1 Extend `src/app/core/models/customer.ts`: add optional `phoneNumber`, `shopName`, `fullAddress`, `gstNumber` (all `string | undefined`) to `Customer`. Add the same four fields to `CustomerSnapshot` (also optional / nullable).
- [ ] 2.2 Extend `src/app/core/models/product.ts`: add optional `hsnSac` to `Product`.
- [ ] 2.3 Extend `src/app/core/models/invoice.ts`:
  - Add optional `gstPercent: number | null`, `cgstAmount: number | null`, `sgstAmount: number | null`, `otherCharges: number | null`, `roundOff: number | null`, `grandTotal: number | null` to `Invoice`.
  - Add optional `hsnSac: string | null` to `InvoiceLineItem`.
  - Keep `subtotal` and `total` unchanged for back-compat.
- [ ] 2.4 Add an exported helper `getDisplayTotal(invoice): number` that returns `invoice.grandTotal ?? invoice.total` so the rest of the UI has a single source of truth for "the final amount".

## 3. Customer management UI & service

- [ ] 3.1 Update the customer create/edit form (under `src/app/features/customers/`) to add four new optional fields: Phone Number, Shop Name, Full Address, GST Number. Wire `phoneValidator` and `gstinValidator` from step 1.1. Display inline `field-error` messages on touch when invalid.
- [ ] 3.2 Update `CustomerService.create()` and `update()` to write the four new fields. Treat empty strings as absent (omit from the Firestore document) to keep the schema clean.
- [ ] 3.3 Update the customer list page to show GSTIN (if present) and Phone (if present) as additional columns; keep the columns hidden when no customer in the list has those fields populated.
- [ ] 3.4 Add a Firestore-rules-tests case at `firestore-rules-tests/test/rules.test.ts` confirming that the new fields are writable by a company-admin within their tenant and unreadable cross-tenant (sanity — rules already cover the parent path, the test pins the new fields).

## 4. Product management UI & service

- [ ] 4.1 Update the product create/edit form to add an optional `hsnSac` field with `hsnValidator`. Display inline error on touch when invalid.
- [ ] 4.2 Update `ProductService.create()` and `update()` to write `hsnSac`. Treat empty string as absent.
- [ ] 4.3 Update the product list page to show an `HSN/SAC` column; hide it when no product in the list has the field populated.

## 5. Invoice form: header auto-populate + GST/charges/round-off block

- [ ] 5.1 In the invoice form, when a customer is picked, render a read-only "Bill To" card showing `name`, `shopName`, `fullAddress`, `gstNumber`, `phoneNumber` (omitting missing lines). Add an inline hint "GSTIN not set on this customer — edit the customer record to add one" when `gstNumber` is missing.
- [ ] 5.2 In the line-item editor, on product pick, populate `description`, `hsnSac`, and `unitPrice` from the product onto the line. Allow the user to override any of them before save. Show `hsnSac` as an editable text field with `hsnValidator`.
- [ ] 5.3 Below the line items, add a new "Tax & Charges" section with four inputs: GST % (numeric 0–50), Other Charges (non-negative numeric), Round Off (signed numeric). Display computed CGST and SGST as read-only labels right next to the GST % input. All three update live on change.
- [ ] 5.4 Below the Tax & Charges section, add a "Grand Total" panel showing the computed `grandTotal` formatted in the invoice's currency, plus the in-words rendering from `numberToWords()` below it. Both update live.
- [ ] 5.5 Add form validation: GST % out of `[0, 50]` blocks submission; negative Other Charges blocks submission. Round Off may be negative. Empty GST % is treated as `0` (no GST).

## 6. Invoice service & creation transaction

- [ ] 6.1 Update `InvoiceService.create()` to:
  - Compute `cgstAmount`, `sgstAmount` via `computeCgstSgst`.
  - Compute `grandTotal` via `computeGrandTotal`.
  - Persist all six new fields (`gstPercent`, `cgstAmount`, `sgstAmount`, `otherCharges`, `roundOff`, `grandTotal`) plus snapshot the extended customer fields onto `CustomerSnapshot` and the extended product fields onto each `InvoiceLineItem`.
  - Keep the existing transactional counter logic unchanged.
- [ ] 6.2 Update `InvoiceService.update()` (status changes only today — `markAsPaid`/`revertToPending`) to leave the new totals fields untouched.
- [ ] 6.3 Add unit tests for the service updates: vitest spec verifying the persisted doc shape for a sample invoice with GST 18% and other charges; legacy invoice without GST still persists subtotal + total only.

## 7. Invoice detail page rendering

- [ ] 7.1 Update the invoice detail page to render the full breakdown when `gstPercent` or `otherCharges` or `roundOff` is present: rows for Subtotal, CGST (X%), SGST (X%), Other Charges (if non-zero), Round Off (if non-zero), Grand Total.
- [ ] 7.2 Display the Grand Total in words beneath the breakdown when `grandTotal` is present.
- [ ] 7.3 For legacy invoices (no `grandTotal`), keep the existing single-line `Total` rendering.
- [ ] 7.4 Update the "Bill To" block on the detail page to show the snapshotted `shopName`, `fullAddress`, `gstNumber`, `phoneNumber` lines (omitting missing ones).

## 8. PDF rebuild

- [ ] 8.1 In `src/app/core/services/pdf.service.ts`, branch on `invoice.gstPercent` / `invoice.grandTotal`:
  - **Legacy branch**: existing header + subtotal/total layout. No change to output.
  - **India-style branch**: new header with shop/address/GSTIN/phone; new totals block (Subtotal, CGST, SGST, Other Charges, Round Off, Grand Total — zero-valued rows omitted); Amount-in-words line below.
- [ ] 8.2 Add an HSN/SAC column to the line items table when any line on the invoice carries an `hsnSac`. Omit the column entirely when none do.
- [ ] 8.3 Manually generate and visually inspect three sample PDFs (commit results into a temporary scratch folder if useful, then delete before merge): a legacy invoice, an India 18% GST invoice, an India 0% GST invoice with otherCharges and roundOff. Verify rendering at a normal A4 paper size.
- [ ] 8.4 Update existing PDF tests (or add new ones) to cover: India-style invoice produces a document definition with the CGST/SGST/Grand Total lines and the amount-in-words footer; legacy invoice produces the original layout.

## 9. Validation, accessibility, and polish

- [ ] 9.1 Add inline `field-error` messages for the new validators on customer-form, product-form, and invoice-form. Match the existing style (red small text below the input).
- [ ] 9.2 Ensure the new form inputs have associated `<label>` elements (a11y) and `aria-invalid` flips correctly when invalid.
- [ ] 9.3 Add a brief tooltip / help-text on the GST % field: "Indian intra-state. Splits as CGST and SGST. Leave 0 for non-GST invoices." and on the HSN/SAC field: "4–8 digit code from your GST registration (optional)."

## 10. Documentation

- [ ] 10.1 Update `README.md` to mention India-style GST support in the feature list (one or two sentences).
- [ ] 10.2 Update `docs/smoke-test.md` with two additional steps: (a) create a customer with full GSTIN/shop/address details; (b) create an INR invoice with 18% GST and verify the PDF totals + grand-total-in-words.
- [ ] 10.3 Add a short note to the openspec `billeasy-mvp/design.md` decisions section pointing to this change (e.g., "Decision 7 originally said no tax engine; india-gst-invoicing extends this for Indian tenants").

## 11. Verification

- [ ] 11.1 Run `npm run test:rules` against the emulator — expect green.
- [ ] 11.2 Run `npm run test` (vitest) — expect green; the new utility specs are included.
- [ ] 11.3 Run `npm run build` (production build) — expect clean compile.
- [ ] 11.4 Local smoke test in the emulator: bootstrap super-admin → create company → admin creates customer with full India fields → admin creates invoice with 18% GST + other charges + round-off → verify form totals + in-words → save → verify detail page + PDF render exactly the same numbers.
- [ ] 11.5 Confirm a legacy invoice (no GST fields) still renders correctly on detail page and PDF.

## 12. Archival

- [ ] 12.1 Once all tasks above are checked and the smoke test passes, run `openspec archive india-gst-invoicing` to merge the deltas into `openspec/specs/`.
