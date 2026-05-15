## ADDED Requirements

### Requirement: Authorized users create invoices for their own company

The system SHALL allow users with `role === 'company-admin'` or `role === 'company-user'` to create invoices within their own company. Each invoice MUST live at `/companies/{companyId}/invoices/{invoiceId}` and MUST be created via a Firestore transaction that also increments the per-company invoice counter.

#### Scenario: User creates a valid invoice

- **WHEN** an authorized user submits a new invoice referencing an existing customer, one or more line items, currency `USD`, issue date today, due date in 14 days
- **THEN** the system runs a transaction that reads `/companies/{companyId}/counters/invoice`, increments its `next` value, and writes a new invoice document with `number: 'INV-2026-{NNNN}'`, `status: 'pending'`, `currency: 'USD'`, `createdBy: <uid>`, `createdAt` server timestamp, and snapshotted customer + line-item data
- **AND** the counter document's `next` field is incremented

#### Scenario: Invoice requires at least one line item

- **WHEN** a user submits an invoice with zero line items
- **THEN** the form blocks submission with "At least one line item is required"
- **AND** no Firestore write occurs

#### Scenario: Invoice customer must reference an existing customer in the same company

- **WHEN** an invoice references `customerId: 'xyz'` which does not exist in `/companies/{companyId}/customers`
- **THEN** the form blocks submission with a validation error
- **AND** no Firestore write occurs

### Requirement: Invoice totals are computed and stored deterministically

The system SHALL compute and persist `subtotal` and `total` on the invoice document. For MVP, `total === subtotal` (no tax engine). Each line item MUST persist its own `unitPrice` and `quantity` snapshot, independent of the source product, so later product-price edits do not retroactively alter past invoices.

#### Scenario: Subtotal is the sum of line-item extensions

- **WHEN** an invoice has line items `[{unitPrice: 100, quantity: 2}, {unitPrice: 50, quantity: 1}]`
- **THEN** the persisted `subtotal` is `250`
- **AND** the persisted `total` is `250`

#### Scenario: Line items snapshot product price at creation

- **WHEN** an invoice line item is created referencing product `prod-1` with `unitPrice: 100`
- **AND** the product's `unitPrice` is later updated to `120`
- **THEN** the invoice's stored line item still has `unitPrice: 100`

### Requirement: Invoice payment status tracking

The system SHALL track each invoice's status as either `paid` or `pending` in the stored document. The status `overdue` SHALL be derived (not stored) as: `status === 'pending' AND dueDate < today`. Company admins MUST be able to mark an invoice as paid or revert to pending; company users (non-admin) MUST NOT modify status.

#### Scenario: Company admin marks an invoice as paid

- **WHEN** a company admin marks invoice `INV-2026-0001` as paid
- **THEN** the invoice document's `status` is updated to `paid`
- **AND** `paidAt` is set to the current server timestamp
- **AND** `updatedAt` is set to the current server timestamp

#### Scenario: Company admin reverts a paid invoice to pending

- **WHEN** a company admin reverts a paid invoice
- **THEN** the document's `status` is updated to `pending`
- **AND** `paidAt` is cleared (set to `null`)

#### Scenario: Overdue status is derived

- **WHEN** the UI displays an invoice with `status === 'pending'` and `dueDate < today`
- **THEN** the invoice is shown with the visual `overdue` badge

#### Scenario: Non-admin attempts to change invoice status

- **WHEN** a company user submits a status update on an invoice
- **THEN** Firestore Security Rules deny the write
- **AND** the UI does not expose the status-change control for this role

### Requirement: Multi-currency support per invoice

The system SHALL store a `currency` (ISO 4217 code) on each invoice. The currency MUST default to the customer's currency (if set) or otherwise the company's `defaultCurrency`. The UI MUST format all monetary values on an invoice using the invoice's currency.

#### Scenario: Invoice defaults to customer currency

- **WHEN** a user starts a new invoice for a customer whose currency is `EUR`
- **THEN** the invoice's currency field is pre-populated with `EUR`
- **AND** the UI shows monetary inputs labeled as EUR

#### Scenario: Invoice defaults to company currency when customer has none

- **WHEN** a user starts a new invoice for a customer with no currency override
- **AND** the company's `defaultCurrency` is `USD`
- **THEN** the invoice's currency is pre-populated with `USD`

#### Scenario: User overrides invoice currency

- **WHEN** a user changes the invoice currency from `USD` to `GBP` before saving
- **THEN** the invoice is saved with `currency: 'GBP'`
- **AND** all monetary values render with GBP formatting

### Requirement: Invoice listing, filtering, and viewing

The system SHALL provide a paginated invoice list scoped to the user's company, with filters for status (`paid`, `pending`, `overdue`) and date range. List page size MUST be 25. A user MUST be able to open an individual invoice to see its full detail.

#### Scenario: User opens the invoice list

- **WHEN** an authorized user opens `/app/invoices`
- **THEN** the list displays up to 25 invoices ordered by `createdAt` descending
- **AND** pagination controls are present when more invoices exist

#### Scenario: User filters by status

- **WHEN** a user applies the filter `status: 'pending'`
- **THEN** the list returns only invoices where the stored status is `pending`
- **AND** "overdue" filter additionally restricts to invoices where `dueDate < today`

#### Scenario: User opens an invoice detail

- **WHEN** a user clicks an invoice in the list
- **THEN** the detail page displays customer, line items, totals, status, currency, issue/due dates, and the "Download PDF" action

### Requirement: Invoice data is strictly isolated per tenant

The system SHALL enforce that invoices in `/companies/{companyId}/invoices` are readable and writable ONLY by authenticated users whose `companyId` custom claim matches `{companyId}`. Firestore Security Rules MUST block all cross-tenant access regardless of role.

#### Scenario: User reads invoices in their own company

- **WHEN** a signed-in user with `companyId === 'acme-co'` lists `/companies/acme-co/invoices`
- **THEN** the read succeeds

#### Scenario: User attempts to read invoices of a different company

- **WHEN** a signed-in user with `companyId === 'acme-co'` attempts to read `/companies/other-co/invoices`
- **THEN** the read is denied by Firestore Security Rules

#### Scenario: Super admin attempts to read tenant invoices

- **WHEN** a super admin attempts to read `/companies/acme-co/invoices`
- **THEN** the read is denied by Firestore Security Rules (super admins manage the platform, not tenant data)
