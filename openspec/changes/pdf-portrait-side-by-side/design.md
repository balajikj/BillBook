## Context

[pdf-two-copies-landscape](../pdf-two-copies-landscape/proposal.md) shipped a landscape A4 invoice PDF with two copies stacked top-to-bottom. The user has now clarified that the desired orientation is **portrait** and the copies should be **side-by-side** (left half = copy 1, right half = copy 2). Visually:

```
   ┌──────────────────────────┐         ┌──────────────────────────┐
   │       INVOICE COPY 1     │         │   COPY 1   ┊   COPY 2    │
   │                          │         │            ┊             │
   │  -  -  -  -  -  -  -     │   →     │   tall     ┊   tall      │
   │                          │         │   narrow   ┊   narrow    │
   │       INVOICE COPY 2     │         │   portrait ┊   portrait  │
   │                          │         │   shape    ┊   shape     │
   └──────────────────────────┘         └────────────┴─────────────┘
       LANDSCAPE (previous)                   PORTRAIT (this change)
```

The implementation work is concentrated almost entirely in `pdf.service.ts`. The per-copy content builder `buildInvoiceCopy()` introduced by the previous change is reused verbatim; only the document assembly and the separator change.

## Goals / Non-Goals

**Goals:**

- Portrait A4 invoice PDF.
- Two identical invoice copies on a single page, side-by-side (left/right halves).
- A vertical dashed cut line down the center gap.
- Each copy renders the same content per existing pdf-billing requirements (Bill-to, line items, totals, amount-in-words).
- Within-copy layout adjusts gracefully to the narrower (~270pt) column width — particularly the Bill-to+dates header which today is a 2-column block.
- Single page only (no overflow onto page 2 for the typical 1-5 line-item invoice).

**Non-Goals:**

- Per-tenant orientation choice (landscape vs portrait vs single-copy). Out of scope.
- Three-copies-per-page layouts (triplicate). Deferred.
- Dynamic font-shrinking when content overflows. Deferred.
- Rotated text on the separator label. Skipped — pdfmake's text rotation requires absolute positioning gymnastics for limited UX value; the vertical line speaks for itself.

## Decisions

### Decision 1: Portrait A4, default orientation

Set `pageSize: 'A4'` and either omit `pageOrientation` or set it explicitly to `'portrait'`. pdfmake defaults to portrait, so omitting works — but we set it explicitly for self-documentation and to override any prior landscape state if the code is partially reverted later.

**Rationale:** the user explicitly asked for vertical / portrait. No reason to be clever.

### Decision 2: Top-level pdfmake `columns` element with two copy stacks and a center separator

```ts
content: [{
  columns: [
    { stack: buildInvoiceCopy(invoice, company, 'ORIGINAL FOR RECIPIENT'), width: '*' },
    { stack: [verticalSeparator()], width: 'auto' },
    { stack: buildInvoiceCopy(invoice, company, 'DUPLICATE FOR SUPPLIER'), width: '*' }
  ],
  columnGap: 6
}]
```

The two `width: '*'` columns split the remaining horizontal space evenly. The middle column auto-sizes to the separator canvas width (a few points).

**Rationale:** pdfmake's `columns` is the idiomatic primitive for side-by-side content. Each column gets its own content flow and can contain nested tables, stacks, anything else.

**Alternative considered:** a 1-row table with two cells, separator drawn as a vertical border. Rejected — table-cell content has weirder vertical alignment and the column engine handles wrapping more naturally.

### Decision 3: Vertical separator as a canvas line

```ts
function verticalSeparator(): any {
  return {
    canvas: [
      { type: 'line', x1: 0, y1: 0, x2: 0, y2: 800,
        lineWidth: 0.5, lineColor: '#888',
        dash: { length: 4, space: 3 } }
    ]
  };
}
```

The `y2: 800` covers roughly the available vertical content area on portrait A4 (842 − 18 top − 18 bottom = 806). 800 is intentional — a hair short of the bottom margin so the dashed pattern terminates cleanly rather than touching the edge.

No text label. The vertical-line convention is universal; cluttering it with rotated text would add complexity for marginal UX gain.

**Rationale:** simple, deterministic, render-stable across pdfmake versions.

### Decision 4: Within-copy bill-to/dates header re-flows from two-column to stacked

Currently `buildInvoiceCopy` produces a `columns` block with the Bill-to block on the left and the invoice date + due date + status on the right. In a 270pt-wide column this leaves ~135pt per side — too narrow for full-address Bill-to lines or for date labels.

Refactor to:

```
[Bill to:]
[Customer name (bold)]
[Shop name]
[Full address — may wrap to 2 lines]
[GSTIN: ...]
[Phone: ...]
[Email]
[Invoice date: 2026-05-16        ← these three lines right-aligned
 Due date:     2026-05-30
 Status:       PENDING]
```

I.e. Bill-to block first as a single column, then the dates+status block right-aligned beneath it (still inside the copy). Same content, single-column flow.

