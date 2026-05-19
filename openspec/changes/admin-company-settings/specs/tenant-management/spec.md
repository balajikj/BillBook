## ADDED Requirements

### Requirement: Company admins update their own company name and default currency

The system SHALL allow a user with `role === 'company-admin'` to update the `name` and `defaultCurrency` fields of the gate document at `/companies/{companyId}` — but ONLY for the company whose ID matches their `companyId` claim. The update MUST be rejected if any other field changes, if `status` changes, or if the caller does not match the tenant.

#### Scenario: Company admin renames their own company

- **WHEN** a `company-admin` of `acme-co` submits an update to `/companies/acme-co` setting `name` to `Acme Trading Co.` and leaving `status` and `defaultCurrency` unchanged
- **THEN** Firestore Security Rules allow the write
- **AND** the document's `name` field becomes `Acme Trading Co.`
- **AND** the document's `status` and `defaultCurrency` are unchanged

#### Scenario: Company admin changes their own default currency

- **WHEN** a `company-admin` of `acme-co` submits an update setting `defaultCurrency` to `INR`
- **THEN** Firestore Security Rules allow the write
- **AND** the document's `defaultCurrency` is `INR`

#### Scenario: Company admin attempts to change status

- **WHEN** a `company-admin` of `acme-co` submits an update that changes `status` from `inactive` to `active`
- **THEN** Firestore Security Rules deny the write
- **AND** the document is unchanged

#### Scenario: Company admin attempts to update another tenant's gate doc

- **WHEN** a `company-admin` of `acme-co` submits an update to `/companies/other-co` setting `name` to anything
- **THEN** Firestore Security Rules deny the write
- **AND** the foreign document is unchanged

#### Scenario: Company admin attempts to add a new field

- **WHEN** a `company-admin` of `acme-co` submits an update that introduces a new field (e.g. `customField: 'value'`) on their gate document
- **THEN** Firestore Security Rules deny the write (the field is not in the gate-fields whitelist)

#### Scenario: Company admin submits an invalid name

- **WHEN** a `company-admin` of `acme-co` submits an update with an empty `name` field or a `name` longer than 120 characters
- **THEN** Firestore Security Rules deny the write

#### Scenario: Company admin submits an invalid default currency

- **WHEN** a `company-admin` of `acme-co` submits an update with `defaultCurrency` not matching `^[A-Z]{3}$` (e.g. `usd` or `USDX`)
- **THEN** Firestore Security Rules deny the write

#### Scenario: Non-admin attempts to update gate doc

- **WHEN** a `company-user` of `acme-co` submits any update to `/companies/acme-co`
- **THEN** Firestore Security Rules deny the write

#### Scenario: Super-admin behaviour unchanged

- **WHEN** a `super-admin` submits an update to `/companies/acme-co` that flips `status` from `active` to `inactive`
- **THEN** the write is allowed (existing behaviour, unchanged by this change)

### Requirement: Company code and document creation remain super-admin-only

The system SHALL continue to restrict creation of `/companies/{companyId}` documents and changes to the document's ID (the company code) to `super-admin` only. Company admins MUST NOT be able to create new company gate documents or rename existing ones (the doc ID is immutable in Firestore; this requirement is that the rules continue to prevent a workaround via create + delete).

#### Scenario: Admin cannot create a new company

- **WHEN** a `company-admin` attempts to create a new document at `/companies/new-tenant-co`
- **THEN** Firestore Security Rules deny the write

#### Scenario: Admin cannot delete their own company

- **WHEN** a `company-admin` of `acme-co` attempts to delete `/companies/acme-co`
- **THEN** Firestore Security Rules deny the operation

### Requirement: Updates set updatedAt server-side

When a `company-admin` updates the gate document, the system SHOULD set `updatedAt` to the server timestamp so super admins can see when each tenant last edited their own settings.

#### Scenario: Admin save populates updatedAt

- **WHEN** a `company-admin` of `acme-co` saves an update to `name`
- **THEN** the persisted document has `updatedAt` set to a server timestamp newer than its previous value
