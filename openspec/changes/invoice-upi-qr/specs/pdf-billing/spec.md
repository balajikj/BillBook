## ADDED Requirements

### Requirement: PDF embeds a UPI QR code when the tenant has UPI configured and the invoice is INR

The invoice PDF SHALL embed a UPI payment QR code in the top-right corner of each invoice copy when BOTH of the following are true:

1. The invoice template has a non-empty `footer.upiId`.
2. The invoice's `currency` is exactly `INR` (UPI supports INR only).

The QR MUST render regardless of the invoice's `status` (`pending`, `overdue`, or `paid`) — the recipient may want to scan an already-paid invoice for reference or record-keeping. If either of the two gating conditions above is false, no QR area MUST be rendered — no caption, no whitespace — and the layout MUST be identical to its pre-change form.

#### Scenario: QR appears when all conditions hold

- **WHEN** a PDF is generated for an invoice with `currency: 'INR'`, `status: 'pending'`, and the tenant template has `footer.upiId: 'acme@hdfcbank'`
- **THEN** each of the two invoice copies contains a square QR image in the Bank Details column under the bank fields
- **AND** a caption `Scan to pay` appears directly above the QR

#### Scenario: QR is suppressed when invoice currency is not INR

- **WHEN** a PDF is generated for an invoice with `currency: 'USD'` while the tenant has `footer.upiId` configured
- **THEN** no QR image is embedded
- **AND** no `Scan to pay` caption is rendered
- **AND** the Bank Details column's visible content is identical to its pre-change layout for the same invoice + profile

#### Scenario: QR is still rendered on a paid invoice

- **WHEN** a PDF is generated for an invoice with `status: 'paid'`, `currency: 'INR'`, and the tenant has `footer.upiId` configured
- **THEN** the QR is embedded
- **AND** the `Scan to pay` caption is rendered above it

#### Scenario: QR is suppressed when the tenant has no UPI ID

- **WHEN** a PDF is generated for an invoice with `currency: 'INR'`, `status: 'pending'`, and the tenant template has no `footer.upiId` (or it is an empty string)
- **THEN** no QR is embedded
- **AND** no `Scan to pay` caption is rendered

### Requirement: QR payload is a well-formed UPI deep-link

The QR's payload SHALL be a single URL of the form `upi://pay?pa=<vpa>&pn=<payee_name>&am=<amount>&cu=INR&tn=<note>` where `pa`, `pn`, and `tn` values are URL-encoded. The URL MUST contain no other parameters.

#### Scenario: Payload includes payee, name, amount, currency, and note

- **WHEN** a QR is generated for invoice `INV-2026-0042` with grand total `1227.50`, company name `Acme Co.`, and `footer.upiId: 'acme@hdfcbank'`
- **THEN** the QR decodes to a string starting with `upi://pay?`
- **AND** the decoded URL's query parameters contain `pa=acme@hdfcbank`, `pn=Acme%20Co.`, `am=1227.50`, `cu=INR`, `tn=INV-2026-0042`

#### Scenario: Amount with no fractional part is encoded without trailing zeroes

- **WHEN** a QR is generated for an invoice whose grand total is exactly `1227`
- **THEN** the decoded URL contains `am=1227` (not `am=1227.00`)

#### Scenario: Payee name with special characters is URL-encoded

- **WHEN** the company name is `Acme & Co. (India) Pvt. Ltd.`
- **THEN** the decoded URL's `pn` parameter is `Acme%20%26%20Co.%20(India)%20Pvt.%20Ltd.`

### Requirement: QR image is embedded as a 72-pt monochrome PNG inside each invoice copy

The QR SHALL be embedded into the pdfmake document as an `image` node whose value is a base64 PNG data URL. The image's rendered width and height MUST both be approximately 72 pt (~25 mm at 72 DPI). The QR MUST appear inside the Bank Details column of the footer band, NOT inside the Signature column.

#### Scenario: QR is sized 72×72 pt

- **WHEN** any PDF is generated where the QR is rendered
- **THEN** the pdfmake node for the QR has `width: 72` and `height: 72` (or equivalent sizing that produces ~72 pt output)

#### Scenario: QR is inside the Bank Details column, not the Signature column

- **WHEN** any PDF is generated where the QR is rendered
- **THEN** the QR appears below the existing bank fields in the same column as them
- **AND** the Signature block (`For <Company>` + signatory) remains in its own column to the right

### Requirement: QR rendering is async and additive to the existing layout

The PDF generator (`PdfService.generateInvoicePdf`) SHALL produce the QR data URL asynchronously before constructing the pdfmake document definition. The portrait two-copies-side-by-side layout (from `pdf-portrait-side-by-side`), the header band (from `invoice-branding`), and the footer band's Bank Details / Signature columns MUST remain unchanged for any invoice + profile combination that does not satisfy the QR-rendering conditions.

#### Scenario: Invoice without UPI configured renders unchanged

- **WHEN** a PDF is generated for an invoice in a tenant whose profile has no `footer.upiId` configured
- **THEN** the rendered content is byte-identical to what the prior `invoice-branding` / `admin-company-settings` chain would produce (excluding the generated-at timestamp)

#### Scenario: PDF download still resolves a single Promise

- **WHEN** the user clicks Download PDF on an invoice that does render a QR
- **THEN** `generateInvoicePdf` resolves a single Promise that completes only after the QR data URL is available and the PDF has been triggered for download
- **AND** no unhandled rejection occurs from QR generation

### Requirement: QR library is lazy-loaded

The QR-generation library SHALL be dynamically imported only when a PDF download is triggered for an invoice that meets the QR-rendering conditions. The library code MUST NOT be present in the application's initial JavaScript bundle.

#### Scenario: Initial bundle does not include the QR library

- **WHEN** the application's production build artifacts are inspected
- **THEN** the initial chunks (`main-*.js`, eager `chunk-*.js`) do NOT include `qrcode` library code
- **AND** a separate lazy chunk containing the QR library exists, fetched on demand

#### Scenario: Loading the app without ever downloading a PDF does not fetch the QR library

- **WHEN** a user signs in, navigates the app, and never clicks Download PDF
- **THEN** the browser does not download the lazy chunk containing the QR library
