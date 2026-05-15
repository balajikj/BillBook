## ADDED Requirements

### Requirement: Company admins create non-admin users within their own company

The system SHALL allow a user with `role === 'company-admin'` to create a `company-user` (non-admin) within their own company. The new user MUST be created with `role === 'company-user'` and `companyId === <creator.companyId>`. Company admins MUST NOT be able to create users for any other company or with any other role.

#### Scenario: Company admin creates a non-admin user successfully

- **WHEN** a company admin of `acme-co` submits the create-user form with email `alice@acme.example`, display name `Alice`, and initial password
- **THEN** a Firebase Auth user is created with that email
- **AND** the `setUserClaims` Cloud Function sets `role: 'company-user'` and `companyId: 'acme-co'` on the user
- **AND** `/companies/acme-co/users/{uid}` is written with `role: 'company-user'`, `email`, `displayName`, `createdAt`

#### Scenario: Company admin attempts to create a user in a different company

- **WHEN** a company admin of `acme-co` submits a create-user request with `companyId: 'other-co'` (e.g. via direct call to the Cloud Function)
- **THEN** the `setUserClaims` Cloud Function rejects the call with permission denied
- **AND** no auth user, claims, or Firestore document is written

#### Scenario: Company admin attempts to elevate role to admin

- **WHEN** a company admin submits a create-user request with `role: 'company-admin'` or `role: 'super-admin'`
- **THEN** the `setUserClaims` Cloud Function rejects the call with permission denied
- **AND** no claims are written

### Requirement: Company admin can list and remove users in their own company

The system SHALL allow a company admin to list all users in their own company (`/companies/{companyId}/users`) and to remove (delete or disable) a user. Removal MUST disable the Firebase Auth account so the user can no longer sign in.

#### Scenario: Company admin lists company users

- **WHEN** a company admin opens the users page
- **THEN** the page displays all users in `/companies/{their companyId}/users` with their role, email, and created date

#### Scenario: Company admin removes a non-admin user

- **WHEN** a company admin removes user `alice@acme.example`
- **THEN** the corresponding Firebase Auth account is disabled (or deleted)
- **AND** the `/companies/acme-co/users/{uid}` document is removed
- **AND** Alice's existing session is invalidated on next token refresh

#### Scenario: Company admin attempts to remove themselves

- **WHEN** a company admin attempts to remove their own user record
- **THEN** the action is blocked in the UI with the message "You cannot remove yourself"

### Requirement: Non-admin users cannot manage users

The system SHALL deny all user-management operations to users with `role === 'company-user'`. The UI MUST hide user-management entry points, and Firestore Security Rules / Cloud Function authorization MUST reject any direct attempt.

#### Scenario: Non-admin user attempts to open user management UI

- **WHEN** a `company-user` navigates to `/app/users`
- **THEN** the route guard redirects them away
- **AND** the page is not rendered

#### Scenario: Non-admin user attempts to call setUserClaims directly

- **WHEN** a `company-user` invokes the `setUserClaims` Cloud Function
- **THEN** the function rejects the call with permission denied

### Requirement: User-management operations are token-refresh aware

The system SHALL inform users (via UX copy and/or auto-refresh) that role changes made by an admin take effect after the affected user's next ID-token refresh (up to one hour) or after the affected user signs out and signs back in.

#### Scenario: Admin modifies a user's role while that user is signed in

- **WHEN** a company admin changes a non-admin to a different role (deferred: not in MVP) OR removes them
- **THEN** the UI surfaces a notice that the change takes effect on the user's next session or token refresh

#### Scenario: Removed user signs in again

- **WHEN** a user who has been removed/disabled attempts to sign in
- **THEN** Firebase Auth rejects the sign-in
- **AND** the company gate behaves as if the credentials are invalid
