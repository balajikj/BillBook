## ADDED Requirements

### Requirement: Company admins manage the per-tenant customer catalog

The system SHALL allow users with `role === 'company-admin'` to create, read, update, and delete customer records within their own company. Customer records MUST live under `/companies/{companyId}/customers/{customerId}`.

#### Scenario: Company admin creates a customer

- **WHEN** a company admin of `acme-co` submits the create-customer form with name `Globex`, email `billing@globex.example`, address `123 Main St`, optional currency override `EUR`
- **THEN** a document is written at `/companies/acme-co/customers/{generatedId}` with the submitted fields plus `createdAt` and `createdBy: <uid>`

#### Scenario: Company admin edits a customer

- **WHEN** a company admin updates a customer's email and address
- **THEN** the corresponding Firestore document is updated
- **AND** `updatedAt` is set to the current server timestamp

#### Scenario: Company admin deletes a customer

- **WHEN** a company admin deletes a customer
- **THEN** the customer document is removed from `/companies/{companyId}/customers`
- **AND** existing invoices that referenced the customer continue to display the snapshot of customer data stored on the invoice itself

#### Scenario: Customer name is required

- **WHEN** a company admin submits the create-customer form with an empty name
- **THEN** the form blocks submission with a "Name is required" validation message
- **AND** no Firestore write occurs

### Requirement: Customer data is strictly isolated per tenant

The system SHALL enforce that customers in `/companies/{companyId}/customers` are readable and writable ONLY by authenticated users whose `companyId` custom claim matches `{companyId}`. Firestore Security Rules MUST block all cross-tenant access.

#### Scenario: User reads customers from their own company

- **WHEN** a signed-in user with `companyId === 'acme-co'` lists `/companies/acme-co/customers`
- **THEN** the read succeeds and returns the company's customers

#### Scenario: User attempts to read customers of a different company

- **WHEN** a signed-in user with `companyId === 'acme-co'` attempts to list `/companies/other-co/customers`
- **THEN** the read is denied by Firestore Security Rules

#### Scenario: Unauthenticated client attempts to read customers

- **WHEN** an unauthenticated client attempts to read any customer document
- **THEN** the read is denied by Firestore Security Rules

### Requirement: Non-admin users have read-only access to customers

The system SHALL allow users with `role === 'company-user'` to read the customer list within their own company (so they can select a customer when creating an invoice) but MUST deny create, update, and delete operations.

#### Scenario: Non-admin lists customers to populate an invoice form

- **WHEN** a company user opens the new-invoice form
- **THEN** they can read and display the customer list from `/companies/{their companyId}/customers`

#### Scenario: Non-admin attempts to create a customer

- **WHEN** a company user submits a create-customer write
- **THEN** Firestore Security Rules deny the write
- **AND** the UI does not expose the create-customer entry point for this role
