## ADDED Requirements

### Requirement: PDF is rendered on a landscape A4 page

The generated PDF SHALL use `landscape` orientation on A4 paper (842pt × 595pt). The default `pageMargins` SHALL be set to a tight `[24, 18, 24, 18]` to maximize the usable area for the two stacked invoice copies.

#### Scenario: PDF page orientation is landscape

- **WHEN** a PDF is generated for any invoice
- **THEN** the pdfmake document definition has `pageOrientation: 'landscape'` and `pageSize: 'A4'`

#### Scenario: PDF page margins are tightened

- **WHEN** a PDF is generated for any invoice
- **THEN** the document definition has `pageMargins: [24, 18, 24, 18]` (left, top, right, bottom)

### Requirement: PDF contains two identical copies of the invoice on a single page

The generated PDF SHALL contain two identical renderings of the same invoice on the same physical page: the **first copy** occupies the upper half, the **second copy** occupies the lower half. Both copies SHALL include the complete bill-to block, dates, line items table, totals breakdown, and amount-in-words footer — there is no abbreviation or content difference between the two copies.

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
- **AND** the layout is still landscape with two copies on one page

### Requirement: A visual separator divides the two copies

Between the upper copy and the lower copy the PDF SHALL render a single dashed horizontal line spanning the available page width with a small `✂ Cut along the dashed line` label centered immediately below it. The label SHALL use the smallest body font size (≤7pt) and a muted grey color so it does not compete with invoice content.

#### Scenario: Separator appears once between the two copies

- **WHEN** a PDF is generated for any invoice
- **THEN** the rendered content includes the string `Cut along the dashed line` exactly once

#### Scenario: Separator dashed line spans the page width minus margins

- **WHEN** a PDF is generated for any invoice
- **THEN** the canvas element rendering the separator has a horizontal line whose `x2 - x1` equals `pageWidth - leftMargin - rightMargin` (`842 - 24 - 24 = 794`)
- **AND** the line uses a dashed style (`dash: { length: 4, space: 3 }`)

### Requirement: Typography is tightened to fit two copies on one page

The generated PDF SHALL use the following font sizes, which are tighter than the original portrait-single-copy defaults: default body 8pt, company header 13pt, invoice header 11pt, footer 7pt. The styles SHALL be declared in the pdfmake document definition's `defaultStyle` and `styles` objects so they apply consistently across both copies.

#### Scenario: Body text is 8pt

- **WHEN** a PDF is generated for any invoice
- **THEN** `docDefinition.defaultStyle.fontSize === 8`

#### Scenario: Company header is 13pt

- **WHEN** a PDF is generated for any invoice
- **THEN** the `companyHeader` style has `fontSize: 13`

#### Scenario: Invoice header is 11pt

- **WHEN** a PDF is generated for any invoice
- **THEN** the `invoiceHeader` style has `fontSize: 11`

### Requirement: Content of each copy preserves all existing invoice fields

Inside each of the two copies the PDF SHALL preserve every content requirement established by the existing pdf-billing specs: the Bill-to block (name, shop, full address, GSTIN, phone, email — omitting fields not present on the customer snapshot), the company name + invoice number + status + dates header, the line items table with HSN/SAC column when applicable, the totals breakdown (Subtotal, CGST, SGST, Other Charges, Round Off, Grand Total — zero-value rows omitted), and the amount-in-words footer for India-style invoices. No content requirements are weakened by this change; only the layout (orientation + duplication) is added.

#### Scenario: India-style content fully present in each copy

- **WHEN** a PDF is generated for an India-style invoice with GSTIN, HSN/SAC line items, and 18% GST
- **THEN** each copy of the invoice contains: the company name, the invoice number, the customer name with `GSTIN: ...` label, the `Phone: ...` label, the `HSN/SAC` column header (because at least one line carries an HSN), the `CGST (9%)` and `SGST (9%)` total rows, the `Grand Total` row, and the `Amount in words:` footer

#### Scenario: Legacy content fully present in each copy

- **WHEN** a PDF is generated for a legacy invoice (no `gstPercent`)
- **THEN** each copy contains the Subtotal row and the Total row (no CGST, no SGST, no Amount-in-words footer)
