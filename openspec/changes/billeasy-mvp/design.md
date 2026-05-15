## Context

The repository is currently empty of source code — this change establishes the initial codebase. The product is a multi-tenant billing SaaS targeting freelancers and very small businesses, with an explicit constraint that the MVP must run entirely within Firebase's free (Spark) plan: no paid services, no self-hosted backend, no managed databases beyond Firestore.

Three actor types share the system:

1. **Super Admin** — a platform operator at BillEasy. Not part of any tenant. Onboards new companies and creates the bootstrap admin for each.
2. **Company Admin** — first user of a tenant company. Manages users, customers, products, invoices, and views dashboard.
3. **Company User** (non-admin) — restricted to creating and viewing invoices for their company.

The hardest design questions are not Angular- or Firebase-specific in isolation — they are: (a) how to enforce **tenant isolation** when the entire data plane is a client-side SDK talking directly to Firestore, (b) how to gate the login UI on a **company-active flag** without leaking the tenant directory, and (c) how to assign **roles and tenant binding** to a user without standing up a backend.

## Goals / Non-Goals

**Goals:**

- Zero infrastructure cost at MVP scale (single Firebase Spark project covers all hosting, auth, storage, and the one Cloud Function needed for custom claims).
- Strict per-tenant data isolation enforced server-side (Firestore Security Rules), not just client-side filtering.
- A two-step login that prevents users of unregistered or deactivated companies from ever reaching the password form.
- Three distinct role permission boundaries (super admin / company admin / company user) enforced both in the UI (route guards) and in Firestore Rules.
- A clear data model that supports future features (recurring invoices, payment gateways, tax) without schema rewrites.
- Client-side PDF generation so no server is needed to render bills.

**Non-Goals:**

- Payment processing, payment gateway integration, recurring billing, tax calculation, email sending — all deferred.
- Audit logging, soft-delete, undo, history/versioning of invoices beyond a simple `updatedAt` timestamp.
- Self-service company sign-up. In the MVP, only a super admin creates companies; this is intentional and gates the login UI.
- Mobile-native apps, offline-first behavior, push notifications.
- Internationalization of UI strings (multi-currency is in scope; multi-language UI is not).
- Migration from any prior system — there is no prior system.

## Decisions

### Decision 1: Firebase Authentication with custom claims (not a roles collection)

Use Firebase Auth (email/password) and store `role` (`super-admin` | `company-admin` | `company-user`) and `companyId` as **custom claims** on the user's auth token. Firestore Security Rules read these claims directly via `request.auth.token.role` and `request.auth.token.companyId` without an extra document fetch.

**Alternatives considered:**

- *Storing role in a `/users/{uid}` Firestore document and looking it up in rules with `get(/databases/$(database)/documents/users/$(uid))`.* Rejected: every rule evaluation that needs the role costs an extra document read, which inflates Firestore quota and adds latency. Custom claims are free at evaluation time.
- *Encoding role inside email domain or a separate auth provider per tenant.* Rejected: brittle and doesn't compose with email/password.

**Trade-off**: custom claims can only be set with the Admin SDK, which forces us to introduce exactly one Cloud Function (`setUserClaims`) callable from the client by a privileged caller. The function itself authorizes the caller (super admin creating a company admin, or company admin creating a company user) before writing claims. Custom claims also propagate only on the next ID-token refresh (~1 hour), so the client must call `getIdToken(true)` after role changes; the UX impact is acceptable.

### Decision 2: Two-step login with a public-readable `companies` index keyed by company code

The first login screen takes a **company code** (short, human-typeable, e.g. `acme-co`). The app reads `/companies/{companyCode}` (a public-readable document containing only `{ name, status }` — no sensitive data). If `status !== 'active'` or the document doesn't exist, the gate rejects the request with a generic "Company not found or not active" message (deliberately the same message for both cases to avoid enumeration).

Only on success does the app advance to the user login screen, pre-binding the entered `companyCode` to the auth attempt. After successful auth, the app verifies `customClaims.companyId === <code's underlying companyId>` and otherwise signs the user out immediately.

**Alternatives considered:**

- *Single combined login form with company + email + password.* Rejected: the user requested an explicit two-step flow, and it also creates a natural UX point where unregistered companies are rejected before they ever see a password field — reducing the surface for credential-stuffing against the platform.
- *Storing the company-active flag inside a private document only readable to authenticated users.* Rejected: it would require the user to authenticate before the gate can check the flag, defeating the purpose of the gate.

