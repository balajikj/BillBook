## ADDED Requirements

### Requirement: PDF header includes India-specific recipient identification

When the source invoice's customer snapshot carries any of `shopName`, `fullAddress`, `gstNumber`, or `phoneNumber`, the generated PDF SHALL render a "Bill To" block in the header showing the customer's `name`, `shopName` (if present), `fullAddress` (if present), `gstNumber` labelled `GSTIN:` (if present), and `phoneNumber` labelled `Phone:` (if present). Missing fields MUST be omitted from the block rather than printed as blank rows.

#### Scenario: PDF shows full India recipient block

- **WHEN** a PDF is generated for an invoice whose customer snapshot has `name: 'Globex Traders'`, `shopName: 'Globex Mart'`, `fullAddress: '12 MG Road, Bengaluru 560001'`, `gstNumber: '29ABCDE1234F1Z5'`, `phoneNumber: '+91 9876543210'`
- **THEN** the "Bill To" block renders all five lines in order: Customer name, Shop, Full address, `GSTIN: 29ABCDE1234F1Z5`, `Phone: +91 9876543210`

#### Scenario: PDF omits unset India fields

- **WHEN** a PDF is generated for an invoice whose customer snapshot has only `name: 'Walk-in Customer'`
- **THEN** the "Bill To" block shows only the customer name
- **AND** no empty `GSTIN:`, `Phone:`, `Shop:`, or `Address:` lines are printed

### Requirement: PDF totals block reflects GST split, additional charges, and round-off

When the source invoice has `gstPercent > 0` or `otherCharges !== 0` or `roundOff !== 0`, the generated PDF SHALL render a totals block showing each component on its own line in this exact order: `Subtotal`, `CGST (X%)`, `SGST (X%)`, `Other Charges`, `Round Off`, `Grand Total`. Lines whose underlying value is zero MAY be omitted (CGST/SGST omitted when `gstPercent` is 0; Other Charges omitted when 0; Round Off omitted when 0). The `Grand Total` line MUST always be shown when the invoice carries any of these India-style fields.

#### Scenario: Full totals breakdown with 18% GST

- **WHEN** a PDF is generated for an invoice with `subtotal: 1000`, `gstPercent: 18`, `cgstAmount: 90.00`, `sgstAmount: 90.00`, `otherCharges: 50.00`, `roundOff: 0`, `grandTotal: 1230.00`, `currency: 'INR'`
- **THEN** the totals block prints `Subtotal ₹1,000.00`, `CGST (9%) ₹90.00`, `SGST (9%) ₹90.00`, `Other Charges ₹50.00`, `Grand Total ₹1,230.00`
- **AND** the Round Off line is omitted

#### Scenario: Round-off line is shown when non-zero

- **WHEN** an invoice has `roundOff: -0.40`
- **THEN** the PDF totals block includes a line `Round Off -₹0.40`

#### Scenario: Legacy invoice without GST uses original layout

- **WHEN** a PDF is generated for an invoice predating this change (no `gstPercent`, `cgstAmount`, etc.)
- **THEN** the totals block uses the original `Subtotal` and `Total` rows only

### Requirement: PDF shows grand total in words

The generated PDF SHALL include a line "**Amount in words:** {grand-total-in-words}" beneath the totals block whenever `grandTotal` is present on the invoice. The in-words rendering MUST use the Indian numbering system when the invoice currency is `INR` and the international short-scale system otherwise. The rendering MUST end with `Only.`

#### Scenario: INR grand total in Indian numbering

- **WHEN** a PDF is generated for an invoice with `grandTotal: 125000` and `currency: 'INR'`
- **THEN** the PDF prints "Amount in words: Rupees One Lakh Twenty Five Thousand Only."

#### Scenario: INR grand total with paise

- **WHEN** a PDF is generated for an invoice with `grandTotal: 1230.50` and `currency: 'INR'`
- **THEN** the PDF prints "Amount in words: Rupees One Thousand Two Hundred Thirty and Fifty Paise Only."

#### Scenario: Non-INR grand total uses short scale

- **WHEN** a PDF is generated for an invoice with `grandTotal: 1234.56` and `currency: 'USD'`
- **THEN** the PDF prints "Amount in words: One Thousand Two Hundred Thirty Four Dollars and Fifty Six Cents Only."

#### Scenario: Legacy invoice without grandTotal omits the in-words line

- **WHEN** a PDF is generated for an invoice predating this change (no `grandTotal` field)
- **THEN** the PDF does NOT include the "Amount in words:" line

### Requirement: PDF line items table includes HSN/SAC column

The generated PDF SHALL include an `HSN/SAC` column in the line items table whenever any line item on the invoice carries a non-empty `hsnSac`. When no line item has an `hsnSac`, the column MAY be omitted. When the column is present, line items without an `hsnSac` MUST show an empty cell rather than a placeholder.

#### Scenario: Invoice with HSN-tagged items

- **WHEN** a PDF is generated for an invoice with three line items, two of which have `hsnSac: '6109'` and one of which has no `hsnSac`
- **THEN** the line items table includes the HSN/SAC column
- **AND** the two tagged rows show `6109`, the untagged row shows empty

#### Scenario: Invoice with no HSN-tagged items

- **WHEN** a PDF is generated for an invoice where no line item has an `hsnSac`
- **THEN** the HSN/SAC column is omitted entirely from the line items table
