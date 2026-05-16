## Why

The previously-shipped `pdf-two-copies-landscape` change produces a landscape A4 page with two invoice copies stacked vertically (top half + bottom half) — which the user has now indicated is the wrong split direction for their printing workflow. The required layout is **portrait A4** with the two copies arranged **side-by-side** (left half + right half), so the operator folds the sheet on a vertical center crease and tears it into two narrow portrait halves. This matches the columnar receipt-book stationery format common in Indian small shops and is what the user is asking for.

This change reverts the page orientation back to portrait and re-routes the two-copy duplication onto the horizontal axis, while preserving every other improvement from the previous change (the per-copy content builder, tightened typography, dashed cut-line separator, optional `ORIGINAL`/`DUPLICATE` badges).

## What Changes

- **Page orientation reverts to portrait A4** (595pt × 842pt). The `pageOrientation: 'landscape'` setting introduced by `pdf-two-copies-landscape` is removed.
- **Two copies are placed side-by-side** in a single pdfmake `columns` element: copy 1 (`ORIGINAL FOR RECIPIENT`) in the left column, a thin vertical separator in the middle, copy 2 (`DUPLICATE FOR SUPPLIER`) in the right column. The page still contains exactly two copies on a single sheet.
- **The cut-line separator becomes vertical** instead of horizontal: a dashed line running top-to-bottom in the center gap, with no centered text label (rotating text in pdfmake is brittle — the vertical-line convention is visually self-explanatory).
- **The within-copy "bill-to + dates" header re-flows from side-by-side columns to a stacked layout**, because each copy now has ~270pt of horizontal room instead of ~794pt. Bill-to block appears first; invoice date + due date + status appear below it, right-aligned.
- **Line items table widths re-balance for the narrower column**: when the HSN/SAC column is present, widths are roughly `[*, 36, 22, 44, 56]`; without HSN, `[*, 22, 44, 56]`. The description column takes whatever's left.
- **Totals table width** shrinks from 240pt to `auto`, sitting flush-right under the line items table.
- **Typography stays at 8pt body / 13pt company / 11pt invoice header / 7pt footer** (unchanged from the previous change). Vertical room is no longer the constraint — narrowness is.
- **`SHOW_COPY_LABELS` constant** is preserved as-is. Off by default. Labels render at the top-right of each copy.
- **Page margins** stay tight at `[24, 18, 24, 18]`.
- **Same content in each copy** — every existing pdf-billing spec requirement (bill-to fields, line items, totals breakdown, amount-in-words for India invoices) continues to apply per copy.

## Capabilities

### New Capabilities

<!-- None — this modifies the existing pdf-billing capability. -->

### Modified Capabilities

- `pdf-billing`: page orientation goes from landscape back to portrait; the two copies are now placed side-by-side via a top-level `columns` layout; the separator is a vertical dashed line in the center gap instead of a horizontal dashed line; the bill-to+dates header inside each copy re-flows from two-column to a stack; line items / totals table widths re-balance for the narrower per-copy area.

## Impact

- **Code**: rewrites `buildInvoiceDocDefinition` in [src/app/core/services/pdf.service.ts](src/app/core/services/pdf.service.ts) to wrap two `buildInvoiceCopy` outputs in a `columns` element with a vertical separator between them; replaces the existing `separator()` helper (currently a horizontal dashed line + label) with a `verticalSeparator()` helper (vertical dashed line, no label); flips the per-copy bill-to+dates layout from a `columns` block to a stack (still inside `buildInvoiceCopy`); re-balances table widths.
- **Tests**: rewrite the "two-up landscape layout" describe block in [src/app/core/services/pdf.service.spec.ts](src/app/core/services/pdf.service.spec.ts) → "two-up portrait side-by-side layout". Assertions to flip: `pageOrientation === 'portrait'` (or absent — pdfmake's default is portrait), no `pageOrientation: 'landscape'`; canvas separator has `x1 === x2` (vertical line) with `y2 ≈ page height − vertical margins`; the "Cut along the dashed line" *text* check is removed (no label on the vertical separator); content-duplication counts (invoice number twice, GSTIN twice, etc.) remain unchanged.
- **Smoke test**: update the verification line in [docs/smoke-test.md](docs/smoke-test.md) step 5a to reference portrait A4 + side-by-side instead of landscape + top-bottom.
- **No data model changes**, no Firestore Rules / indexes changes.
- **Out of scope** (deferred — same as previous change):
  - Triplicate (3 copies per page).
  - Per-tenant toggle for the Original/Duplicate badges.
  - Email-friendly single-copy mode.
  - Many-line-item overflow handling. With ~806pt of vertical room per copy, the practical overflow limit is much higher than the previous landscape design — likely ~25+ line items before overflow — so this regression of the previous change's risk is now far less acute.
- **Supersedes**: `pdf-two-copies-landscape` is the change that introduced the two-copy layout. This change keeps everything from it *except* the orientation + separator axis. We do not archive that change first; we layer on top of it and rely on the spec deltas being additive.