**Trade-off**: a tiny amount of metadata (company name + active flag) is publicly readable. We mitigate by storing **only** the two fields needed for the gate in the public document and keeping all other tenant data behind authenticated, claim-gated reads.

### Decision 3: Firestore data model — top-level `companies` collection with nested per-tenant subcollections

```
/companies/{companyId}                       (public-readable: name, status, defaultCurrency)
  /private/{companyId}                       (admin-readable details: address, contact, billingEmail)
  /users/{userId}                            (uid, role, displayName, email, createdAt)
  /customers/{customerId}                    (name, email, address, currency)
  /products/{productId}                      (name, description, unitPrice, currency)
  /invoices/{invoiceId}                      (number, customerId, lineItems[], subtotal, total,
                                              currency, status, issueDate, dueDate, createdBy)
/superAdmins/{uid}                           (separate root collection, role gate for super admins)
```

Every tenant document lives **under** `/companies/{companyId}/...`. Security rules can therefore enforce isolation with a single pattern: `request.auth.token.companyId == companyId` extracted from the path.

**Alternatives considered:**

- *Flat collections (`/invoices`, `/customers`) with a `companyId` field on every doc.* Rejected: rules become more error-prone (every query must include a `where('companyId', '==', auth.token.companyId)` filter or the rules must check each document's `companyId` field on read, which doesn't compose with `list` queries the same way). The nested model also makes per-tenant export/delete trivial in the future.
- *Per-tenant separate Firebase projects.* Rejected: explodes operational overhead and breaks the zero-cost premise at any non-trivial number of tenants.

### Decision 4: One Cloud Function (`setUserClaims`) is the only server-side code

The function is `https.onCall`, validates the caller's existing claims, and sets `role` + `companyId` on the target user. Callable contracts:

- Caller is `super-admin`: may create a new company doc and set the bootstrap `company-admin` claims on a target user; may activate/deactivate a company.
- Caller is `company-admin`: may set `company-user` claims on a target user, but only with `companyId === caller.companyId`. May never escalate to `company-admin` or `super-admin` (those paths return permission denied).

Everything else — invoice CRUD, customer CRUD, etc. — goes directly from the Angular client to Firestore through the JS SDK, gated by Security Rules.

**Alternatives considered:**

- *Multiple functions (one per privileged action).* Rejected for MVP: a single function with a discriminated-union request body keeps deploy surface and cold-start count minimal.
- *No functions, set claims manually via Firebase console.* Rejected: doesn't scale past the very first super admin; the super admin needs to be able to onboard companies through the UI.

### Decision 5: Client-side PDF generation with `pdfmake`

Use `pdfmake` over `jsPDF`. `pdfmake` has first-class table support (invoices are tables) and produces cleaner output without manual coordinate math. Generation runs in the browser, triggered by a "Download PDF" button — no server cost.

**Alternatives considered:**

- *`jsPDF` with `autotable` plugin.* Workable, but `pdfmake`'s declarative document definition is closer to the invoice domain shape and easier to maintain.
- *Server-side rendering (e.g. Puppeteer in a Cloud Function).* Rejected: blows the free-tier function quota for any real volume and introduces cold-start latency.

### Decision 6: Angular 17+ standalone components, AngularFire for SDK integration

Standalone components + the new control-flow syntax (`@if`, `@for`) — no NgModules. AngularFire provides the idiomatic Observable wrappers around Firestore + Auth.

Routes:

- `/` → redirect based on auth state and role.
- `/login` → two-step login (company gate then credentials, single route with a state machine, or split into `/login/company` and `/login/user`).
- `/super-admin` → super admin dashboard (companies list, create company).
- `/app` → tenant app shell (lazy-loaded), with child routes for `/app/dashboard`, `/app/invoices`, `/app/customers`, `/app/products`, `/app/users` (admin only).

