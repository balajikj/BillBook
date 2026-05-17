## ADDED Requirements

### Requirement: Each invoice copy renders a configurable Header band

Each copy of the invoice PDF SHALL render a **Header band** that draws values from the company's invoice template document (`/companies/{cid}/private/invoice-template`). The band MUST appear between the company name and the existing invoice-header row (invoice number + dates). Only fields that are populated for the tenant MUST appear; empty fields produce no line and no separator character.

#### Scenario: Header band shows phone, email, website, address, and tax IDs when configured

- **WHEN** a PDF is generated for an invoice whose tenant has `header.phone = '+91 9876543210'`, `header.email = 'sales@acme.in'`, `header.website = 'acme.in'`, `header.addressLines = ['12 MG Road', 'Bengaluru 560001']`, and `header.gstin = '29ABCDE1234F1Z5'`
- **THEN** each of the two copies contains, in order: the company name; the phone number; an `email · website` line; the two address lines; a line containing `GSTIN: 29ABCDE1234F1Z5`

#### Scenario: Header band collapses to nothing when the profile is empty

- **WHEN** a PDF is generated for an invoice whose tenant has NO invoice-template document (or all header fields blank)
- **THEN** the layout above the bill-to block is identical to the pre-change layout
- **AND** no blank lines or stray separator characters appear

#### Scenario: Tax-ID line shows only the populated identifiers

- **WHEN** the tenant has `header.gstin` populated but `header.pan` and `header.cin` blank
- **THEN** the tax-ID line reads `GSTIN: <value>` with no trailing separator and no `PAN:` or `CIN:` labels

### Requirement: Each invoice copy renders a configurable Footer band with bank and terms info

Each copy of the invoice PDF SHALL render a **Footer band** below the amount-in-words line (or below the totals row when amount-in-words is absent). The band SHALL contain a left column with **Bank Details** (bank account name, bank name, account number, IFSC, branch, UPI ID — each line shown only when populated) and a right column with **Terms & Conditions** (free-form, preserving line breaks from the saved value). If **both** columns would be empty, the entire band MUST be omitted (no headings, no whitespace artefact).

#### Scenario: Footer band shows bank details when configured

- **WHEN** a PDF is generated for a tenant whose profile has `footer.bankAccountName = 'Acme Co.'`, `footer.bankName = 'HDFC'`, `footer.accountNumber = '50100123456789'`, `footer.ifsc = 'HDFC0000123'`, `footer.upiId = 'acme@hdfcbank'`
- **THEN** each copy includes a `Bank Details` heading
- **AND** the heading is followed by `Account Name: Acme Co.`, `Bank: HDFC`, `Account No.: 50100123456789`, `IFSC: HDFC0000123`, `UPI: acme@hdfcbank` — only populated fields appear

#### Scenario: Footer band shows terms when configured

- **WHEN** the tenant has `termsAndConditions = 'Payment due within 14 days.\nLate fee 1% per week.'`
- **THEN** each copy includes a `Terms & Conditions` heading followed by the two terms lines with the line break preserved

#### Scenario: Footer band is omitted when both bank and terms are empty

- **WHEN** a tenant has no bank details and no terms configured
- **THEN** the PDF contains no `Bank Details` heading and no `Terms & Conditions` heading in either copy
- **AND** the layout below the totals row goes directly into the signature block (or amount-in-words footer if there is also no signature configured)

### Requirement: Each invoice copy renders a Signature block in the lower-right

Each copy of the invoice PDF SHALL render a **Signature block** anchored to the lower-right of the copy. The block MUST contain:

- A line `For <Company Name>` (the company name from the gate document).
- A vertical gap of approximately 36pt reserved for a wet signature or stamp.
- A line with the configured `signature.signatoryName` if set, OR nothing if unset.
- A line with `signature.signatoryTitle` if set, OR the default `Authorized Signatory` if unset.

The Signature block MUST always render the `For <Company Name>` line and the default `Authorized Signatory` line — these are the minimum for a printable invoice — even when the profile is otherwise empty.

#### Scenario: Signature block with configured signatory

- **WHEN** a PDF is generated for a tenant whose profile has `signature.signatoryName = 'Alice Smith'` and `signature.signatoryTitle = 'Director'`
- **THEN** each copy's signature block contains `For <Company Name>` and (below the gap) `Alice Smith` then `Director`

#### Scenario: Signature block falls back to defaults

- **WHEN** the tenant has no signature configuration
- **THEN** each copy still contains `For <Company Name>` and `Authorized Signatory` below the gap
- **AND** no signatory name line appears (no blank line)

### Requirement: Disclaimer renders as small italic text under the signature

When `disclaimer` is set on the profile, each copy of the PDF SHALL render that text in small italic font (~7pt) under the signature block, spanning the full width of the copy. Line breaks in the stored value MUST be preserved. When `disclaimer` is empty, no line is rendered.

#### Scenario: Disclaimer renders when configured

- **WHEN** a PDF is generated for a tenant whose profile has `disclaimer = 'Subject to Bengaluru jurisdiction. Goods once sold cannot be returned.'`
- **THEN** each copy includes the disclaimer text in italic ~7pt font below the signature block

#### Scenario: No disclaimer line when empty

- **WHEN** the tenant has no disclaimer configured
- **THEN** no italic disclaimer line is present in either copy

### Requirement: PDF generator accepts the invoice template as an input

The `PdfService.generateInvoicePdf` API SHALL accept an `InvoiceTemplate` (or equivalent) input alongside the existing `invoice` and `company` inputs. The generator MUST NOT perform Firestore reads of its own; the caller is responsible for resolving the template and passing it in. Passing `null` or `undefined` MUST produce the same PDF as a tenant with a fully empty profile.

#### Scenario: Generator is purely a function of its inputs

- **WHEN** `generateInvoicePdf(invoice, company, profile)` is called
- **THEN** the function performs no Firestore reads
- **AND** identical inputs produce byte-identical output (modulo the timestamp in the generated-at footer)

#### Scenario: Generator tolerates a null profile

- **WHEN** `generateInvoicePdf(invoice, company, null)` is called
- **THEN** the function produces a valid PDF
- **AND** the result is the same as passing an empty `InvoiceTemplate` object

### Requirement: New bands are additive — existing portrait two-copies layout is preserved

The existing portrait two-copies-side-by-side layout (from the prior `pdf-portrait-side-by-side` change) MUST be preserved. The new bands MUST insert into each copy without changing the page orientation, the two-copies arrangement, the vertical dashed separator, the line-items table, the totals block, or the amount-in-words footer.

#### Scenario: Portrait two-copies arrangement is unchanged

- **WHEN** a PDF is generated for any invoice (with or without a configured template)
- **THEN** the page orientation is `'portrait'` and the page contains exactly two side-by-side copies separated by a vertical dashed line, matching the prior layout

#### Scenario: An invoice with an empty profile renders identically to the prior layout

- **WHEN** a PDF is generated for an invoice whose tenant has no profile document
- **THEN** the visible content (excluding the generated-at footer timestamp) is byte-identical to what the prior `pdf-portrait-side-by-side` change produced for the same invoice
