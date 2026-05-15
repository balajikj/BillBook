## Context

BillEasy ships today with a generic invoice model: subtotal, total, line items, and a multi-currency code. The data model was deliberately minimal — Decision 7 in the original [billeasy-mvp design](../billeasy-mvp/design.md) explicitly noted there is no tax engine.

Most of our pilot tenants are Indian small businesses subject to GST. India's GST regime requires that every B2B (and most B2C) tax invoice show:

1. Supplier and recipient identification including **GSTIN** (15-character tax registration number) and full address.
2. **HSN code** (for goods) or **SAC code** (for services) on every line item.
3. The tax split into **CGST** and **SGST** (intra-state) — or **IGST** (inter-state).
4. A **grand total** that aggregates taxable value, taxes, and any rounding adjustment, and the grand total rendered **in words** as a legibility/anti-tampering convention.

This change extends the existing customer, product, and invoice schemas to carry these fields and reworks the invoice form and PDF to display them. The Firestore Rules and multi-tenant boundaries are unchanged — all new fields live inside documents whose authorization is already enforced.

The change is intentionally scoped to **intra-state** transactions (CGST + SGST split per user requirement). Inter-state (IGST), e-invoicing/QR codes, and per-line GST rates are deferred.

## Goals / Non-Goals

**Goals:**

- Customers, products, and invoices carry GST/HSN identification with no schema disruption to existing data.
- Invoice form auto-populates header (shop, address, GSTIN, phone) and line items (description, HSN/SAC, unit price) from picker selections.
- A single editable `gstPercent` on the invoice form drives CGST + SGST split automatically; `otherCharges` and `roundOff` are first-class editable fields; `grandTotal` is computed and persisted.
- PDF invoice produces output legally usable as a tax invoice for intra-state transactions.
- Total-in-words renders correctly in the Indian numbering system (Lakhs/Crores) for INR invoices.
- The change is fully backward compatible: pre-existing invoices/customers/products without the new fields continue to render and operate.

**Non-Goals:**

- IGST (inter-state) — captured as an open question.
- Per-line GST rates (different items at different slabs in one invoice).
- E-invoicing / IRN / QR code generation (mandatory above the turnover threshold; deferred).
- Place-of-supply field (tied to IGST work; deferred).
- TCS/TDS, reverse-charge mechanism, composition-scheme variations.
- HSN code lookup or auto-suggestion from a catalog. The user enters codes manually.
- Data backfill on existing customers/products/invoices.
- Per-state CGST/SGST naming variations (e.g. UTGST for union territories) — uses CGST/SGST labels regardless.

## Decisions

### Decision 1: GST percentage is invoice-level, not product-level or customer-level

`gstPercent` lives on the invoice document and is editable on the invoice form. It is **not** stored on the product (which would suggest a per-product rate matrix and likely diverge from the user's stated requirement of "GST editable during billing"). It is **not** stored on the customer either — that would couple the rate to the buyer, which is wrong (the rate is set by the goods' HSN slab).

**Rationale**: matches the user's explicit requirement; keeps the data model flat; the (legally correct) refinement of per-line GST rates is a deferred change that would supersede this.

**Alternatives considered:**

- *Per-line GST rate on each `InvoiceLineItem`.* Rejected for this scope: forms become significantly more complex and the user did not ask for it. Captured as a future migration path.
- *Per-product GST rate stored on the product, auto-summed at invoice creation.* Rejected: would require a tax-rate matrix and slab UI in product management; out of proportion for the asked feature.

### Decision 2: CGST and SGST are computed and stored, not derived at read time

The invoice document persists `cgstAmount` and `sgstAmount` as numbers (rupees, two decimal places). These are not recomputed when the invoice is read.

**Rationale**: an invoice is a legal document; the totals on the PDF and in the database must remain stable even if rounding logic later changes. Storing the computed amounts also means PDF generation is a pure render, not a recompute.

**Formula** (single source of truth, implemented in `core/utils/invoice-math.ts`):

```
const halfRate     = gstPercent / 200                  // e.g. 18% → 0.09
const cgstAmount   = round(subtotal * halfRate, 2)
const sgstAmount   = round(subtotal * halfRate, 2)
const grandTotal   = round(subtotal + cgstAmount + sgstAmount + otherCharges + roundOff, 2)
```

Rounding uses banker's rounding (half-to-even) via a small helper to avoid floating-point cliff cases. All monetary persistence is in major units (rupees) with two decimal places. (Storing paise in minor units as integers is a known better practice but is out of scope; we accept floating-point in line with the existing `subtotal`/`total` precedent in the codebase.)

### Decision 3: Customer snapshot embedded in invoice is extended

