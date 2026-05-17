## ADDED Requirements

### Requirement: Company admins maintain a single per-tenant invoice template document

The system SHALL provide a Profile page at `/app/profile` available to users with `role === 'company-admin'`. The page SHALL let the admin view and save a single per-tenant **invoice template** document at `/companies/{companyId}/private/invoice-template`. Non-admin tenant users (and unauthenticated visitors) MUST NOT have access to the route.

#### Scenario: Company admin opens the Profile page

- **WHEN** a company admin navigates to `/app/profile`
- **THEN** the page renders three sections: Header info, Footer / Payment info, and Signature & Disclaimer
- **AND** any previously saved fields are pre-populated in the form

#### Scenario: Company user attempts to open the Profile page

- **WHEN** a company user (`role === 'company-user'`) navigates to `/app/profile`
- **THEN** the route guard redirects them to `/app/invoices`
- **AND** the Profile page is not rendered

#### Scenario: Non-admin attempts to read the template doc directly

- **WHEN** a `company-user` issues a Firestore read of `/companies/{their companyId}/private/invoice-template`
- **THEN** Firestore Security Rules deny the read

### Requirement: Profile editor saves all configured fields in a single round-trip

The Profile editor SHALL persist the entire template as a single Firestore document. A save MUST set `updatedAt` to `serverTimestamp()` and `updatedBy` to the calling admin's UID. Empty/blank fields MUST be stored as missing (not as empty strings) so the PDF generator can cleanly treat them as "skip this line."

#### Scenario: Admin saves a fully-populated template

- **WHEN** a company admin submits the Profile form with values in every field
- **THEN** the document at `/companies/{cid}/private/invoice-template` contains the submitted values
- **AND** `updatedAt` is a server timestamp
- **AND** `updatedBy` equals the admin's UID

#### Scenario: Empty fields are stored as missing

- **WHEN** a company admin submits the Profile form with `header.email`, `header.website`, and `footer.upiId` blank
- **THEN** the saved document does NOT contain those keys (or stores them as `null`)
- **AND** subsequent reads of those keys evaluate to undefined/null

#### Scenario: First save creates the document

- **WHEN** a company admin saves the Profile form for a tenant that has never saved before
- **THEN** the document `/companies/{cid}/private/invoice-template` is created
- **AND** the page reloads to show the saved state without errors

### Requirement: Profile editor validates entry formats client-side

The Profile editor SHALL apply client-side format validation to a defined set of fields. Invalid entries MUST block the save action and SHALL display an inline error next to the offending field. Validation MUST be permissive for empty values (only enforce format when the field is non-empty).

#### Scenario: Invalid GSTIN is rejected

- **WHEN** a company admin types `123` into the GSTIN field and tries to save
- **THEN** the form shows an inline error for the GSTIN field
- **AND** the save action does not run

#### Scenario: Valid GSTIN passes

- **WHEN** a company admin enters `29ABCDE1234F1Z5` (15 chars matching the GSTIN pattern)
- **THEN** the GSTIN field shows no error
- **AND** the field's value is preserved in the form

#### Scenario: Email format check applies only when non-empty

- **WHEN** the email field is empty
- **THEN** no email format error is shown

- **WHEN** the email field contains `not-an-email`
- **THEN** an inline format error is shown for the email field

### Requirement: Terms & Conditions and Disclaimer support multi-line free-form text

The system SHALL let the admin enter multi-line text into the **Terms & Conditions** and **Disclaimer** fields. Line breaks entered by the admin MUST be preserved in storage and in the rendered PDF. Each of those two fields MUST be capped at 2000 characters by the client form.

#### Scenario: Multi-line terms are preserved

- **WHEN** a company admin types a three-line terms-and-conditions block separated by newlines
- **THEN** the saved document stores the text with `\n` line breaks
- **AND** rendering reads it back with the same line breaks

#### Scenario: Excessively long terms are blocked

- **WHEN** a company admin pastes 2500 characters into the Terms & Conditions field
- **THEN** the form blocks submission with a "Terms & Conditions must be 2000 characters or fewer" message

### Requirement: Profile document is private to tenant admins (and super admins)

The system SHALL enforce that `/companies/{companyId}/private/invoice-template` is readable and writable ONLY by `company-admin` of that tenant (and `super-admin`). Cross-tenant access, non-admin reads/writes, and unauthenticated access MUST be denied by Firestore Security Rules.

#### Scenario: Admin in another tenant attempts to read the template

- **WHEN** a `company-admin` of `other-co` attempts to read `/companies/acme-co/private/invoice-template`
- **THEN** the read is denied by Firestore Security Rules

#### Scenario: Non-admin attempts to write the template

- **WHEN** a `company-user` of `acme-co` attempts to write `/companies/acme-co/private/invoice-template`
- **THEN** the write is denied by Firestore Security Rules

#### Scenario: Unauthenticated client attempts to read the template

- **WHEN** an unauthenticated client attempts to read `/companies/{any}/private/invoice-template`
- **THEN** the read is denied by Firestore Security Rules

### Requirement: Profile data is exposed to PDF generation via a cached service

The system SHALL provide a service that loads the profile document for the signed-in company at most once per session, caches it in memory, and exposes it to consumers (notably the PDF generator). After a successful save, the cache MUST be invalidated so subsequent reads pick up the new values.

#### Scenario: First profile read fetches from Firestore

- **WHEN** the PDF generator (or any caller) requests the profile for the first time in a session
- **THEN** the service issues one Firestore read of `/companies/{cid}/private/invoice-template`
- **AND** caches the result (including the "document does not exist" case as an empty template)

#### Scenario: Subsequent reads use the cache

- **WHEN** the same session requests the profile again
- **THEN** no new Firestore read is made
- **AND** the previously cached value is returned

#### Scenario: Save invalidates the cache

- **WHEN** the Profile page successfully saves the template
- **THEN** the next request for the profile re-fetches from Firestore
- **AND** the freshly saved values are returned

### Requirement: Sidebar navigation surfaces the Profile entry for admins only

The tenant app shell SHALL display a "Profile" link in the side navigation when the signed-in user has `role === 'company-admin'`. The link MUST NOT appear for `company-user`.

#### Scenario: Admin sees the Profile link

- **WHEN** a `company-admin` is signed in
- **THEN** the sidenav includes a "Profile" entry that navigates to `/app/profile`

#### Scenario: Non-admin does not see the Profile link

- **WHEN** a `company-user` is signed in
- **THEN** the sidenav does NOT include a "Profile" entry
