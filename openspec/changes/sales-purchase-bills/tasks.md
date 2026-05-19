## 1. Data model

- [ ] 1.1 In `src/app/core/models/invoice.ts` add `export type InvoiceKind = 'sales' | 'purchase'` and add an optional `kind?: InvoiceKind` field to the `Invoice` interface. Document the legacy-default rule inline.
- [ ] 1.2 In the same file, export a pure accessor `export function getInvoiceKind(inv: Pick<Invoice, 'kind'>): InvoiceKind { return inv.kind ?? 'sales'; }` that every consumer uses instead of touching `inv.kind` directly.
- [ ] 1.3 Re-export the new type from `src/app/core/models/index.ts`.

## 2. InvoiceService — split create paths, accept kind on list

- [ ] 2.1 Extend `CreateInvoiceArgs` in `src/app/core/services/invoice.service.ts` with `kind: InvoiceKind` (required) and `number?: string` (only required when `kind === 'purchase'`).
- [ ] 2.2 In `InvoiceService.create`, branch:
  - **Sales path** (`kind === 'sales'`): keep the existing transactional flow — read the counter, increment, compute `INV-YYYY-NNNN`, write the invoice document (with `kind: 'sales'`).
  - **Purchase path** (`kind === 'purchase'`): validate the caller-supplied `number` (non-blank after trim; length 1–64); write the invoice document with `kind: 'purchase'` and `number: <user-supplied>` via `setDoc(doc(collection))`. DO NOT touch the counter.
- [ ] 2.3 Extend `InvoiceListOptions` with an optional `kind?: InvoiceKind`. In `list$`, when `opts.kind` is set, push `where('kind', '==', opts.kind)` before the existing constraints. Filtering legacy "no-kind" rows is acceptable to miss — they default to sales so the `'sales'` filter is the natural fallback (note this in code comments).
- [ ] 2.4 Update `markPaid` / `revertToPending` / `remove` — no changes needed; they operate on the invoice doc agnostic of kind.

## 3. Invoice form — Bill kind toggle + branching labels and number entry

- [ ] 3.1 In `src/app/features/invoices/invoice-form.component.ts`, add a `kind` FormControl seeded to `'sales'` and bound to a radio-button toggle at the top of the form.
- [ ] 3.2 Add `number` FormControl gated by `kind`: validators `[]` for sales (read-only preview) and `[Validators.required, Validators.maxLength(64), trimNonBlank]` for purchase.
- [ ] 3.3 Wire `computed()` signals for heading text (`New sales bill` / `New purchase bill`) and counterparty label (`Customer` / `Vendor`).
- [ ] 3.4 Conditional template: when `kind === 'purchase'` show the editable `number` input with placeholder `e.g. VEN/2026/4521`; when `kind === 'sales'` show a small read-only preview line `Will be assigned automatically (INV-<YYYY>-NNNN)`.
- [ ] 3.5 Update the submit handler to call `InvoiceService.create({ ..., kind, number: kind === 'purchase' ? raw.number : undefined })`. Keep the rest of the payload identical.
- [ ] 3.6 Adjust validation summary copy + the disabled-Save guidance to point at the kind-specific fields.

## 4. Invoice list — Kind filter + badge

- [ ] 4.1 In `src/app/features/invoices/invoice-list.component.ts`, add a `kind` filter control to the existing `filterForm` with options `All` / `Sales` / `Purchase` (value `''` for All).
- [ ] 4.2 Wire the filter into `InvoiceListOptions.kind` when the value is `'sales'` or `'purchase'`; leave it unset for `'All'`.
- [ ] 4.3 Add a kind badge to each row (small pill near the invoice number) reading `Sales` or `Purchase`. Compute via `getInvoiceKind(inv)`.

## 5. Invoice detail — label tweaks

- [ ] 5.1 In `src/app/features/invoices/invoice-detail.component.ts`, derive `kind = getInvoiceKind(inv)` and use it to:
  - Show heading text indicating the kind (e.g. `{{ kind === 'purchase' ? 'Purchase bill' : 'Sales bill' }} {{ inv.number }}`).
  - Rename the "Bill to" section header to `Bill from` when `kind === 'purchase'`.
- [ ] 5.2 No other detail-page changes — all controls (Mark as paid, Revert, Delete, Download PDF) keep working.

## 6. DashboardService — bucket by kind + GST sums