`CustomerSnapshot` adds: `shopName`, `fullAddress`, `gstNumber`, `phoneNumber`. All optional strings.

**Rationale**: the existing snapshot pattern (Decision in billeasy-mvp Decision 3 / customer-management spec) protects historical invoices against later customer edits or deletion. Extending the snapshot rather than re-reading the customer at PDF time preserves that property.

The existing `email` and `address` fields on `CustomerSnapshot` are retained (back-compat). The new `fullAddress` is a separate field intended for the formatted invoice header; existing `address` is treated as a one-line legacy alias. New invoices populate both for now; the long-term direction is a single `address` field with structure (street/city/state/pin), but that is out of scope.

### Decision 4: Product gains `hsnSac`; line items snapshot it

`Product.hsnSac` is optional (some tenants sell unclassified or exempt items). `InvoiceLineItem.hsnSac` and `InvoiceLineItem.description` are snapshotted at line-add time from the picked product, alongside the already-snapshotted `unitPrice`.

**Rationale**: same snapshotting pattern as `unitPrice`. Editing or deleting a product after invoicing must not retroactively change the invoice's HSN code (it has legal/audit consequences).

### Decision 5: `gstPercent: 0` (or absent) disables GST entirely

When `gstPercent` is `0`, `null`, or `undefined` on a new invoice, the form does not show the CGST/SGST block, the PDF does not render those lines, and `grandTotal = subtotal + otherCharges + roundOff`. This preserves the existing zero-GST behavior for tenants who don't need GST (e.g. an international tenant, or an Indian tenant invoicing an exempt service).

**Rationale**: avoids forcing GST onto every tenant; preserves multi-currency utility; legacy invoices render naturally because they have no `gstPercent`.

### Decision 6: Total-in-words is computed at render, not stored

`grandTotalInWords` is **not** persisted. The PDF service and the form preview both compute it from `grandTotal` + `currency` via a pure helper `core/utils/number-to-words.ts`.

**Rationale**: `grandTotal` is the canonical persisted truth. In-words is purely a presentation concern derived from it. Storing both invites drift if the formatter changes.

The helper supports two modes:

- **Indian** (default when `currency === 'INR'`): groups by Lakhs (1,00,000) and Crores (1,00,00,000). Output style: `"Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Only"`.
- **International short scale** (when `currency !== 'INR'`): groups by thousands/millions. Output style: `"Twelve Thousand Three Hundred Forty Five Dollars and Sixty Seven Cents Only"`.

Implemented in-tree (~200 lines including tests). No new npm dependency.

### Decision 7: Invoice number sequence is unchanged

The existing per-company counter at `/companies/{cid}/counters/invoice` with `INV-{YYYY}-{NNNN}` format already provides unique sequential numbering per tenant per year. No change.

**Note**: India's GST rules require invoice numbers to be **strictly sequential per financial year** (April–March, not calendar year). The current implementation rolls at January 1. This is a known discrepancy. Captured as an open question — but **deliberately out of scope for this change** because it touches the counter logic and requires a migration story for tenants mid-year.

### Decision 8: Form auto-populates header on customer pick

When the user picks a customer on the invoice form, the header card displays `shopName`, `fullAddress`, `gstNumber`, `phoneNumber` as read-only labels (not editable inputs). The fields are also written into the persisted snapshot on save.

**Rationale**: the customer record is the source of truth; allowing inline edits on the invoice would create a confusing two-place edit story. If a header field is wrong, the user edits the customer record and creates a new invoice.

**Trade-off**: if the customer record is missing GSTIN, the resulting invoice will lack GSTIN in the header. A subtle UI hint ("This customer has no GSTIN — edit the customer to add one") is included on the form.

### Decision 9: Validation lives in a shared `core/validators/gst.ts`

GSTIN, HSN, and phone validators are pure functions exported from one file so the form, the model layer, and any future server-side check share one implementation.

```typescript
GSTIN_PATTERN  = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9A-Z]$/   // 15 chars
HSN_PATTERN    = /^\d{4,8}$/                                            // 4-8 digit code
PHONE_PATTERN  = /^(\+?\d{1,3}[\s-]?)?\d{10}$/                          // permissive India-leaning
GST_PERCENT_RANGE = [0, 50]
```

The 15th GSTIN character is a checksum in the official spec; we do **not** verify the checksum (would add ~50 lines for a small UX win). The format check rejects most paste-errors; bad-but-formatted GSTINs slip through but are unlikely.

### Decision 10: Backward compatibility via optional fields

