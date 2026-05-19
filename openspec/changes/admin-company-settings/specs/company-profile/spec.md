## ADDED Requirements

### Requirement: Profile page shows a Company section with the tenant's identity fields

The Profile page at `/app/profile` SHALL display a **Company** section at the top, above the existing Header info / Footer / Signature sections. The section MUST present four fields, all reading from the gate document at `/companies/{companyId}`:

- **Code** — read-only; the document ID; visually marked as set by the platform admin.
- **Status** — read-only; the current `status` (`active` / `inactive`); visually marked as set by the platform admin.
- **Name** — editable text input, required, 1–120 characters.
- **Default currency** — editable text input, required, validated against `^[A-Z]{3}$`, auto-uppercased on input.

The section MUST appear in this order: Code, Status, Name, Default currency.

#### Scenario: Section renders with current values

- **WHEN** a `company-admin` of `acme-co` opens `/app/profile`
- **AND** the gate document at `/companies/acme-co` has `name: 'Acme Co.'`, `status: 'active'`, `defaultCurrency: 'USD'`
- **THEN** the Company section shows `Code: acme-co` (read-only), `Status: active` (read-only), `Name: Acme Co.` (editable), `Default currency: USD` (editable)

#### Scenario: Code and Status are not editable

- **WHEN** a `company-admin` opens the Profile page
- **THEN** the Code and Status fields cannot be modified through the form
- **AND** each carries an inline hint that they are managed by the platform admin

#### Scenario: Default currency auto-uppercases

- **WHEN** the admin types `inr` into the Default currency input
- **THEN** the value in the input is updated to `INR` as the admin types
- **AND** the field passes validation

### Requirement: Save persists Company-section edits alongside the invoice template

The Profile page's **Save** action SHALL persist Company-section edits (name, defaultCurrency) to `/companies/{companyId}` whenever those fields are dirty, in addition to writing the existing invoice-template document. The two writes MUST run concurrently and report failure with per-document attribution.

#### Scenario: Both docs saved successfully

- **WHEN** the admin edits the company name AND a header-info field, then clicks Save
- **THEN** the system writes to both `/companies/{companyId}` (with the new name) and `/companies/{companyId}/private/invoice-template`
- **AND** the success indicator is shown only after both writes succeed

#### Scenario: Only invoice template is dirty

- **WHEN** the admin edits the disclaimer but leaves the Company section untouched
- **THEN** the system writes only to `/companies/{companyId}/private/invoice-template`
- **AND** no write hits the gate document

#### Scenario: Only Company section is dirty

- **WHEN** the admin changes the default currency but leaves the invoice template untouched
- **THEN** the system writes only to `/companies/{companyId}` (with the new defaultCurrency)
- **AND** no write hits the invoice-template document

#### Scenario: Partial failure surfaces per-doc error

- **WHEN** the gate-document write succeeds but the invoice-template write fails
- **THEN** the success indicator is NOT shown
- **AND** an error message identifies which write failed (e.g. "Failed to save invoice template: <reason>")
- **AND** the gate document's new values remain persisted (no rollback)

### Requirement: Company-section validation blocks Save until valid

When the admin enters an invalid value into the Name or Default currency fields, the Save button SHALL be disabled and an inline per-field error SHALL be shown. Validation MUST mirror the rule-level constraints so the user does not waste a round-trip on a write that the rules will reject.

#### Scenario: Empty name disables Save

- **WHEN** the admin clears the Name field
- **THEN** an inline error appears (`Required.` or similar)
- **AND** the Save button is disabled

#### Scenario: Invalid currency disables Save

- **WHEN** the admin enters `usd!` into the Default currency field
- **THEN** an inline error appears (`Three uppercase letters, e.g. USD.` or similar)
- **AND** the Save button is disabled

### Requirement: Hint communicates that currency change is not retroactive

The Profile page SHALL display a small hint next to (or under) the Default currency input clarifying that changing the value affects only **new** invoices and the default currency suggested for new customers; existing invoices and existing customer overrides are unchanged.

#### Scenario: Hint is visible

- **WHEN** the admin opens the Profile page
- **THEN** a small hint adjacent to the Default currency input reads something equivalent to "Default for new invoices and new customers; existing records keep their saved currency."

### Requirement: Successful Company-section save refreshes downstream consumers

After a successful save of the Company-section fields, the system SHALL invalidate any cached read of the gate document for the current tenant so that the next consumer (e.g. invoice-detail page downloading a PDF) sees the new values without a page reload.

#### Scenario: PDF download after rename sees new name

- **WHEN** the admin renames the company from `Acme Co.` to `Acme Trading Co.` and saves
- **AND** the admin then navigates to an existing invoice and clicks Download PDF
- **THEN** the generated PDF shows the new company name `Acme Trading Co.` in the header band
- **AND** no manual page reload was required between the save and the download
