## ADDED Requirements

### Requirement: Company admins manage the per-tenant product catalog

The system SHALL allow users with `role === 'company-admin'` to create, read, update, and delete product/service records within their own company. Products MUST live under `/companies/{companyId}/products/{productId}` with fields `name`, `description`, `unitPrice` (number), and `currency` (ISO 4217 code).

#### Scenario: Company admin creates a product

- **WHEN** a company admin submits the create-product form with name `Consulting Hour`, unitPrice `150.00`, currency `USD`, optional description
- **THEN** a document is written at `/companies/{companyId}/products/{generatedId}` with the submitted fields plus `createdAt` and `createdBy: <uid>`

#### Scenario: Company admin updates a product price

- **WHEN** a company admin edits `unitPrice` of an existing product from `150.00` to `175.00`
- **THEN** the product document is updated
- **AND** existing invoice line items already created at the old price are NOT retroactively changed (line items snapshot price at creation time)

#### Scenario: Company admin deletes a product

- **WHEN** a company admin deletes a product
- **THEN** the document is removed from `/companies/{companyId}/products`
- **AND** existing invoices that used the product retain their snapshotted line items

#### Scenario: Product unit price must be non-negative

- **WHEN** a company admin submits a unit price less than 0
- **THEN** the form blocks submission with a validation message
- **AND** no Firestore write occurs

### Requirement: Product data is strictly isolated per tenant

The system SHALL enforce that products in `/companies/{companyId}/products` are readable and writable ONLY by authenticated users whose `companyId` custom claim matches `{companyId}`. Firestore Security Rules MUST block all cross-tenant access.

#### Scenario: User reads products from their own company

- **WHEN** a signed-in user with `companyId === 'acme-co'` lists `/companies/acme-co/products`
- **THEN** the read succeeds

#### Scenario: User attempts to read products of a different company

- **WHEN** a signed-in user with `companyId === 'acme-co'` attempts to list `/companies/other-co/products`
- **THEN** the read is denied by Firestore Security Rules

### Requirement: Non-admin users have read-only access to products

The system SHALL allow users with `role === 'company-user'` to read the product catalog within their own company (so they can select line items when creating an invoice) but MUST deny create, update, and delete operations.

#### Scenario: Non-admin selects a product on an invoice

- **WHEN** a company user is creating an invoice
- **THEN** the product picker reads `/companies/{their companyId}/products` and displays the catalog

#### Scenario: Non-admin attempts to write a product

- **WHEN** a company user submits any product create/update/delete operation
- **THEN** Firestore Security Rules deny the write
- **AND** the UI does not expose write entry points for this role