Every new field on Customer, Product, Invoice, CustomerSnapshot, and InvoiceLineItem is added as **optional** in the TypeScript types and treated as absent → empty string / zero / null at read time. No migration script. No Firestore Rules change.

**Implication**: the invoice list and detail pages must handle a mix of old (no GST) and new (with GST) invoices. The PDF generator branches on `invoice.gstPercent` to choose the header/totals block. Forms initialize new fields with default values (empty string / zero) when editing legacy data.

## Risks / Trade-offs

- **[Single GST% per invoice doesn't match real-world multi-slab invoices]** → Many real Indian invoices include items at 5%, 12%, and 18% in one document. Our single-slab model produces a slightly-wrong tax breakdown if a tenant invoices mixed-slab items. Mitigation: documented limitation; ship now to unblock the majority of small-shop use cases (single-slab is the norm for restaurants, salons, repair shops, etc.); per-line GST is the natural follow-up change.

- **[CGST/SGST assumes intra-state]** → Inter-state transactions are taxed under IGST (single line, same total amount). Producing a CGST+SGST invoice for an inter-state sale is legally incorrect. Mitigation: spec & docs are explicit; a follow-up change adds `transactionType` + IGST path.

- **[Rounding drift between line totals and the computed grand total]** → Each line total is stored independently; CGST/SGST are then computed from `subtotal`. The result can differ by ₹0.01 from a manual recomputation that sums line-level tax. Mitigation: the `roundOff` field exists exactly for this; default to 0 and let the operator adjust to a whole-rupee total at billing time.

- **[Floating-point money]** → We continue the existing pattern of storing money as `number` in JavaScript. For tenant-scale invoicing this is fine in practice but accumulates error in aggregations. Mitigation: documented; future migration to integer paise is a separate change.

- **[GSTIN checksum not verified]** → Malformed-but-pattern-conformant GSTINs are accepted. Mitigation: format check rejects most paste errors; the consequence of a bad GSTIN is a wrong-but-printable invoice, not data corruption.

- **[Financial-year vs calendar-year numbering]** → Indian rules require April–March sequencing; ours is January–December. Some tenants will need a different counter strategy. Mitigation: documented as a known gap; follow-up change.

- **[Customer with missing GSTIN]** → No hard block. A B2C tax invoice in India is valid without buyer GSTIN below a threshold; we don't try to enforce that. Mitigation: form hint on the invoice screen.

- **[Number-to-words for large amounts]** → Indian system has names up to Crore (10^7), Arab (10^9), Kharab (10^11). We implement up to Crore — anything above prints as `"X Crore Y Lakh ..."` with X possibly large. Acceptable: invoices above 99 crore are not the BillEasy MVP audience.

## Migration Plan

This change is fully backward compatible at the data layer. No backfill is required.

**Deploy steps:**

1. Land the model and shared-validator code (`models/*.ts`, `core/utils/invoice-math.ts`, `core/validators/gst.ts`, `core/utils/number-to-words.ts`).
2. Land the customer-form and product-form changes (new fields, validators).
3. Land the invoice-form changes (header auto-populate, GST/charges/round-off, live grand-total-in-words preview).
4. Land the invoice-service `create()` and `update()` changes to compute and persist the new totals.
5. Land the PDF service rebuild with the new header and totals block.
6. Land the invoice-detail page changes to show the new breakdown.
7. Run rules tests (no rules change expected; sanity).
8. Deploy hosting only (`npm run deploy:hosting`).

**Rollback:**

Hosting deploy is versioned by Firebase: `npx firebase hosting:rollback` reverts the SPA. Existing invoices created during the new-version window remain valid because the new fields are optional; the rolled-back UI simply ignores them.

## Open Questions

- **IGST support**: when do we need to ship inter-state transactions? Recommendation: defer to a follow-up change `inter-state-gst` that adds `transactionType` + IGST. Stakeholder confirmation required.
- **Financial-year invoice numbering**: should `INV-YYYY-NNNN` use the Indian fiscal year (April–March)? Currently calendar year. Recommendation: defer; touches the counter and needs a per-tenant migration story.
- **Per-line GST rates**: needed for tenants with mixed-slab invoices. Recommendation: defer; this change ships single-slab as an explicit MVP scope.
- **GSTIN checksum verification**: nice-to-have. Recommendation: skip for now; format-only validation is sufficient for catching paste errors.
- **Bilingual rendering** (Tamil/Hindi alongside English on the PDF) — common request in some states. Out of scope for this change; flag for later.
- **Default GST% per tenant**: should a tenant set a "usual GST%" on their company doc so the form pre-fills it? Recommendation: defer; in practice tenants usually deal in one or two slabs and learn to type 18 quickly. Add only if user feedback demands.