- [ ] 6.1 In `src/app/core/services/dashboard.service.ts`, extend the in-memory `DashboardSummary` to carry:
  ```ts
  sales: { revenueByCurrency: Record<string, number>; paidCount: number; pendingNotOverdueCount: number; overdueCount: number; };
  purchase: { paidOutByCurrency: Record<string, number>; paidCount: number; pendingNotOverdueCount: number; overdueCount: number; };
  gst: { outputInr: number; inputInr: number; netInr: number };
  ```
- [ ] 6.2 Rewrite `load()` to issue the four queries described in design.md Decision 4 and bucket results client-side using `getInvoiceKind`. Keep the existing 90-day window and `limit(10)` on recent.
- [ ] 6.3 GST sums: iterate invoices with `gstPercent > 0` AND `currency === 'INR'`; bucket by `getInvoiceKind(inv)`; sum `cgstAmount + sgstAmount`. Compute `netInr = outputInr - inputInr` at the end.

## 7. Dashboard component — three card groups + recent panel kind badge

- [ ] 7.1 In `src/app/features/dashboard/dashboard.component.ts`, replace the existing single card row with three labelled groups: **Sales (last 90 days)**, **Purchase (last 90 days)**, **GST Summary (last 90 days)**, each rendering its cards.
- [ ] 7.2 GST Summary card row:
  - Output GST (INR, bold).
  - Input GST (INR).
  - Net liability — show with `payable` (warning style) when `> 0`, `ITC available` (info style) when `< 0`, `Balanced` (or `0.00`) when zero.
  - Small caveat line below the row: `Rolling 90-day INR-only estimate, not a tax filing report.`
- [ ] 7.3 Recent invoices panel: render each row with a `Sales` / `Purchase` badge via `getInvoiceKind`. Keep the existing order (newest 10).

## 8. Firestore indexes (if needed)

- [ ] 8.1 First run the dashboard against the emulator. If Firestore logs a "needs index" link for the new GST query (`where('createdAt', '>=', X) AND where('gstPercent', '>', 0)`), follow the link, accept the suggested composite index, and copy its definition into `firestore.indexes.json`.
- [ ] 8.2 If the kind-filtered list query (`where('kind', '==', ...) AND orderBy('createdAt', 'desc')`) needs a composite index, add it too.

## 9. Smoke test docs

- [ ] 9.1 In `docs/smoke-test.md`, add a step **3c. Create a purchase bill** between the existing GST sales step and the closing tenant-isolation step:
  - Sign in as Alice. Click **New invoice**. Flip the **Bill kind** toggle to **Purchase**.
  - Confirm heading reads `New purchase bill`, counterparty label reads `Vendor`, number field becomes a required text input.
  - Pick `Globex Traders` (used as the vendor). Type number `VEN/2026/4521`. Add a line item: `Office supplies`, qty 1, unit price `2000`, GST `18`.
  - Save. On the detail page confirm heading reads `Purchase bill VEN/2026/4521`, counterparty section header reads `Bill from`, totals match.
  - In the invoice list, set the **Kind** filter to `Purchase` — verify only the new bill appears. Set to `Sales` — verify only the older sales invoices appear.
- [ ] 9.2 Add a step **3d. Verify dashboard segregation**:
  - Open `/app/dashboard`. Verify three groups render in order: Sales, Purchase, GST Summary.
  - Sales group: Revenue should reflect the older paid sales invoices only.
  - Purchase group: Paid out should be `0` because the new purchase bill is still pending; Pending count should be `1`.
  - GST Summary: Output GST sums all sales-GST in the window; Input GST sums the new purchase's CGST+SGST (₹180 from the 2000 × 18% example); Net liability shows the difference.
  - Mark the purchase bill as Paid; refresh the dashboard; confirm Purchase Paid count moves to `1` and Paid out reflects the grand total.

## 10. README

- [ ] 10.1 Update the README intro to mention that invoices now distinguish **sales** vs **purchase** bills, and the dashboard now segregates metrics and shows a rolling GST Summary (Output, Input, Net liability). Keep the addition short (1–2 sentences).
- [ ] 10.2 Add a non-goals bullet noting the dashboard GST Summary is a rolling 90-day estimate, not a filing-grade GSTR report.

## 11. Build & verify

- [ ] 11.1 `npm run build` — clean, no new warnings.
- [ ] 11.2 `npm run test:rules` — still green (no rules changed; this is a sanity check).
- [ ] 11.3 Walk the updated smoke-test steps 3c + 3d against the running emulator.

## 12. Deploy

- [ ] 12.1 `npm run deploy:rules` — only if `firestore.indexes.json` changed (step 8). Otherwise skip.
- [ ] 12.2 `npm run deploy:hosting`.
