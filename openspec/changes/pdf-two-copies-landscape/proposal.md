## Why

Today's invoice PDF prints one copy of the invoice on a portrait A4 page, which leaves the bottom half of the page blank and wastes paper. Indian GST-registered businesses commonly print two copies of every tax invoice on the same sheet — one for the recipient and one for the supplier's records — and tear the sheet in half. This halves paper and ink consumption per invoice and matches existing trade-floor practice for shops, repair garages, and similar small-business tenants. Rotating to landscape and stacking the two copies vertically lets the line items + totals fit comfortably in each half without scaling artifacts.

## What Changes

- **Page orientation switches to landscape A4** (842pt × 595pt) for invoice PDFs. Replaces the current portrait default.
- **Each PDF contains two identical copies of the invoice** stacked vertically on a single page. The first copy occupies the upper half; the second copy occupies the lower half.
- **Visual separator between the two copies**: a dashed horizontal line spanning the page width with a small "✂ Cut along this line" label centered on it.
- **Typography tightened so each copy fits in roughly half the landscape page height** (~270pt usable per copy):
  - Company header drops from 16pt to 13pt.
  - Invoice number heading drops from 14pt to 11pt.
  - Body text drops from 10pt to 8pt.
  - Footer drops to 7pt.
  - Page margins tighten from `[40, 60, 40, 60]` to `[24, 18, 24, 18]`.
  - Table row padding tightens; the line items table widths re-balance for landscape proportions.
- **Optional copy labels** (Indian GST convention): a small label sits at the top-right of each copy reading `ORIGINAL FOR RECIPIENT` on the upper copy and `DUPLICATE FOR SUPPLIER` on the lower copy. Off by default; a constant toggle in the PDF service lets a tenant turn it on. (See Open Questions in `design.md`.)
- **`generateInvoicePdf` keeps the same public signature** — the caller (invoice detail page) needs no changes; the new layout is the new default for every invoice.
- **Same layout for legacy and India-GST invoices.** Both render two-up landscape; only the contents of each copy differ (CGST/SGST/GrandTotal rows for India invoices, single Total row for legacy).
- **No data model changes.** This is a presentation-only change.

## Capabilities

### New Capabilities

<!-- None — this modifies the existing pdf-billing capability. -->

### Modified Capabilities

- `pdf-billing`: the PDF document layout is rewritten to landscape A4 with two identical copies of the invoice per page; typography and margins are tightened to fit; a visual cut-line separates the copies. The PDF *content* (header fields, line items, totals breakdown, amount-in-words) is unchanged — only the page geometry and per-copy multiplicity change.

## Impact

- **Code**:
  - [src/app/core/services/pdf.service.ts](src/app/core/services/pdf.service.ts): refactor `buildInvoiceDocDefinition` so the invoice content is built as a reusable block (helper function returning a pdfmake content array), then assembled twice into one landscape page with a separator between.
  - The dynamic pdfmake font wiring at the top of `generateInvoicePdf` is unchanged.
  - The `Bill to` block, line items table, totals block, and amount-in-words footer are all preserved verbatim inside each half.
- **Tests**: extend [src/app/core/services/pdf.service.spec.ts](src/app/core/services/pdf.service.spec.ts) to assert (a) `pageOrientation === 'landscape'`, (b) the rendered content includes the invoice number string exactly twice (one per copy), (c) the cut-line text appears, (d) typography styles use the new smaller sizes.
- **Smoke test**: add a verification step in [docs/smoke-test.md](docs/smoke-test.md) — after downloading the PDF, open it and confirm landscape orientation, two copies visible, a single page total.
- **Out of scope** (deferred):
  - Triplicate (three copies on one page). Standard Indian GST allows triplicate for transporter scenarios, but small-business shops typically use duplicate. A future change can add a tenant-level setting.
  - Per-tenant choice of portrait single-copy vs landscape two-up. Single global default for this change.
  - Toggling the "Original / Duplicate" labels per-invoice or per-tenant. Documented as a code-level constant toggle for now.
  - Custom paper sizes (e.g. Letter for North American tenants). The MVP target is Indian tenants printing on A4.
