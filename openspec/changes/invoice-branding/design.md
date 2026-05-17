## Context

Today the invoice PDF (rendered by `PdfService.generateInvoicePdf` in `src/app/core/services/pdf.service.ts`, currently using the portrait two-copies layout from the `pdf-portrait-side-by-side` change) draws the company name from the publicly readable gate document at `/companies/{cid}` and nothing else. The header is essentially "company name + invoice number + dates". A real-world tax invoice carries far more information: full contact, GSTIN, PAN, bank/UPI for payment, terms, a signatory block, and a disclaimer. Hardcoding any of that would not scale to multiple tenants.

The right home for this is a tenant-private configuration document. The Firestore rules already accommodate it: the `/companies/{cid}/private/{docId}` match restricts read and write to tenant admins (and super admins). So no rules redesign is needed — only a new document at a known path.

Two consumers of the document exist in this change: the **Profile editor page** (`/app/profile`) and the **PDF generator**. The invoice-form and invoice-detail pages remain unchanged on screen; the printed/PDF version is where the new fields appear.

## Goals / Non-Goals

**Goals:**

- A single, simple Profile page that lets a company admin enter all the template fields and save them in one round-trip.
- A profile document that is fully optional — a fresh tenant's invoices still render correctly with no template configured.
- Additive PDF changes — the existing portrait two-copies layout is preserved; the new bands slot into each copy.
- The PDF generator stays a pure function of the invoice + company gate + profile; it does no extra Firestore reads itself.
- Zero new Firestore indexes, zero new rules, zero new Cloud Functions, zero new npm dependencies.
- Quota impact bounded to one extra read per invoice-detail page load.

**Non-Goals:**

- Image uploads for logo / signature / stamp (deferred — see "Open Questions").
- Multiple named templates per company (e.g. tax invoice + receipt + proforma). Single template only.
- Showing the configured header/footer/signature on the on-screen invoice-detail page. PDF only.
- Versioning or audit log of profile edits. The doc holds the current value; an admin overwrites it in place.
- Localisation of label text (e.g. translating "Bank Details" / "Authorized Signatory"). English-only.
- Cross-tenant template sharing or import/export.

## Decisions

### Decision 1: One document at `/companies/{cid}/private/invoice-template`

A single Firestore document holds the entire template. Doc ID is the literal string `invoice-template` (matches the existing convention of naming docs under `/private/` by purpose, like `branding` or `settings`). The path `/companies/{cid}/private/{docId}` is already covered by the rule:

```
match /private/{docId} {
  allow read, write: if isTenantAdmin(cid) || isSuperAdmin();
}
```

So no rules change is needed. Reading the doc costs 1 read; writing costs 1 write.

**Alternatives considered:**

- *Subdocuments per section (header / footer / signature).* Rejected: three reads per PDF render for no benefit. Sections are always edited and read together.
- *Merging template fields into the public gate doc at `/companies/{cid}`.* Rejected: the gate doc is public-readable and intentionally minimal (`name`, `status`, `defaultCurrency`). Bank account numbers and UPI IDs must not live in a public-readable document.

### Decision 2: Document shape — nested by section, all fields optional

```ts
interface InvoiceTemplate {
  header: {
    phone?: string;
    email?: string;
    addressLines?: string[];   // multi-line address; one element per line
    gstin?: string;
    pan?: string;
    cin?: string;
    website?: string;
  };
  footer: {
    bankAccountName?: string;
    bankName?: string;
    accountNumber?: string;
    ifsc?: string;
    branch?: string;
    upiId?: string;
  };
  signature: {
    signatoryName?: string;
    signatoryTitle?: string;   // defaults to "Authorized Signatory" at render time
  };
  termsAndConditions?: string; // multi-line free-form
  disclaimer?: string;         // multi-line free-form
  updatedAt?: Timestamp;
  updatedBy?: string;          // uid of the admin who last saved
}
```

Every field is optional and the PDF treats undefined / empty string as "skip this line/block." This avoids a migration when fields are added later and lets brand-new tenants generate invoices before they have configured anything.

**Alternative considered**: flat document (`header_phone`, `header_email`, etc.). Rejected: readability matters more than a couple of nesting levels here, and the form maps cleanly onto sections.

### Decision 3: Profile is admin-only; non-admins never see the route

`/app/profile` sits under the existing `/app/*` shell behind the `roleGuard(['company-admin'])` guard pattern already used by Customers/Products/Users. The nav sidebar shows a "Profile" link only for `company-admin` role (the same `@if (isAdmin())` block currently used for the other admin-only items). Non-admins navigating to `/app/profile` are redirected to `/app/invoices` by the role guard, matching existing behaviour.

### Decision 4: Profile is preloaded by a route resolver and cached for the session

To avoid every invoice PDF generation hitting Firestore for the profile, the profile is loaded once per session via a `CompanyProfileService` that:

1. Holds a `signal<InvoiceTemplate | null>(null)`.
2. On first access (`getOrLoad()`), does `getDoc('/companies/{cid}/private/invoice-template')`, caches the result (treating missing doc as the empty template), and returns it.
3. Invalidates the cache when the Profile page successfully saves (so a subsequent PDF picks up the new values).

This makes the PDF generator's input deterministic — caller passes `(invoice, company, profile)` — and means a session that downloads N PDFs costs 1 profile read, not N. Cache is per-session memory; sign-out / page reload clears it.

**Alternatives considered:**

- *Real-time listener on the profile doc.* Rejected: profiles change very rarely and a live subscription costs more (in reads) than the explicit "reload after save" pattern.
- *Embed the profile snapshot on each invoice document at creation time.* Rejected for MVP: doubles invoice write size and breaks the "edit profile, reprint old invoice with new template" workflow that users will expect.

