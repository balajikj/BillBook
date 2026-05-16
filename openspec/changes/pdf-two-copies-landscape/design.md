## Context

The current invoice PDF is a portrait A4 (595pt × 842pt) with default `pdfmake` margins (`[40, 60, 40, 60]`) and body text at 10pt. For a typical small-business invoice with 1-3 line items, the visible content occupies roughly the upper third of the page; the rest is white space. Tenants who print invoices for their own paper records — common practice in Indian shops — end up wasting one A4 sheet per invoice.

The standard remedy in Indian GST workflows is the "two-up" tax invoice: one sheet contains an identical pair of invoices stacked vertically. The supplier keeps one half, the recipient takes the other, and the operator tears or cuts along the middle line. This is conventional enough that pre-printed two-up books are still sold in stationery shops.

Implementation-wise, pdfmake makes this straightforward: a content array can repeat the same block twice with a separator in between, and `pageOrientation: 'landscape'` flips the canvas to 842pt × 595pt without any other manual sizing.

## Goals / Non-Goals

**Goals:**

- Every invoice PDF download produces a **single landscape A4 page** containing two complete copies of the invoice (one in the upper half, one in the lower half).
- Each copy contains the **same content as today** (Bill-to header, dates, line items table, totals breakdown including CGST/SGST when applicable, amount-in-words footer).
- Typography is sized so the content fits within roughly half the landscape page height (~270pt usable per copy after margins) without truncation for the typical 1-5 line-item invoice.
- A clear **dashed cut line** sits between the two copies so an operator can fold or cut.
- The change is **purely presentational**. No data-model changes. No API signature changes.

**Non-Goals:**

- Triplicate (three-copies-per-page) or quadruplicate layouts.
- Per-tenant or per-invoice toggle for portrait single-copy vs. landscape two-up. Documented as a future open question.
- Wide-table invoices with many columns or many line items needing multiple pages. If an invoice has too many lines to fit in one half-page, the two-up layout will overflow onto a second page — acceptable trade-off for the MVP.
- Watermarks, page headers, or repeated company logos on each copy.
- Custom paper sizes (Letter, Legal).
- A toggle to print only one copy (e.g. for emailing). Out of scope — a separate change could add a "single-copy email mode".

## Decisions

### Decision 1: Page orientation is `landscape` A4

```ts
docDefinition.pageOrientation = 'landscape';
docDefinition.pageSize = 'A4';
```

pdfmake handles the rotation; the resulting page is 842pt × 595pt.

**Rationale:** landscape is the only practical orientation for two-up that keeps each copy near the typical portrait-invoice proportions when halved horizontally. Stacking two portrait-shaped copies in landscape leaves each copy approximately landscape-ratio (~411pt × ~270pt), which suits short invoices with a single-line items table.

**Alternative considered:** Two copies on a portrait A4 (stacked vertically, each ~411pt tall). Rejected — gives narrower copies (~520pt × ~411pt each) which feels cramped for the totals table; also reduces the readable column widths for the line items table.

### Decision 2: Reuse one content builder for both copies

Refactor the existing `buildInvoiceDocDefinition` so the invoice body (header + bill-to + dates + line items + totals + amount-in-words) is extracted into a pure helper:

```ts
function buildInvoiceCopy(invoice, company): Content[] { ... }
```

`buildInvoiceDocDefinition` then assembles:

```ts
[
  ...buildInvoiceCopy(invoice, company),
  separator(),                       // dashed line + cut label
  ...buildInvoiceCopy(invoice, company)
]
```

**Rationale:** single source of truth for the invoice block; one change to the content layout updates both copies automatically. No risk of the two copies diverging.

**Alternative considered:** pdfmake supports a table with two rows where each row contains a sub-document. Rejected — table-based layout makes vertical-space allocation awkward and adds nested table complexity. Linear stack is simpler.

### Decision 3: Typography is global, defined in `docDefinition.styles` and `defaultStyle`

```ts
defaultStyle: { fontSize: 8 }                     // was 10
styles: {
  companyHeader: { fontSize: 13, bold: true },    // was 16
  invoiceHeader: { fontSize: 11, margin: [0, 4, 0, 0] }, // was 14
  footer:        { fontSize: 7, color: '#888' }   // was 8
}
```

Page margins also tighten: `[24, 18, 24, 18]` (was `[40, 60, 40, 60]`).

Table cell padding and the small inter-section margins inside `buildInvoiceCopy` are also tightened proportionally.

**Rationale:** the typography drop is exactly large enough so a single invoice copy (with bill-to block, line items table of up to 5 rows, totals, and amount-in-words) fits inside ~270pt of vertical space. Empirically tested against the sample invoice in the user's screenshot.

**Trade-off:** invoices with **more than ~6 line items** may push the second copy onto a second page. We document this as a known limit. If it becomes a real problem we can shrink fonts further or add a "compact mode" toggle — but for the bulk of the target audience (1-3 line items), 8pt body is comfortable.