Route guards: `AuthGuard` (must be signed in), `RoleGuard` (must have specific role), `TenantGuard` (route's `companyId` must match claim).

> **Note (added 2026-05-15):** This Decision originally said "no tax engine — `total === subtotal`". The follow-up change [`india-gst-invoicing`](../india-gst-invoicing/) extends the invoice schema with `gstPercent`, `cgstAmount`, `sgstAmount`, `otherCharges`, `roundOff`, and `grandTotal` for Indian tenants. The "no tax engine" decision still holds for **legacy / non-India invoices** — those continue to persist only `subtotal` and `total`. The India extension is opt-in per invoice (driven by a non-zero `gstPercent`).

### Decision 7: Payment status `overdue` is computed, not stored

An invoice has stored statuses of `paid` or `pending`. `overdue` is derived: `status === 'pending' && dueDate < today`. This avoids a background job to flip statuses every day — which would need a scheduled Cloud Function (Spark plan limits scheduled functions). The dashboard query is `status == 'pending' && dueDate < now`.

**Trade-off**: clients in different time zones may differ by a day on whether something is overdue. Acceptable for MVP.

### Decision 8: Invoice numbering is sequential per-company

Format: `INV-{YYYY}-{NNNN}` (e.g. `INV-2026-0042`). The next sequence number is stored in `/companies/{companyId}/counters/invoice` and incremented inside a Firestore transaction at create time. Per-company means two companies can independently have `INV-2026-0001`.

## Risks / Trade-offs

- [**Custom claims propagate only on token refresh (~1h)**] → After any claim change, the client calls `auth.currentUser.getIdToken(true)` to force-refresh. For super-admin-triggered role changes on an already-signed-in user, that user will see updated permissions on next token refresh; for fresh logins it's immediate. Documented in the user-management spec.
- [**Public-readable company-gate document leaks tenant directory size**] → Mitigated by exposing only `{ name, status }` keyed by `companyCode`. No enumeration endpoint; you must know the exact code to read it. Acceptable for MVP; could be moved behind a Cloud Function later if directory size becomes sensitive.
- [**Firestore Rules are the only authorization barrier**] → Rules must be tested with the emulator before any deploy; a misconfigured rule could open a tenant's data. Mitigation: emulator-based rules tests in CI, and a "rules review" checkpoint in tasks before first deploy.
- [**Free-tier quota: 50K reads/day, 20K writes/day, 1GB storage**] → At the MVP user scale (a handful of pilot companies) this is comfortable. The dashboard read pattern is the biggest risk — aggregate computed on the fly from invoice docs. Mitigation: cap dashboard to "last 30 days" by default and add invoice list pagination (page size 25).
- [**Client-side-only PDF generation requires the browser to be open**] → Acceptable since the user is the one downloading. No batch email-out of invoices in MVP.
- [**Single Cloud Function cold-start adds ~1–3s to user-creation actions**] → Acceptable; this happens only at admin user-management actions, not on the hot path.
- [**No payment gateway** means "paid" is manually flagged] → Documented behavior for MVP. Users mark invoices paid themselves.
- [**Time-zone-dependent `overdue` computation**] → See Decision 7. Acceptable.

## Migration Plan

This is the inaugural change; no prior system to migrate from.

**Deploy steps:**

1. Create a Firebase project on the Spark plan.
2. Enable Firestore (Native mode), Authentication (email/password provider), and Hosting.
3. Deploy Firestore Security Rules first (and only) — a green emulator test run is a precondition.
4. Deploy the single Cloud Function (`setUserClaims`).
5. Deploy the Angular app to Hosting.
6. Bootstrap the first super-admin: temporary script (run once, locally, against Admin SDK) that creates the super-admin user and sets `role: 'super-admin'` on their custom claims. Documented in tasks.md as a one-time operation; the script is not committed in a runnable form.

**Rollback:**

- Hosting deploys are versioned by Firebase; `firebase hosting:rollback` reverts the SPA.
- Firestore Rules: keep prior rules file in git; redeploy the previous version.
- Cloud Function: redeploy the previous version from git.
- No data migration in MVP, so rollback never has to undo schema changes.

## Open Questions

- Should `companyCode` be user-chosen by the super admin at company-create time, or auto-generated from the company name? Recommended default: super admin types it, validated against `^[a-z0-9-]{3,32}$` and uniqueness. Confirm with stakeholder before implementing.
- Should we send a "set your password" email to newly created company users (Firebase Auth has a built-in password-reset flow we could reuse), or generate a temporary password the admin communicates out-of-band? Free-tier email sending is limited; recommend "admin sets initial password and shares it once, user changes on first login." Confirm.
- What's the desired UX when a super admin deactivates a company while one of its users is mid-session? Recommendation: rely on next token refresh; do not force immediate sign-out (would require a watcher on the company-status doc). Confirm acceptable.