**Rationale:** narrow columns demand vertical stacking. The visual hierarchy is preserved — the Bill-to block remains prominent at the top, dates are still grouped, status is still bold.

**Trade-off:** the previous design's "dates appear top-right" affordance is lost (operators sometimes scan there first). Acceptable — within a narrow column, top-down reading is the natural flow anyway.

### Decision 5: Table widths re-balance for ~270pt content width

Line items table widths within each copy:

- With HSN/SAC: `[*, 36, 22, 44, 56]` — description flexes; HSN/Qty/Unit/LineTotal numeric columns are minimal.
- Without HSN/SAC: `[*, 22, 44, 56]`.

Totals table width drops from `240` (landscape) to `auto` (sized by content), and the surrounding `columns` block right-aligns it within the copy:

```ts
{
  margin: [0, 4, 0, 0],
  columns: [
    { text: '' },
    { width: 'auto',
      table: { widths: ['auto', 'auto'], body: totalsBody },
      layout: 'lightHorizontalLines' }
  ]
}
```

**Rationale:** the totals rows are short (a label + a small currency amount) and benefit from auto-sizing to their content rather than reserving a fixed 240pt that won't fit anyway in a 270pt column.

### Decision 6: Typography is unchanged

Body 8pt, company header 13pt, invoice header 11pt, footer 7pt — all retained from the previous change. The narrower column doesn't demand smaller fonts; instead it demands narrower table columns and a stacked header (Decisions 4 and 5).

**Rationale:** preserving readability matters more than aggressive shrinking. With ~806pt of vertical room per copy, we're nowhere near the practical overflow point for the typical 1-5 line-item invoice.

### Decision 7: SHOW_COPY_LABELS unchanged

The `SHOW_COPY_LABELS` constant (currently `false`) is unchanged. When flipped to `true`, each copy still renders an `ORIGINAL FOR RECIPIENT` / `DUPLICATE FOR SUPPLIER` badge at top-right. In a narrow portrait column the badge may wrap onto two lines — acceptable, since labels are off by default.

**Rationale:** preserve the existing toggle. No reason to gate it differently.

## Risks / Trade-offs

- **[Description column may wrap aggressively in a narrow table]** → in 270pt − ~160pt (the four numeric columns combined) the description gets ~110pt. Long descriptions ("COURIER SERVICE-PARCEL FROM CHENNAI TO DELHI 50KG") will wrap to 2-3 lines. Acceptable trade-off; wrapping is the correct rendering, not truncation.
- **[Bill-to lines wrap]** → full addresses ("ARUNACHAL LCV AUTO SPARES NO-9, AVANIYAPURAM MAIN ROAD, THIRUPPARANKUNDRAM MADURAI-625005") will definitely wrap at ~270pt. Acceptable — same content, just more lines.
- **[Totals table jitters with currency code changes]** → using `width: 'auto'` means the table width depends on the longest amount string. For an INR-only tenant this is stable; mixing currencies between invoices produces slight visual jitter between PDFs. Cosmetic, not functional.
- **[pdfmake's `columns` doesn't handle full-page vertical balance gracefully]** → if one copy is taller than the other (shouldn't happen because they render identical content, but if a future divergence happened), the column engine doesn't auto-balance. We render the same content in both columns, so the column heights are equal by construction.
- **[Loss of "dates top-right" visual affordance]** → operators who learned the previous layout may briefly hunt for invoice/due dates. Documented in Decision 4 trade-off; acceptable.
- **[Test asserting `pageOrientation === 'landscape'` from the previous change will fail]** → covered explicitly: those tests are rewritten.

## Migration Plan

Presentation-only. No data migration.

**Deploy steps:**

1. Land the `pdf.service.ts` rewrite (orientation, columns layout, vertical separator, stacked header, table widths).
2. Land the test rewrite (orientation, separator-axis flip, content-duplication count unchanged).
3. `npx vitest run src/app/core/services/pdf.service.spec.ts` — green.
4. `npx ng build --configuration=production` — clean.
5. Visually verify a sample PDF: portrait A4, copies side-by-side, vertical cut line, all content readable.
6. `npm run deploy:hosting`.

**Rollback:** `npx firebase hosting:rollback` reverts. The data model is untouched; no data migration to undo.

## Open Questions

- **Restoring "dates top-right" via a smaller dedicated column inside the copy** — worth doing if the stacked-header feels visually heavy when operators see the printed page. Defer until visual feedback.
- **Auto-rotate when invoice has many line items** — if a tenant routinely produces 10+ line items, the narrow column may not be ideal. Could fall back to single-copy portrait in that case. Defer; instrument with feedback first.
- **Vertical separator label rotated 90°** — visually nicer for some, brittle to implement in pdfmake (requires absolute positioning + manual y-offset). Defer.
- **Per-tenant orientation choice** — same open question as the previous change. Defer until a non-Indian tenant exists.
