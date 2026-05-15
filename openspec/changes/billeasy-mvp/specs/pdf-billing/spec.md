## ADDED Requirements

### Requirement: Users can download an invoice as a PDF

The system SHALL provide a "Download PDF" action on each invoice detail view that generates and downloads a PDF representation of the invoice. PDF generation MUST run entirely in the browser (no server call) using `pdfmake` (or equivalent client-side library).

#### Scenario: User downloads a PDF for an existing invoice

- **WHEN** an authorized user clicks "Download PDF" on invoice `INV-2026-0001`
- **THEN** the browser generates a PDF document named `INV-2026-0001.pdf` (or similar)
- **AND** the file is offered for download
- **AND** no server request is made for the PDF content

#### Scenario: PDF generation is available to both admin and non-admin roles

- **WHEN** a company user opens an invoice they are authorized to read
- **THEN** the "Download PDF" action is available
- **AND** clicking it produces the same PDF as it would for a company admin

### Requirement: PDF content includes all required invoice information

The generated PDF SHALL include, at minimum: company name and default currency, invoice number, issue date, due date, customer name and address (snapshot), line items (description, quantity, unit price, line total), subtotal, total, currency code, payment status (`paid`, `pending`, or `overdue` derived), and a footer with the invoice's `createdAt` timestamp.

#### Scenario: PDF contains the invoice number and key metadata

- **WHEN** a PDF is generated for `INV-2026-0001`
- **THEN** the document header includes `INV-2026-0001`
- **AND** the issue date and due date appear formatted in the user's locale or ISO format
- **AND** the customer name and address appear as snapshotted on the invoice

#### Scenario: PDF line items match invoice line items

- **WHEN** a PDF is generated for an invoice with three line items
- **THEN** the PDF contains a table with three rows, each showing description, quantity, unit price, and line total
- **AND** the subtotal and total appear below the table
- **AND** the total uses the invoice's currency code

#### Scenario: PDF reflects current derived status

- **WHEN** a PDF is generated for an invoice with `status === 'pending'` and `dueDate < today`
- **THEN** the PDF shows the status as `OVERDUE` (derived at render time)

### Requirement: PDF generation is resilient to absent optional fields

The system SHALL produce a valid PDF even when optional invoice fields are missing (e.g. customer has no address, line item has no description). Missing fields MUST be rendered as empty space or omitted rather than raising an error.

#### Scenario: PDF generates for an invoice with missing customer address

- **WHEN** a PDF is generated for an invoice whose customer snapshot has no address
- **THEN** the PDF still generates and downloads successfully
- **AND** the address area is rendered as empty (or the line is omitted entirely)
