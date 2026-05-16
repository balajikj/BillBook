## MODIFIED Requirements

### Requirement: PDF is rendered on a landscape A4 page

The generated PDF SHALL use **portrait** orientation on A4 paper (595pt × 842pt). The `pageOrientation` field on the pdfmake document definition MUST be set to `'portrait'` (or omitted, since pdfmake defaults to portrait). The `pageSize` MUST be `'A4'`. The default `pageMargins` SHALL remain `[24, 18, 24, 18]` (left, top, right, bottom) so the vertical margin tightening from the previous change is preserved.

#### Scenario: PDF page orientation is portrait

- **WHEN** a PDF is generated for any invoice
- **THEN** the pdfmake document definition has `pageOrientation: 'portrait'` (or no `pageOrientation` key at all, since pdfmake defaults to portrait)
- **AND** the document does NOT have `pageOrientation: 'landscape'`

#### Scenario: Page size and margins are preserved

- **WHEN** a PDF is generated for any invoice
- **THEN** `pageSize === 'A4'`
- **AND** `pageMargins` equals `[24, 18, 24, 18]`

### Requirement: PDF contains two identical copies of the invoice on a single page

The generated PDF SHALL contain two identical renderings of the same invoice on the same physical page, arranged **side-by-side** — the **first copy** (`ORIGINAL FOR RECIPIENT` when copy labels are enabled) occupies the **left half**, the **second copy** (`DUPLICATE FOR SUPPLIER`) occupies the **right half**. Both copies SHALL include the complete bill-to block, dates, line items table, totals breakdown, and amount-in-words footer — there is no abbreviation or content difference between the two copies. The two copies SHALL be placed inside a single pdfmake `columns` element at the top of the content array.

#### Scenario: PDF lays out the two copies side-by-side via a top-level `columns` element

- **WHEN** a PDF is generated for any invoice
- **THEN** the first content item is a `columns` element containing exactly three columns: copy 1 (left, width `*`), the separator (middle, auto width), copy 2 (right, width `*`)

#### Scenario: PDF contains two copies of the same invoice

- **WHEN** a PDF is generated for invoice `INV-2026-0005`
- **THEN** the rendered content array contains the substring `Invoice INV-2026-0005` exactly twice
- **AND** the rendered content array contains the customer-name string from the bill-to block exactly twice
- **AND** the rendered content array contains the grand-total amount string exactly twice

#### Scenario: Both copies share the same totals layout

- **WHEN** a PDF is generated for an India-style invoice with `gstPercent === 18`
- **THEN** the rendered content includes the CGST row text exactly twice (once in each copy)
- **AND** the rendered content includes the SGST row text exactly twice
- **AND** the rendered content includes the Grand Total row text exactly twice

#### Scenario: Legacy invoice also renders as two copies

- **WHEN** a PDF is generated for a legacy invoice (no `gstPercent` set)
- **THEN** the rendered content includes the `Total` row text exactly twice
- **AND** the layout is still portrait with two copies side-by-side on one page

### Requirement: A visual separator divides the two copies

Between the left copy and the right copy the PDF SHALL render a single **vertical** dashed line spanning the available page height. The separator MUST be drawn as a pdfmake `canvas` element with `x1 === x2` (a vertical line), `y1 === 0`, and `y2` set near the available page height (~800pt). The line MUST use `lineWidth: 0.5`, `lineColor: '#888'`, and `dash: { length: 4, space: 3 }`. No text label accompanies the separator in this orientation (rotating text in pdfmake is brittle and the vertical-line convention is visually self-explanatory).

#### Scenario: Separator appears once between the two copies

- **WHEN** a PDF is generated for any invoice
- **THEN** the rendered content includes exactly one canvas element whose `x1 === x2` (vertical line)
- **AND** the rendered content does NOT include the string `Cut along the dashed line` (no text label on the vertical separator)

#### Scenario: Separator dashed line spans most of the page height

- **WHEN** a PDF is generated for any invoice
- **THEN** the canvas element rendering the separator has `y2 >= 700` (covers the bulk of the portrait page height of 842pt minus margins)
- **AND** the line uses a dashed style (`dash: { length: 4, space: 3 }`)

## ADDED Requirements

### Requirement: Within-copy bill-to and dates header stacks vertically

Inside each invoice copy the header SHALL be rendered as a single-column vertical stack: the Bill-to block first (label, customer name, shop, full address, GSTIN, phone, email — omitting fields not present), then the invoice date / due date / status block right-aligned beneath it. The previous two-column "bill-to on left, dates on right" layout MUST NOT be used, because each copy is now ~270pt wide which is too narrow for two side-by-side columns.

#### Scenario: Bill-to block appears before the dates block in each copy

- **WHEN** a PDF is generated for any invoice
- **THEN** in each copy's content array the index of the `Bill to:` text comes before the index of the `Invoice date:` text
- **AND** the dates block does NOT appear as a right-side column of a `columns` element parallel to the bill-to block

#### Scenario: Dates block is right-aligned within the copy

- **WHEN** a PDF is generated for any invoice
- **THEN** the `Invoice date:`, `Due date:`, and `Status:` lines each have `alignment: 'right'`

### Requirement: Line items and totals tables use narrow-column widths

Inside each copy the line items table SHALL use column widths sized for a ~270pt content area: `[*, 36, 22, 44, 56]` when the HSN/SAC column is present, `[*, 22, 44, 56]` otherwise. The totals table to the right of the line items SHALL use auto widths (`['auto', 'auto']`) so it shrinks to the longest amount string rather than reserving a fixed 240pt block that won't fit in the narrow column.

#### Scenario: HSN-present line items table uses the narrow width recipe

- **WHEN** a PDF is generated for an invoice where at least one line item has `hsnSac`
- **THEN** the line items table's `widths` array equals `['*', 36, 22, 44, 56]`

#### Scenario: No-HSN line items table uses the narrow width recipe

- **WHEN** a PDF is generated for an invoice where no line item has `hsnSac`
- **THEN** the line items table's `widths` array equals `['*', 22, 44, 56]`

#### Scenario: Totals table uses auto widths

- **WHEN** a PDF is generated for any invoice
- **THEN** the totals table within each copy has `widths: ['auto', 'auto']`
