## ADDED Requirements

### Requirement: Two-step login flow with company gate

The system SHALL present login as two sequential steps. Step 1 prompts for a company code; step 2 (revealed only on step 1 success) prompts for email and password. The user MUST NOT be able to submit credentials without first passing the company gate.

#### Scenario: User enters a valid, active company code

- **WHEN** a user enters company code `acme-co` on the company gate
- **AND** `/companies/acme-co.status === 'active'`
- **THEN** the UI advances to the user login step
- **AND** the entered company code is preserved as form state for the next step

#### Scenario: User enters a non-existent company code

- **WHEN** a user enters company code `does-not-exist` on the company gate
- **AND** no document at `/companies/does-not-exist` is readable
- **THEN** the gate displays the message "Company not found or not active"
- **AND** the user login step is NOT revealed

#### Scenario: User enters an inactive company code

- **WHEN** a user enters company code `acme-co` on the company gate
- **AND** `/companies/acme-co.status === 'inactive'`
- **THEN** the gate displays the message "Company not found or not active"
- **AND** the user login step is NOT revealed
- **AND** the rejection message MUST be identical to the not-found case (no enumeration leak)

### Requirement: Successful authentication binds the session to the gated company

After Firebase Auth sign-in succeeds at step 2, the system SHALL verify the authenticated user's `companyId` custom claim equals the company code submitted at step 1. If they do not match, the system MUST sign the user out immediately.

#### Scenario: Authenticated user belongs to the gated company

- **WHEN** a user submits valid email/password at step 2
- **AND** Firebase Auth signs them in with custom claim `companyId === 'acme-co'`
- **AND** the gated company code is `acme-co`
- **THEN** the user is routed to `/app/dashboard` (or `/app/invoices/new` for non-admins)

#### Scenario: Authenticated user belongs to a different company

- **WHEN** a user signs in successfully at step 2
- **AND** their `companyId` claim is `other-co` but the gated code was `acme-co`
- **THEN** the system signs the user out immediately
- **AND** displays "Account does not belong to this company"

### Requirement: Super admin bypasses the company gate

The system SHALL provide a separate super-admin login route (`/super-admin/login`) that takes only email and password (no company code). Users authenticated through this route MUST have `role === 'super-admin'` in custom claims; otherwise they are signed out immediately.

#### Scenario: Super admin signs in through the super-admin login

- **WHEN** a user with `role === 'super-admin'` submits valid credentials at `/super-admin/login`
- **THEN** they are routed to `/super-admin/companies`

#### Scenario: Non-super-admin signs in through the super-admin login

- **WHEN** a user without `role === 'super-admin'` submits valid credentials at `/super-admin/login`
- **THEN** the system signs them out immediately
- **AND** displays "Not authorized as super admin"

### Requirement: Role and tenant binding via Firebase Auth custom claims

The system SHALL store each user's `role` (`super-admin` | `company-admin` | `company-user`) and `companyId` (or `null` for super admins) as Firebase Auth custom claims. Firestore Security Rules and Angular route guards MUST authorize based on these claims, not on Firestore documents.

#### Scenario: Claims are present after sign-in

- **WHEN** any user signs in
- **THEN** their ID token contains `role` and `companyId` claims
- **AND** the Angular auth state exposes these values for guard and UI use

#### Scenario: Claim changes propagate on token refresh

- **WHEN** a user's claims are modified by `setUserClaims` while they are signed in
- **AND** the client subsequently calls `getIdToken(true)`
- **THEN** the refreshed token contains the new claims
- **AND** the Angular auth state reflects the new role and `companyId`

### Requirement: Route guards enforce role-based access in the UI

The system SHALL provide route guards that block navigation to routes the current user is not authorized for. Guards MUST evaluate authentication state, role, and (where applicable) `companyId` match.

#### Scenario: Unauthenticated user navigates to a protected route

- **WHEN** an unauthenticated user navigates to any route under `/app/*` or `/super-admin/*`
- **THEN** the guard redirects them to the appropriate login route
- **AND** preserves the intended destination as a return URL

#### Scenario: Company user navigates to an admin-only route

- **WHEN** a user with `role === 'company-user'` navigates to `/app/users` (admin only)
- **THEN** the guard redirects them to `/app/invoices`
- **AND** the admin-only page is not rendered

#### Scenario: Company admin navigates to the super-admin area

- **WHEN** a user with `role === 'company-admin'` navigates to `/super-admin/companies`
- **THEN** the guard redirects them to `/app/dashboard`
- **AND** the super-admin page is not rendered

### Requirement: Sign-out clears session state

The system SHALL provide a sign-out action that signs the user out of Firebase Auth, clears in-memory auth state, and routes the browser to the appropriate login screen.

#### Scenario: User signs out

- **WHEN** a signed-in user triggers sign-out
- **THEN** the Firebase Auth session ends
- **AND** the user is routed to `/login`
- **AND** subsequent protected-route navigation is blocked by the auth guard