### Decision 4: Separator is a one-line dashed canvas element with a centered label

```ts
{
  margin: [0, 6, 0, 6],
  stack: [
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 794, y2: 0, lineWidth: 0.5, dash: { length: 4, space: 3 }, lineColor: '#888' }] },
    { text: '✂ Cut along the dashed line', alignment: 'center', fontSize: 7, color: '#888', margin: [0, 2, 0, 0] }
  ]
}
```

The `x2` of 794pt corresponds to the landscape A4 page width minus the left+right margins (842 − 24 − 24 = 794).

**Rationale:** unambiguous visual cue. The dashed pattern + label combination matches how Indian invoice books are pre-perforated, so operators recognize the convention immediately.

### Decision 5: "Original / Duplicate" labels are off by default, gated by a constant

A constant at the top of `pdf.service.ts`:

```ts
const SHOW_COPY_LABELS = false; // flip to true to print "ORIGINAL"/"DUPLICATE" tags
```

When `true`, each copy's top-right corner shows a small badge (`ORIGINAL FOR RECIPIENT` on the upper copy, `DUPLICATE FOR SUPPLIER` on the lower).

**Rationale:** the user didn't explicitly request these labels, but they're standard for Indian B2B tax invoices. Many shops want them; some don't (B2C). Defaulting off keeps the visual minimal; a one-line code flip enables them. Promoting this to a tenant-level Firestore setting is a follow-up if demand warrants it (Open Question).

### Decision 6: Both legacy and India-GST invoices use the new layout

Whether an invoice has `gstPercent` or not, it renders two-up landscape. The content branching inside `buildInvoiceCopy` (India vs legacy totals block) is preserved as-is.

**Rationale:** the layout change is a presentation-level concern. Tenants on either flow benefit equally from paper savings.

## Risks / Trade-offs

- **[Many line items overflow the half-page]** → 6+ line items risk pushing the second copy onto page 2. Mitigation: documented limit; if needed, a follow-up change can detect overflow and fall back to a "single copy per page in landscape" layout, or shrink to 7pt body. For the target audience (small shops with 1-3 line items per invoice) this is not a practical concern.
- **[Very long shop names / GSTINs / addresses wrap unpredictably]** → at 8pt body the bill-to lines may wrap. Acceptable — operators trim addresses to two lines manually if needed, same as today.
- **[Font scaling on some PDF viewers can render 8pt body fuzzy]** → modern viewers handle it; very old desktop print drivers may anti-alias poorly. Risk is small; user can zoom in. We don't downgrade typography further than 8pt.
- **[Reviewers/recipients confused by two copies on one sheet]** → mitigated by the cut-line label and (optionally) the Original/Duplicate badges. Both are standard Indian invoicing patterns.
- **[Existing PDF tests check for content presence]** → the existing test assertions are content-based (substring checks). Tests will pass as long as the content is preserved; we extend them to assert layout properties (orientation, repeat count).
- **[`Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` width slightly changes between locales]** → already the case today; no regression. The number columns still fit in the proportions set by the table-widths config.

## Migration Plan

This change is presentation-only; no data migration, no schema change, no rules change.

**Deploy steps:**

1. Land the `pdf.service.ts` refactor and the spec test updates.
2. Run vitest — expect green.
3. Run `ng build --configuration=production` — expect green.
4. Manually generate a sample PDF from the dev server for the user's existing invoice (`INV-2026-0005`) and visually confirm: landscape A4, two copies, cut line visible, all amounts/numbers match the on-screen detail view, no overflow.
5. Deploy hosting only (`npm run deploy:hosting`). No rules or function changes.

**Rollback:**

`npx firebase hosting:rollback` reverts the hosting deployment. Since there's no data model change, rollback is risk-free.

## Open Questions

- **Tenant-level toggle for label badges**: do specific tenants want the `ORIGINAL FOR RECIPIENT` / `DUPLICATE FOR SUPPLIER` badges? If yes, promote `SHOW_COPY_LABELS` from a code constant to a Firestore-stored company setting in a follow-up change.
- **Triplicate option**: some Indian GST workflows want three copies (Original / Duplicate / Triplicate for Transporter). Should we generalize to "N copies per page"? Recommended deferral — the dominant case is duplicate; triplicate adds complexity for a niche subset.
- **Email-friendly single-copy mode**: when emailing an invoice, two-up is wasteful. Should the PDF service take an optional `copies: 1 | 2` argument? Recommended deferral until we ship invoice emailing (not currently scoped).
- **Per-tenant orientation default**: international tenants on Letter paper or who don't want two-up at all. Out of scope — the current target audience is Indian small businesses. Revisit when we have non-Indian pilots.
- **Auto-shrink for invoices with many line items**: should the layout dynamically shrink fonts further as line-item count grows, or fall back to single-copy? Recommended deferral; current sizing handles ~5 line items comfortably.
