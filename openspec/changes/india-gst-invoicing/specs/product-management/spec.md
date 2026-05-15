## ADDED Requirements

### Requirement: Product record carries an optional HSN/SAC code

The system SHALL store an optional `hsnSac` (string) field on each product document under `/companies/{companyId}/products/{productId}`. The field represents either an HSN code (Harmonized System of Nomenclature, for goods) or a SAC code (Services Accounting Code, for services). Its absence MUST NOT block product creation or use on an invoice.

#### Scenario: Product is created with an HSN code

- **WHEN** a company admin submits the create-product form with `name: 'Cotton T-shirt'`, `unitPrice: 499`, `currency: 'INR'`, `hsnSac: '6109'`
- **THEN** the resulting Firestore document includes `hsnSac: '6109'`

#### Scenario: Product is created without an HSN code

- **WHEN** a company admin submits the create-product form with `name: 'Generic Service'` and no `hsnSac`
- **THEN** the document is written without `hsnSac`
- **AND** the product remains selectable on invoices

### Requirement: HSN/SAC format is validated when provided

The system SHALL validate the `hsnSac` field against the pattern `^\d{4,8}$` (four to eight digits) whenever the field is non-empty. Empty / absent `hsnSac` MUST be accepted.

#### Scenario: Valid 4-digit HSN is accepted

- **WHEN** a company admin enters `6109` as the HSN/SAC code
- **THEN** the form accepts it as valid

#### Scenario: Valid 8-digit HSN is accepted

- **WHEN** a company admin enters `61091000` as the HSN/SAC code
- **THEN** the form accepts it as valid

#### Scenario: Non-numeric HSN is rejected

- **WHEN** a company admin enters `61A9` as the HSN/SAC code
- **THEN** the form blocks submission with an HSN/SAC validation message

#### Scenario: Three-digit HSN is rejected

- **WHEN** a company admin enters `610` (only 3 digits) as the HSN/SAC code
- **THEN** the form blocks submission with an HSN/SAC validation message

### Requirement: Invoice line item snapshots the product HSN/SAC at line-add time

The system SHALL copy the product's `hsnSac` and `description` onto an `InvoiceLineItem` when the product is picked into the invoice. The line item MUST persist its own snapshot and MUST NOT later read from the source product. Editing or deleting a product MUST NOT retroactively change the `hsnSac` on existing invoice line items.

#### Scenario: Line item snapshots product HSN at creation

- **WHEN** a user adds a line item by picking product `prod-1` (`hsnSac: '6109'`, `description: 'Cotton T-shirt'`)
- **THEN** the resulting `InvoiceLineItem` carries `hsnSac: '6109'` and `description: 'Cotton T-shirt'`

#### Scenario: Snapshot survives later product edits

- **WHEN** product `prod-1`'s `hsnSac` is later edited from `6109` to `6110`
- **THEN** any pre-existing invoice line item still has `hsnSac: '6109'`

#### Scenario: Free-form line item without a product reference

- **WHEN** a user adds a line item without picking a product (`productId: null`) and types description `Delivery charges` manually
- **THEN** the line item is accepted with `hsnSac` absent / empty (the user is not required to fill HSN/SAC for free-form lines)