### Decision 5: PDF layout — additive bands inside each existing copy

The PDF currently renders two identical invoice copies side-by-side in portrait. Each copy currently contains, top-to-bottom: company name; invoice header (number + dates); bill-to block; line items table; totals; amount-in-words. This change inserts three new bands:

1. **Header band** (just below the company name, above the existing invoice header):
   - Line 1: `<phone>` (right-aligned with company name on the same line if there's space, else its own line).
   - Line 2: `<email>` · `<website>`
   - Line 3+: address lines (one per `addressLines[]` entry)
   - Line N: `GSTIN: <gstin>` · `PAN: <pan>` · `CIN: <cin>` (only the populated fields appear; separator dots dropped between absent fields)
2. **Footer band** (between the amount-in-words line and the new signature block):
   - Left column: `Bank Details` heading + bank/UPI fields (each as `Label: value`, only populated fields show).
   - Right column: `Terms & Conditions` heading + the configured T&C text (rendered with line-breaks preserved).
   - If both columns are empty, the entire footer band is omitted.
3. **Signature block** (lower-right of each copy, after the footer band):
   - `For <CompanyName>` on top.
   - ~36pt vertical gap reserved for a wet signature/stamp.
   - Signatory name + title underneath. Title defaults to `Authorized Signatory` if unset.

The **disclaimer** renders as a small italic line spanning the full copy width below the signature block (or at the very bottom if there is no signature block to anchor it).

All band-rendering helpers must accept an `InvoiceTemplate` and gracefully produce an empty stack of zero pdfmake nodes when no fields are populated for that band — so the existing layout is unchanged for any tenant with a totally empty profile.

**Trade-off — page-fit budget**: the current portrait two-copies layout was tuned to fit a typical GST invoice on a single page. The new bands add height. We mitigate by:

- Rendering each new band only when it has content (zero-height when empty).
- Using a small font size (8pt body, 7pt for the disclaimer) consistent with the rest of the layout.
- Letting pdfmake flow onto a second page if a particular invoice + heavy template exceeds one page. The smoke test must verify the typical case still fits.

### Decision 6: Validation — light, client-side only

The Profile form does client-side validation only:

- Email format on `header.email`.
- URL format on `header.website` (leading `http://`/`https://` auto-prepended if missing).
- GSTIN regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$` if non-empty.
- PAN regex `^[A-Z]{5}[0-9]{4}[A-Z]{1}$` if non-empty.
- IFSC regex `^[A-Z]{4}0[A-Z0-9]{6}$` if non-empty.
- `accountNumber` digits-only and 6–18 characters.

There's no server-side validation by design — these are presentation-layer values and the rules can't enforce regex on arbitrary fields without bloating. If a user goes around the UI and writes garbage, the worst case is an ugly PDF; nothing leaks across tenants.

### Decision 7: Header band rendering when the profile is fully empty

If every configured-template field is empty for a tenant, the new bands collapse to zero height and the PDF looks exactly the same as before this change. This is the contract that lets us ship without a migration and that protects existing invoices/PDFs from regressions.

## Risks / Trade-offs

- [**Page overflow when a tenant fills every field plus a long T&C**] → The smoke test (`docs/smoke-test.md`) gains a step exercising a fully-populated template; if the typical invoice tips onto a second page, we tune the band font sizes and address-line wrapping rather than dropping content. The PDF allowing overflow is preferable to silently truncating.
- [**Profile cache becomes stale after edits**] → Mitigated by the `CompanyProfileService.invalidate()` call inside the save flow. If a user opens two tabs and edits in one, the other tab's cache stays stale for the session — acceptable for an admin-only screen.
- [**No server-side validation of GSTIN/PAN/IFSC**] → Acceptable for MVP because these are display strings, not authorization-bearing. Future enhancement could add a Cloud Function-side check if needed.
- [**Multi-line free-form text in T&C / disclaimer**] → A malicious admin could paste enormous amounts of text and bloat the PDF. We cap T&C and disclaimer at 2000 chars each in the client-side form; Firestore document size limit (1 MiB) is the hard backstop.
- [**No image support, so logos appear only as text**] → This is a documented non-goal; many small-business invoices manage fine without a logo. Adding logo support is a clean follow-up change.

## Migration Plan

This is purely additive. No existing data needs to move.

1. Deploy rules (no rules change in this change, but `firebase deploy --only firestore` is harmless).
2. Deploy the Angular build with the new Profile page and PDF additions.
3. Existing invoices keep rendering with the new PDF template — if their tenant has an empty profile (the default), they look identical to before.

**Rollback** — revert the Angular build via `firebase hosting:rollback` (or redeploy a prior commit). The `/companies/{cid}/private/invoice-template` documents that get created stay in Firestore; they are harmless and forwards-compatible if the feature is re-enabled later.

## Open Questions

- **Image uploads (logo, signature image, stamp image)** — deferred. The most sensible follow-up change adds Firebase Storage to the project (free tier allows 5 GB), per-tenant Storage rules, an upload widget on the Profile page (with client-side resize/crop to keep PDF embed sizes small), and `<image>` nodes in the pdfmake document definition. Tracking as a separate change rather than bundling.
- **Country / locale** — currently every label is English. A future change could let the admin pick `en-IN`, `en-US`, etc., which would also auto-pick a date format and a number-grouping convention. Out of scope here.
- **Defaults from a template library** — should we ship sensible defaults (e.g. T&C text "Goods once sold cannot be returned…")? Recommendation: no — let each tenant write their own. The form has placeholder text suggesting common patterns.
