## 1. Project & Firebase setup

- [ ] 1.1 Create a Firebase project on the Spark (free) plan; enable Firestore (Native mode), Authentication (email/password provider), Hosting, and Functions. _**Owner action.** See [README.md](../../../README.md#production-setup-one-time)._
- [x] 1.2 Initialize a new Angular 17+ workspace at the repo root with standalone components and the new control-flow syntax; configure strict mode.
- [x] 1.3 Install dependencies: `@angular/fire`, `firebase`, `pdfmake`, plus dev dependencies for the Firebase emulator suite and TypeScript types for pdfmake.
- [x] 1.4 Initialize Firebase in the workspace (`firebase init`): pick Firestore, Hosting, Functions (TypeScript), and Emulators (Auth, Firestore, Functions, Hosting). _Config files (`firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `functions/` scaffold) authored manually since the Firebase CLI is bundled as a workspace devDep (`npx firebase ...`)._
- [x] 1.5 Wire `provideFirebaseApp`, `provideAuth`, `provideFirestore`, and `provideFunctions` into the Angular app config, reading config from environment files.
- [x] 1.6 Add npm scripts: `start` (Angular dev server + emulators), `build`, `emulators`, `deploy:rules`, `deploy:functions`, `deploy:hosting`, `deploy` (full).
- [x] 1.7 Add a README section documenting local-dev startup (emulator suite usage, environment files, one-time super-admin bootstrap).

## 2. Data model & Firestore Security Rules

- [x] 2.1 Define TypeScript interfaces for `Company`, `CompanyPrivate`, `User`, `Customer`, `Product`, `Invoice`, `InvoiceLineItem`, and `Counter` in a `src/app/core/models/` folder.
- [x] 2.2 Author `firestore.rules` implementing: public read of `/companies/{cid}` limited to `{name, status, defaultCurrency}`; per-tenant isolation for `/companies/{cid}/{customers,products,invoices,users,private,counters}/**` keyed by `request.auth.token.companyId == cid`; super-admin gating for company create/update/status; deny all by default.
- [x] 2.3 Write rules unit tests using `@firebase/rules-unit-testing` covering the scenarios from `specs/tenant-management`, `specs/customer-management`, `specs/product-management`, `specs/invoice-management` (cross-tenant denial, role denial, public-gate read).
- [x] 2.4 Add a CI-runnable npm script `test:rules` that boots the Firestore emulator and runs the rules tests; make it part of pre-deploy checks.
- [x] 2.5 Add Firestore composite indexes file for invoice list queries (e.g. `status` + `createdAt`, `status` + `dueDate`).

## 3. Cloud Function `setUserClaims`

- [x] 3.1 Scaffold `functions/src/index.ts` exporting a single `https.onCall` function `setUserClaims`.
- [x] 3.2 Implement caller authorization: read `context.auth.token.role`; branch on `super-admin` (may create company-admin in any company; may create companies) vs `company-admin` (may create company-user only in their own `companyId`); deny everyone else.
- [x] 3.3 Implement target-user resolution: accept either an existing `uid` or create a new Firebase Auth user (email only — no password) via Admin SDK; on creation, generate a password-reset link with `auth.generatePasswordResetLink(email)` and return it to the caller (admin sends/shares it).
- [x] 3.4 Implement setting custom claims (`role`, `companyId`) and writing the corresponding `/companies/{cid}/users/{uid}` (or `/superAdmins/{uid}`) document atomically.
- [x] 3.5 Add input validation (Zod or hand-rolled) for the request body; return typed errors for the client.
- [x] 3.6 Add emulator-based tests for the function: happy paths (super admin creates admin, admin creates user) and denial paths (admin escalates to admin, admin creates in another tenant, non-admin calls function).
- [x] 3.7 Document the function's request/response contracts in `functions/README.md`.

## 4. Authentication — two-step login & guards

- [x] 4.1 Implement an `AuthService` exposing the current user, role, and `companyId` as observables/signals, sourced from `idTokenResult`.
- [x] 4.2 Build the company-gate component (`/login`): input for company code, calls `getDoc('/companies/{code}')`, advances to user-credentials step if `status === 'active'`, otherwise shows the uniform "Company not found or not active" message.
- [x] 4.3 Build the user-credentials step (same `/login` route, state-machine in the component): on submit, signs in via `signInWithEmailAndPassword`, then verifies `idTokenResult.claims.companyId === gatedCode`; signs out and shows error if mismatch.
- [x] 4.4 Build the separate super-admin login route `/super-admin/login`: email/password only, verifies `claims.role === 'super-admin'`, signs out and rejects otherwise.
- [x] 4.5 Implement route guards: `authGuard`, `roleGuard(role)`, `tenantGuard` (checks claim `companyId` matches the route's company segment for super-admin views into tenant pages — N/A in MVP but stub the guard).
- [x] 4.6 Implement a sign-out action wired to the app shell header.
- [x] 4.7 Add a redirect resolver at `/` that routes based on role: super admin → `/super-admin/companies`, company admin → `/app/dashboard`, company user → `/app/invoices`, unauthenticated → `/login`.

## 5. Super-admin area

- [x] 5.1 Build `/super-admin/companies` list page: reads `/companies` (super admin only by rules) showing code, name, status, default currency, created date.
- [x] 5.2 Build "Create company" form: validates code against `^[a-z0-9-]{3,32}$`, calls `setUserClaims` Cloud Function in "create company" mode which writes `/companies/{code}` and seeds the bootstrap admin in one round trip (or via a sibling function — keep it inside `setUserClaims` per the design).
- [x] 5.3 Build activate/deactivate toggle on each company row.
- [x] 5.4 Build "Create company admin" flow per company: collects email + display name only (no password), calls `setUserClaims` Cloud Function with `role: 'company-admin'` and `companyId`; on success, shows the returned password-reset link to the super admin to share with the new admin.
- [x] 5.5 Document the one-time super-admin bootstrap procedure in `docs/bootstrap-super-admin.md`: a local Node script using the Admin SDK to set claims on the first super admin (script NOT included in deployment artifacts).

## 6. Tenant app shell

- [x] 6.1 Build `/app` lazy-loaded shell component: top nav with company name + signed-in user + sign-out; left nav with Dashboard (admin), Invoices, Customers (admin), Products (admin), Users (admin).
- [x] 6.2 Hide admin-only nav items for `company-user` role using a structural directive or `@if` block driven by `AuthService` role signal.

## 7. Customer management

- [x] 7.1 Build a `CustomerService` exposing list, get, create, update, delete operations against `/companies/{companyId}/customers`.
- [x] 7.2 Build the customer list page at `/app/customers` (admin only): table with name, email, currency, actions.
- [x] 7.3 Build the customer create/edit form (admin only) with validation (name required, email format, optional currency override).
- [x] 7.4 Build the customer delete confirmation flow (admin only).
- [x] 7.5 Verify the read path works for `company-user` (used by invoice form picker) and write paths are blocked by rules. _Read path: invoice form pulls `CustomerService.list$()` for the picker (rules allow tenant-member read). Write denial covered by `firestore-rules-tests/test/rules.test.ts`._

## 8. Product management

- [x] 8.1 Build a `ProductService` exposing list, get, create, update, delete operations against `/companies/{companyId}/products`.
- [x] 8.2 Build the product list page at `/app/products` (admin only): table with name, unit price, currency, actions.
- [x] 8.3 Build the product create/edit form (admin only) with validation (name required, unitPrice >= 0, currency required).
- [x] 8.4 Build the product delete confirmation flow (admin only).

## 9. Invoice management

- [x] 9.1 Build an `InvoiceService` exposing list (paginated, filterable by status & date range), get, create-with-transaction, update-status, and delete.
- [x] 9.2 Implement the transactional create: read `/companies/{cid}/counters/invoice`, increment `next`, write the invoice with computed `number` (`INV-YYYY-NNNN`), `subtotal`, `total`, snapshotted customer + line items, `status: 'pending'`, `createdBy`, `createdAt`.
- [x] 9.3 Build the invoice list page at `/app/invoices`: 25-per-page, status filter (paid/pending/overdue derived), date-range filter, opens detail on row click.
- [x] 9.4 Build the new-invoice form: customer picker (reads customers), line-item editor backed by product picker (snapshots `unitPrice` from product at add time), currency default from customer → company, due-date picker, validation (>=1 line item, customer required), submit creates via the transactional service.
- [x] 9.5 Build the invoice detail page: shows number, status (with derived "overdue" badge), customer snapshot, line items, totals, currency-formatted monetary values, "Mark as Paid" / "Revert to Pending" actions (admin only), "Download PDF" action.
- [x] 9.6 Implement the `markAsPaid` and `revertToPending` operations on `InvoiceService` (admin only by rules) setting `status`, `paidAt`, `updatedAt`.
- [x] 9.7 Confirm Firestore Security Rules deny status changes for `company-user` and add a rules test covering this. _See "non-admin CANNOT change invoice status (paid)" in `firestore-rules-tests/test/rules.test.ts`._

## 10. PDF billing

- [x] 10.1 Build a `PdfService` wrapping `pdfmake` with a `generateInvoicePdf(invoice)` method returning a Blob and triggering a download named `<invoiceNumber>.pdf`.
- [x] 10.2 Implement the invoice PDF document definition: company header, invoice number, dates, customer snapshot, line items table (description, qty, unit price, line total), subtotal, total, currency, derived status.
- [x] 10.3 Wire the "Download PDF" button on the invoice detail page to `PdfService.generateInvoicePdf`.
- [x] 10.4 Handle optional fields (missing customer address, missing line-item description) gracefully without errors.

## 11. Dashboard

- [x] 11.1 Build a `DashboardService` exposing bounded queries for the company: paid invoices in the last 90 days (for revenue grouped by currency), counts of paid / pending-not-overdue / overdue, and the 10 most recent invoices.
- [x] 11.2 Build `/app/dashboard` (admin only) with revenue card (per currency), three status count cards, and a recent-invoices panel; row click navigates to invoice detail.
- [x] 11.3 Add the route guard so `company-user` is redirected to `/app/invoices`. _Enforced by the `roleGuard(['company-admin'])` on the `dashboard` route in `app.routes.ts`; redirect target lives in `role.guard.ts`._
- [x] 11.4 Confirm queries use `where('createdAt', '>=', now-90d)` and `limit(10)` and verify the Firestore indexes file covers them.
- [x] 11.5 Add the "Last 90 days" label to the dashboard UI.

## 12. User management (within a company)

- [x] 12.1 Build a `UserAdminService` exposing list (read `/companies/{cid}/users`), create (calls `setUserClaims` Cloud Function), and remove (calls Cloud Function which disables Auth user and deletes the user doc).
- [x] 12.2 Build `/app/users` (admin only) page listing users with email, role, created date.
- [x] 12.3 Build the create-user form (admin only): email + display name only (no password), submits to Cloud Function; on success, shows the returned password-reset link with copy-to-clipboard for the admin to share with the new user.
- [x] 12.4 Build the remove-user action (admin only) with confirmation; block self-removal in the UI.
- [x] 12.5 Add a "Role changes take effect on next sign-in or token refresh (up to 1 hour)" inline note on the users page.

## 13. Security rules review & emulator integration testing

- [ ] 13.1 Run the full rules test suite against the emulator; require it green before any deploy. _**Owner action**: requires Firebase CLI emulator (Java + `npx firebase emulators:exec`). Test code authored at [firestore-rules-tests/test/rules.test.ts](../../../firestore-rules-tests/test/rules.test.ts). Run with `npm run test:rules`._
- [ ] 13.2 Add an end-to-end smoke test (Playwright or Cypress) covering: super-admin creates company + admin → admin signs in → admin creates non-admin user → non-admin signs in and creates an invoice → admin marks paid → admin downloads PDF. _Deferred to a follow-up change: documented as a manual smoke test in [docs/smoke-test.md](../../../docs/smoke-test.md) for MVP. Playwright spec is the natural next step once the manual run is green._
- [x] 13.3 Document the smoke test and how to run it locally against the emulator suite.

## 14. Deployment

- [x] 14.1 Verify Spark-plan quota expectations against expected MVP load (document in `docs/quota-budget.md`); cap dashboard window at 90 days and list pages at 25 to stay within budget.
- [ ] 14.2 Deploy in order: `firestore.rules` first, then the `setUserClaims` function, then the Angular build to Hosting. _**Owner action**: `npm run deploy` after `firebase login` and updating `.firebaserc` + `src/environments/environment.ts` with the real project ID/config._
- [ ] 14.3 Run the one-time super-admin bootstrap procedure from `docs/bootstrap-super-admin.md`. _**Owner action**: see [docs/bootstrap-super-admin.md](../../../docs/bootstrap-super-admin.md)._
- [ ] 14.4 Smoke-test in production: super admin logs in, creates a pilot company, the pilot admin logs in, creates a test invoice, downloads its PDF. _**Owner action**: follow [docs/smoke-test.md](../../../docs/smoke-test.md) against the production URL after the deploy + bootstrap._
- [x] 14.5 Document rollback procedures: `firebase hosting:rollback`, redeploy previous rules from git, redeploy previous function from git. _See the "Rollback" table at the bottom of [README.md](../../../README.md)._
