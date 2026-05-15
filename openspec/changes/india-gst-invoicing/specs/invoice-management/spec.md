## ADDED Requirements

### Requirement: Invoice carries an editable GST percentage with computed CGST and SGST splits

The system SHALL store an optional `gstPercent` (number, 0–50) on each invoice. When `gstPercent > 0`, the system SHALL compute and persist `cgstAmount = round(subtotal × gstPercent / 200, 2)` and `sgstAmount = round(subtotal × gstPercent / 200, 2)`. When `gstPercent` is `0`, absent, or null, both `cgstAmount` and `sgstAmount` MUST be 0 (or absent) and the invoice form / PDF MUST NOT render the CGST/SGST lines.

The `gstPercent` is set on the invoice form at billing time and MAY be edited freely while the invoice is being composed.

#### Scenario: User enters GST 18% on a ₹1000 subtotal invoice

- **WHEN** a user creates an invoice with `subtotal: 1000` and enters `gstPercent: 18`
- **THEN** the invoice is persisted with `gstPercent: 18`, `cgstAmount: 90.00`, `sgstAmount: 90.00`

#### Scenario: GST 0 produces no tax line

- **WHEN** a user creates an invoice with `subtotal: 500` and `gstPercent: 0`
- **THEN** `cgstAmount` and `sgstAmount` are stored as 0 (or absent)
- **AND** the invoice form does not display the CGST/SGST rows
- **AND** the PDF does not include CGST/SGST lines

#### Scenario: GST out of range is rejected

- **WHEN** a user enters `gstPercent: 75`
- **THEN** the form blocks submission with a "GST must be between 0 and 50" validation message

#### Scenario: GST split is computed live as the user types

- **WHEN** a user changes `gstPercent` from `5` to `12` on an in-progress invoice with `subtotal: 1000`
- **THEN** the displayed CGST changes from `25.00` to `60.00` and SGST changes from `25.00` to `60.00` without page reload

### Requirement: Invoice supports `otherCharges` and `roundOff` adjustments

The system SHALL store `otherCharges` (number, default 0, non-negative) and `roundOff` (number, default 0, signed — may be negative) on each invoice. Both are editable on the invoice form. Both contribute to `grandTotal`.

#### Scenario: User adds ₹50 delivery as other charges

- **WHEN** a user enters `otherCharges: 50` on an invoice with `subtotal: 1000`, `gstPercent: 18`
- **THEN** `grandTotal` is computed as `1000 + 90 + 90 + 50 + 0 = 1230.00`

#### Scenario: User applies a negative round-off

- **WHEN** an invoice's pre-roundoff total is `1230.40` and the user enters `roundOff: -0.40`
- **THEN** `grandTotal` is persisted as `1230.00`

#### Scenario: Negative `otherCharges` is rejected

- **WHEN** a user enters `otherCharges: -10`
- **THEN** the form blocks submission with a validation message
- **AND** no Firestore write occurs

### Requirement: Invoice persists a `grandTotal` as the authoritative final amount

The system SHALL compute and persist `grandTotal = round(subtotal + cgstAmount + sgstAmount + otherCharges + roundOff, 2)` on every new or updated invoice. `grandTotal` MUST be the value displayed as the final amount on the invoice detail page and on the PDF when GST or charges are in play. The pre-existing `total` field is retained for back-compatibility.

#### Scenario: Grand total reflects all components

- **WHEN** an invoice is saved with `subtotal: 1000`, `gstPercent: 18`, `otherCharges: 50`, `roundOff: 0`
- **THEN** `cgstAmount` is `90.00`, `sgstAmount` is `90.00`, `grandTotal` is `1230.00`

#### Scenario: Legacy invoice without GST renders unchanged

- **WHEN** an invoice predates this change and has no `gstPercent`, `otherCharges`, `roundOff`, `grandTotal` fields
- **THEN** the invoice detail page renders the original `total` as the final amount
- **AND** the PDF uses the legacy layout (no CGST/SGST/other-charges/round-off block)

#### Scenario: Grand total in words is rendered on the invoice form and PDF

- **WHEN** an invoice has `grandTotal: 12345.67` and `currency: 'INR'`
- **THEN** the form preview and PDF both display "Rupees Twelve Thousand Three Hundred Forty Five and Sixty Seven Paise Only" (Indian numbering)

#### Scenario: Grand total in words for non-INR currency

- **WHEN** an invoice has `grandTotal: 1234.56` and `currency: 'USD'`
- **THEN** the displayed in-words representation uses the international short scale (e.g. "One Thousand Two Hundred Thirty Four Dollars and Fifty Six Cents Only")

### Requirement: Invoice form auto-populates header from selected customer

The system SHALL display the picked customer's `shopName`, `fullAddress`, `gstNumber`, and `phoneNumber` in a read-only header card on the invoice form as soon as the customer is selected. The displayed values MUST be the values that get snapshotted onto the invoice on save. If a header field is missing on the customer, the form SHALL show an inline hint suggesting the user edit the customer record to add it.

#### Scenario: Customer with full India details is picked

- **WHEN** a user picks a customer with `shopName: 'Acme Mart'`, `fullAddress: '5 Anna Salai'`, `gstNumber: '33ABCDE1234F1Z5'`, `phoneNumber: '+91 9000000000'`
- **THEN** the invoice form header card displays all four values
- **AND** these values are saved into the customer snapshot on submit

#### Scenario: Customer missing GSTIN shows a hint

- **WHEN** the picked customer has no `gstNumber`
- **THEN** the header card shows "GSTIN not set on this customer — edit the customer record to add one" as a hint
- **AND** the form still allows submission

### Requirement: Invoice form auto-populates line item from selected product

The system SHALL copy `name`, `description`, `hsnSac`, and `unitPrice` from the picked product onto the new `InvoiceLineItem` when a product is selected. The user MAY override these line-level values after pick before submitting. The persisted line item MUST reflect the post-override values.

#### Scenario: Product with HSN and description is picked

- **WHEN** a user picks product `prod-1` with `name: 'Cotton T-shirt'`, `description: 'Round neck, white'`, `hsnSac: '6109'`, `unitPrice: 499`
- **THEN** the line item form populates with description `Round neck, white`, `hsnSac: '6109'`, `unitPrice: 499`

#### Scenario: User overrides line description after auto-populate

- **WHEN** a user picks product `prod-1` (description `Round neck, white`) and then edits the description to `Round neck, white, size XL`
- **THEN** the persisted line item has `description: 'Round neck, white, size XL'` and the original `hsnSac` and `unitPrice` are preserved unless the user also changed them
