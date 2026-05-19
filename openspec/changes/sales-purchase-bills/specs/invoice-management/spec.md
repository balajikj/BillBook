## ADDED Requirements

### Requirement: Invoices carry a `kind` distinguishing sales from purchase bills

Each invoice document SHALL carry a `kind` field whose value is exactly one of `'sales'` or `'purchase'`. The field is REQUIRED on documents written after this change. Documents written before this change that do NOT have the field MUST be treated as `'sales'` whenever the application reads `kind` — via a central accessor — without any data migration.

#### Scenario: New sales invoice persists `kind: 'sales'`

- **WHEN** an authorized user creates a sales invoice from the invoice form
- **THEN** the stored document at `/companies/{cid}/invoices/{id}` contains `kind: 'sales'`

#### Scenario: New purchase invoice persists `kind: 'purchase'`

- **WHEN** an authorized user creates a purchase invoice from the invoice form
- **THEN** the stored document at `/companies/{cid}/invoices/{id}` contains `kind: 'purchase'`

#### Scenario: Legacy invoice without `kind` reads as sales

- **WHEN** the application reads an invoice document stored before this change (no `kind` field present)
- **THEN** the central accessor returns `'sales'`
- **AND** every consumer (list, detail, dashboard, filters) treats the invoice as a sales invoice

### Requirement: Sales bill numbers continue to be auto-generated; purchase bill numbers are user-supplied

The system SHALL preserve the existing per-tenant auto-numbering for sales bills (`INV-YYYY-NNNN` via the transactional counter at `/companies/{cid}/counters/invoice`). The system MUST NOT touch that counter when a purchase bill is created. Purchase bills SHALL store the **user-supplied** supplier bill number verbatim in the same `number` field.

#### Scenario: Sales bill increments the counter

- **WHEN** an authorized user creates a sales invoice
- **THEN** a Firestore transaction reads `/companies/{cid}/counters/invoice`, increments `next` by 1, and stores the new value
- **AND** the invoice's `number` is `INV-<year>-<NNNN>` matching the value read before increment

#### Scenario: Purchase bill does NOT increment the counter

- **WHEN** an authorized user creates a purchase invoice with the supplier's bill number `VEN/2026/4521`
- **THEN** the invoice document stores `number: 'VEN/2026/4521'` verbatim
- **AND** the value of `next` at `/companies/{cid}/counters/invoice` is unchanged

#### Scenario: Purchase bill number is validated client-side

- **WHEN** an authorized user attempts to save a purchase bill with an empty number field
- **THEN** the form blocks submission with an inline error
- **AND** no Firestore write occurs

- **WHEN** the supplier bill number exceeds 64 characters
- **THEN** the form blocks submission with an inline error

### Requirement: Invoice form branches on bill kind

The invoice form SHALL present a **Bill kind** toggle (radio buttons or equivalent) at the top, allowing the user to select **Sales** or **Purchase** before filling the rest of the form. Switching the kind MUST update:

- The form heading (e.g. `New sales bill` vs `New purchase bill`).
- The counterparty label (`Customer` for sales, `Vendor` for purchase). The picker draws from the same `/companies/{cid}/customers` collection in both modes.
- The number field's mode (read-only auto-numbering preview for sales, required text input for purchase).

#### Scenario: Toggling to Purchase updates labels and number entry

- **WHEN** the user selects `Purchase` on the Bill kind toggle
- **THEN** the heading reads `New purchase bill`
- **AND** the counterparty label reads `Vendor`
- **AND** the number field becomes an editable text input
- **AND** the placeholder/hint mentions the supplier's bill number

#### Scenario: Toggling to Sales restores the original labels

- **WHEN** the user toggles back from Purchase to Sales
- **THEN** the heading, counterparty label, and number field revert to the sales behaviour (auto-numbering, `Customer` label)

### Requirement: Invoice list filters and badges by kind

The invoice list at `/app/invoices` SHALL accept a **Kind** filter alongside the existing Status and date filters. Each row SHALL display a small badge indicating the invoice's kind. The filter's default value is **All** (both kinds), preserving today's behaviour for users who never touch it.

#### Scenario: Filter by sales

- **WHEN** the user sets the Kind filter to `Sales`
- **THEN** the list shows only invoices with `kind === 'sales'` (treating legacy documents as `'sales'`)

#### Scenario: Filter by purchase

- **WHEN** the user sets the Kind filter to `Purchase`
- **THEN** the list shows only invoices with `kind === 'purchase'`

#### Scenario: Row shows a kind badge

- **WHEN** the list renders any row
- **THEN** that row includes a visual badge labelled `Sales` or `Purchase`

### Requirement: Invoice detail page reflects the bill kind

The invoice detail page SHALL adapt its labels to the invoice's `kind`:

- The page heading includes the kind (e.g. `Sales bill INV-2026-0042` vs `Purchase bill VEN/2026/4521`).
- The "Bill to" block is renamed to "Bill from" for purchase invoices. The underlying customer snapshot remains the same — only the section header changes.

All other behaviours (totals, status flow, mark-as-paid, delete, download PDF) MUST operate identically for both kinds.

#### Scenario: Purchase invoice header says "Bill from"

- **WHEN** the user opens a purchase invoice's detail page
- **THEN** the heading mentions `Purchase bill` (or equivalent)
- **AND** the counterparty section header reads `Bill from`

#### Scenario: Sales invoice detail layout is unchanged

- **WHEN** the user opens a sales invoice's detail page
- **THEN** the page renders with the same heading and `Bill to` label as before this change
- **AND** all controls behave as before

### Requirement: Tenant isolation and other rules are unchanged

This change SHALL NOT alter the Firestore Security Rules. Existing requirements — per-tenant invoice isolation, non-admin restrictions on status changes, super-admin's inability to read tenant invoices — remain unchanged.

#### Scenario: Cross-tenant read of a purchase invoice still denied

- **WHEN** a user from `acme-co` attempts to read a purchase invoice in `other-co`
- **THEN** Firestore Security Rules deny the read, exactly as for a sales invoice
