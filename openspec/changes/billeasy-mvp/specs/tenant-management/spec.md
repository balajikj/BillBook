## ADDED Requirements

### Requirement: Super admin creates tenant companies

The system SHALL allow a user with `super-admin` role to create a new tenant company by providing a unique company code, display name, and default currency. The system MUST reject creation if the company code already exists or does not match `^[a-z0-9-]{3,32}$`.

#### Scenario: Super admin creates a valid company

- **WHEN** a super admin submits the create-company form with code `acme-co`, name `Acme Co.`, default currency `USD`
- **AND** no company with code `acme-co` exists
- **THEN** the system creates a `/companies/acme-co` document with `status: 'active'`, `name: 'Acme Co.'`, `defaultCurrency: 'USD'`, and timestamps
- **AND** the new company appears in the super admin's companies list

#### Scenario: Super admin attempts to create a company with a duplicate code

- **WHEN** a super admin submits the create-company form with code `acme-co`
- **AND** a company with code `acme-co` already exists
- **THEN** the system rejects the creation with a "company code already taken" error
- **AND** no document is written

#### Scenario: Super admin attempts to create a company with an invalid code

- **WHEN** a super admin submits a company code containing uppercase letters, spaces, or fewer than 3 characters
- **THEN** the system rejects the submission with a validation error before any network call
- **AND** no Firestore write occurs

### Requirement: Only super admins can manage companies

The system SHALL restrict all company-management operations (create, activate, deactivate, view-all) to users whose auth token carries `role === 'super-admin'`. Firestore Security Rules MUST enforce this independently of the UI.

#### Scenario: Non-super-admin attempts to create a company

- **WHEN** a user with role `company-admin` or `company-user` calls the create-company action (via UI or direct SDK call)
- **THEN** the request is denied by Firestore Security Rules
- **AND** no company document is written

#### Scenario: Unauthenticated user attempts to list companies

- **WHEN** an unauthenticated request reads `/companies` as a collection
- **THEN** the request is denied by Firestore Security Rules

### Requirement: Super admin can activate or deactivate companies

The system SHALL allow a super admin to flip a company's `status` between `active` and `inactive`. A company set to `inactive` MUST be rejected at the company-gate login step.

#### Scenario: Super admin deactivates a company

- **WHEN** a super admin toggles the status of `acme-co` to `inactive`
- **THEN** `/companies/acme-co.status` is updated to `inactive`
- **AND** subsequent company-gate lookups for `acme-co` return "company not found or not active"

#### Scenario: Super admin reactivates a previously deactivated company

- **WHEN** a super admin toggles the status of `acme-co` from `inactive` back to `active`
- **THEN** `/companies/acme-co.status` is updated to `active`
- **AND** subsequent company-gate lookups succeed and advance to the user login step

### Requirement: Company gate document is publicly readable but limited to gate fields

The system SHALL expose `/companies/{companyCode}` as publicly readable, containing ONLY the fields `name`, `status`, and `defaultCurrency`. All other tenant configuration MUST live in a non-public location (e.g. `/companies/{companyCode}/private/{companyCode}`) and be readable only to authenticated members of that tenant.

#### Scenario: Unauthenticated client reads a company gate document

- **WHEN** an unauthenticated client fetches `/companies/acme-co`
- **THEN** the read succeeds and returns `{ name, status, defaultCurrency }` only
- **AND** the response contains no other fields

#### Scenario: Unauthenticated client attempts to read private tenant data

- **WHEN** an unauthenticated client attempts to read `/companies/acme-co/private/acme-co` or any subcollection (e.g. `/companies/acme-co/invoices`)
- **THEN** the read is denied by Firestore Security Rules

### Requirement: Super admin bootstraps the first company admin per company

The system SHALL allow a super admin to create the first `company-admin` user for a newly created company. After the first admin exists, the super admin SHALL NOT be the sole path for adding admins — but for the MVP, additional company-admin creation also flows through the super admin.

#### Scenario: Super admin creates the bootstrap admin for a new company

- **WHEN** a super admin invokes "create company admin" for company `acme-co` with email and initial password
- **THEN** a Firebase Auth user is created
- **AND** the `setUserClaims` Cloud Function sets `role: 'company-admin'` and `companyId: 'acme-co'` on the user
- **AND** a `/companies/acme-co/users/{uid}` document is written with `role: 'company-admin'`, `email`, `displayName`, `createdAt`
