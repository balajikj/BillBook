## Why

The current BillEasy invoice model is designed for generic multi-currency billing and lacks the India-specific fields and tax breakdown that GST-registered businesses (most of our target users — small shops, freelancers, and retailers in India) need on every invoice. Without GST split (CGST/SGST), HSN/SAC codes, shop/GSTIN identification, and a grand-total-in-words rendering, the invoices BillEasy produces today are not legally usable as tax invoices in India. This change extends the customer, product, and invoice domains so the system produces compliant tax invoices while keeping the multi-tenant and Spark-tier architecture intact.

## What Changes

- **Extend the Customer entity** with India-specific identification fields: `phoneNumber`, `shopName`, `fullAddress`, `gstNumber`. All optional at the data layer but surfaced in the customer form and snapshotted onto every new invoice's header.
- **Extend the Product entity** with `hsnSac` (HSN code for goods, SAC code for services). Optional; when set, it auto-populates onto invoice line items.
- **Extend the Invoice entity** with India-specific tax and total fields:
  - `gstPercent` (editable at billing time; 0 disables GST entirely)
  - `cgstAmount`, `sgstAmount` (computed: each = `subtotal * gstPercent / 200`)
  - `otherCharges` (editable, defaults to 0)
  - `roundOff` (editable signed adjustment, defaults to 0)
  - `grandTotal` (= subtotal + cgst + sgst + otherCharges + roundOff)
  - The pre-existing `total` field is retained for backward compatibility but `grandTotal` becomes the authoritative final amount on India tax invoices.
- **Extend the Invoice line item** with `hsnSac` and `description` snapshots taken from the source product at line-add time.
- **Extend the Customer snapshot** (embedded in invoices) with `shopName`, `fullAddress`, `gstNumber`, `phoneNumber` so historical invoices remain accurate after customer edits.
- **Invoice form UX**:
  - Customer picker auto-populates header fields (shop, address, GSTIN, phone) and shows them read-only on the invoice form.
  - Product picker auto-populates line `description` AND `hsnSac` AND `unitPrice` (already snapshotted today).
  - `gstPercent` is a single editable field; the form automatically shows the computed `CGST = gst/2` and `SGST = gst/2` as it changes.
  - `otherCharges` and `roundOff` are editable inputs below the GST block.
  - The grand total in words is rendered live as the user fills the form.
- **PDF rebuild**: the invoice PDF gets a new header (shop name, address, GSTIN, phone, invoice number, invoice date) and a new totals breakdown (subtotal → CGST → SGST → other charges → round-off → grand total → grand total in words). Invoices created before this change continue to render the old way (back-compat block).
- **Validation**:
  - GST number format: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9A-Z]$` (standard 15-character GSTIN), enforced when the field is provided.
  - HSN/SAC: `^\d{4,8}$` when provided.
  - GST percentage: numeric, 0–50.
  - Phone: permissive, accepts `+91 9876543210` and bare `9876543210` shapes.
  - Sequential invoice numbering: the existing per-company `INV-YYYY-NNNN` counter already satisfies this; no change to the counter itself.
- Total-in-words conversion uses the Indian numbering system (Lakhs/Crores) when the invoice currency is `INR`; falls back to international short-scale otherwise. Computed at render time (not stored).

## Capabilities

### New Capabilities

<!-- None — this is an extension of existing capabilities, not a new domain. -->

### Modified Capabilities

- `customer-management`: customer schema gains `phoneNumber`, `shopName`, `fullAddress`, `gstNumber`; GSTIN format is validated when provided; the customer snapshot embedded in invoices is extended accordingly.
- `product-management`: product schema gains `hsnSac`; HSN/SAC format is validated when provided; auto-populated onto invoice line items.
- `invoice-management`: invoice gains `gstPercent`, `cgstAmount`, `sgstAmount`, `otherCharges`, `roundOff`, `grandTotal`; computation rules pin CGST = SGST = `subtotal * gstPercent / 200`; `grandTotal` is the authoritative final amount when GST is in play; back-compat behavior for legacy invoices is defined.
- `pdf-billing`: PDF document definition adds an India-style header block (shop name, full address, GSTIN, phone) and a new totals breakdown including grand total in words.

## Impact

- **Code**:
  - Models: `src/app/core/models/customer.ts`, `product.ts`, `invoice.ts` extended with new fields; `CustomerSnapshot` and `InvoiceLineItem` extended too.
  - Forms: `customer-form` (new fields), `product-form` (HSN/SAC), `invoice-form` (header auto-populate, GST/charges/round-off block, live grand-total-in-words).
  - Services: `InvoiceService.create()` updated to compute and persist the new totals; `PdfService.generateInvoicePdf()` rebuilt for the new layout; a new pure helper `core/utils/number-to-words.ts` for in-words conversion (Indian + international modes).
- **Firestore Rules**: no rule changes needed — the new fields live inside existing documents whose access policy is already enforced by `companyId` claim matching.
- **Firestore Indexes**: none added — no new queryable fields beyond what already exists.
- **Migration**: backward-compatible. Older invoices/products/customers without the new fields continue to work; UI treats missing fields as empty strings / zeros. No data backfill script needed.
- **Dependencies**: no new npm packages — number-to-words is implemented in-tree (a few hundred bytes) to avoid pulling a library for one feature.
- **Out of scope for this change** (deferred):
  - **IGST** (inter-state transactions): the spec assumes intra-state (CGST + SGST split). Inter-state invoices would need a `transactionType: 'intra' | 'inter'` field and an `igstAmount` path. Captured as an open question.
  - **Place of supply** field (legally required on B2B inter-state invoices). Tied to IGST.
  - **E-invoicing / QR code / IRN** (mandatory for businesses above the e-invoicing turnover threshold). Out of scope for MVP.
  - **TCS/TDS** withholding. Out of scope.
  - **Per-line GST rates** (different items at different GST slabs in one invoice). The current design uses a single invoice-level GST%; per-line would require a redesign of the line item shape.
  - **Reverse charge mechanism** flag.
