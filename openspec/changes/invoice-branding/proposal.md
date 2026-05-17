## Why

The current invoice PDF identifies the company only by name pulled from the public gate document. Real businesses — especially those issuing GST tax invoices — need a printed bill that carries their full contact details, registration numbers (GSTIN/PAN/CIN), banking information for payment, terms & conditions, a place for an authorized signature, and any standard disclaimer text. Hard-coding that per deployment would not scale to multiple tenants. The right place is a per-company **invoice template** that the company admin configures once in the app, after which every invoice they generate inherits the same header, footer, signature block, and disclaimer.

## What Changes

- Add a new **Profile** page in the tenant app shell at `/app/profile`, accessible to `company-admin` only, where the admin edits a single per-tenant "invoice template" document. The page presents three logical sections: **Header info**, **Footer / Payment info**, and **Signature & Disclaimer**.
- Persist the template as a single Firestore document at `/companies/{companyId}/private/invoice-template`. Reuses the existing private-subcollection rules path (admins read/write within their tenant; nobody else).
- Fields the admin can set:
  - **Header**: contact phone, contact email, multi-line address (street/city/state/postcode/country), GSTIN, PAN, CIN, website. (Company name and default currency continue to come from the gate document.)
  - **Footer / Payment**: bank account holder name, bank name, account number, IFSC, branch, UPI ID.
  - **Signature & Disclaimer**: signatory name, signatory title (defaults to "Authorized Signatory"), terms & conditions (multi-line), disclaimer (multi-line).
- Make the configured template available to the PDF generator. **All template fields are optional** — empty values cause the corresponding line/block to be omitted in the PDF rather than rendering blank. A brand-new tenant that hasn't filled the profile yet still gets a working (if minimal) PDF.
- Update the **invoice PDF layout** to use the template (additive; back-compatible with the current portrait-two-copies layout from `pdf-portrait-side-by-side`):
  - **Header band** (top of each of the two copies): company name + phone on line 1; remaining contact info (email · website) on line 2; address lines; GSTIN/PAN/CIN line. The existing "Bill to" customer block remains below the header.
  - **Footer band** (above the amount-in-words line on each copy): bank/UPI block on the left, terms & conditions on the right (or stacked when both are short). Disclaimer renders below the totals/amount-in-words as small italic text spanning the full copy width.
  - **Signature block** (lower-right corner of each copy): the text `For <Company Name>`, a vertical gap reserved for a wet signature/stamp, then the signatory name and title.
- Cache the template in memory on the invoice-detail page so opening the page and downloading a PDF costs one extra Firestore read total (and only once per session).
- On-screen invoice detail view does NOT need to render the full template — only the PDF does. (Showing it on screen is out of scope to keep the change small.)

## Capabilities

### New Capabilities

- `company-profile`: a single per-tenant document, editable by `company-admin`s, that stores the contact, payment, signatory, terms, and disclaimer text used on the company's printed invoices.

### Modified Capabilities

- `pdf-billing`: the PDF now renders a configured header band, footer band, signature block, and disclaimer from the company-profile document. The change is additive — invoices created by a tenant whose profile is empty must still render correctly.

## Impact

- **Code**: new Angular feature `features/profile/` (one component, one form, one service), one new `CompanyProfileService` reading/writing the doc, additions to `PdfService.generateInvoicePdf` to layout the new bands. The invoice-detail and invoice-form pages need to pre-load the profile alongside the existing company gate read.
- **Data**: new collection-path `/companies/{cid}/private/invoice-template`. No migration: documents are created on first save; missing fields are treated as empty.
- **Rules**: no new rules required — the existing `/private/{docId}` match in `firestore.rules` already restricts read/write to tenant admins. The change adds a couple of rules tests that exercise the new path.
- **Indexes**: none. The profile is a single document, read by ID.
- **Dependencies**: none added.
- **Quota**: one extra read per invoice-detail page load and one per PDF generation when the cache is cold. Within the Spark-plan budget documented in `docs/quota-budget.md`.
- **UX scope**: nav sidebar gets a new "Profile" link visible to admins; non-admins continue to see only the routes they are authorized for.
- **Explicit non-goals for this change** (deferred to follow-up changes):
  - Image uploads for logo, signature, or stamp. Text-only for this change. See `design.md` for the deferred design.
  - Multiple named templates per company (e.g. one for tax invoices, one for receipts). Single template per company for this change.
  - On-screen rendering of header/footer/signature on the invoice-detail page. PDF only.
  - Sharing/copying a template across tenants.
