# BillEasy

Zero-cost, multi-tenant billing application built on the Firebase free (Spark) tier. Angular 21 SPA + Cloud Firestore + Firebase Auth + a single Cloud Function for privileged claims management. PDF invoices are generated client-side with `pdfmake`. Supports India-style **GST tax invoices** with CGST/SGST split, HSN/SAC codes, other charges, round-off, and grand-total-in-words rendering. Company admins configure a per-tenant **invoice profile** (header contact details, bank/UPI, signatory, T&C, disclaimer) under `/app/profile`, which the PDF generator applies to every invoice.

## Non-goals (call-outs for future contributors)

- **No image uploads** for logo / signature / stamp yet — invoice profile is text-only. Adding logo support is a follow-up change that introduces Firebase Storage.
- **Single invoice template per company** — no multi-template picker on the invoice form.
- **Invoice profile values apply to the PDF only** — not to the on-screen invoice detail view.

## Repository layout

```
.
├── src/                        # Angular app
│   ├── app/
│   │   ├── core/
│   │   │   ├── models/         # Domain TypeScript types
│   │   │   ├── services/       # Auth, Firestore, PDF, dashboard services
│   │   │   └── guards/         # Route guards (auth, role, tenant)
│   │   └── features/           # Lazy-loaded feature components
│   │       ├── login/                 # Two-step company-gate login
│   │       ├── super-admin/           # Platform admin area
│   │       ├── shell/                 # Tenant app shell + sidenav
│   │       ├── dashboard/             # Per-company revenue summary
│   │       ├── customers/             # Customer catalog (admin)
│   │       ├── products/              # Product catalog (admin)
│   │       ├── invoices/              # Invoice list / form / detail
│   │       └── users/                 # Intra-tenant user management
│   └── environments/           # Per-target Firebase config
├── functions/                  # The one Cloud Function: setUserClaims
├── firestore-rules-tests/      # Emulator-based Firestore Rules tests
├── firestore.rules             # Authoritative authorization rules
├── firestore.indexes.json      # Composite indexes for invoice queries
├── firebase.json               # Firebase project + emulator config
├── docs/                       # Operational documentation
│   ├── bootstrap-super-admin.md
│   ├── quota-budget.md
│   └── smoke-test.md
└── openspec/changes/billeasy-mvp/   # Proposal, design, specs, tasks
```

## Roles & data isolation

Three roles, set via Firebase Auth **custom claims** (`role`, `companyId`) by the `setUserClaims` Cloud Function:

| Role              | Scope             | Can do                                                                   |
| ----------------- | ----------------- | ------------------------------------------------------------------------ |
| `super-admin`     | Platform-wide     | Create companies, set company `active`/`inactive`, add company admins.   |
| `company-admin`   | One tenant        | Full access within their tenant: invoices, customers, products, users.   |
| `company-user`    | One tenant        | Create + view invoices only. No status changes. No catalog management.   |

Every tenant document lives under `/companies/{companyId}/...`. Firestore Security Rules enforce isolation by checking `request.auth.token.companyId == companyId` extracted from the path. See [firestore.rules](firestore.rules).

## Two-step login

The login page at `/login` has two steps:

1. **Company gate** — user types a company code (`acme-co`). The app reads `/companies/{code}` (a publicly readable gate document with only `{ name, status, defaultCurrency }`). If the company doesn't exist or its `status !== 'active'`, the gate rejects with a uniform "Company not found or not active" message.
2. **User credentials** — only revealed after the gate passes. After successful sign-in, the app verifies the user's `companyId` claim matches the gated code and signs them out if not.

Super admins sign in at the separate `/super-admin/login` route (no company code).

## Local development

### Prerequisites

- Node 20+
- Java 21+ on `PATH` (Firestore emulator needs the JVM)

### Install everything

```bash
npm install
npm --prefix functions install
npm --prefix firestore-rules-tests install
```

### Start the dev server + Firebase emulators

```bash
npm start
```

This runs `ng serve` on port 4200 and `firebase emulators:start` on:

- Auth: `http://127.0.0.1:9099`
- Firestore: `127.0.0.1:8080`
- Functions: `127.0.0.1:5001`
- Hosting (preview): `http://127.0.0.1:5000`
- Emulator UI: `http://127.0.0.1:4000`

The Angular dev build reads `src/environments/environment.development.ts`, which sets `useEmulators: true` and wires the SDKs to those ports automatically.

### Bootstrap the first super admin

Custom claims can only be set by the Admin SDK. Run the [one-time bootstrap script](docs/bootstrap-super-admin.md) against the emulator (or production) to mint the first super admin.

### Available npm scripts

| Script | What it does |
| --- | --- |
| `npm start` | Angular dev server + Firebase emulators (concurrent). |
| `npm run serve` | Just the Angular dev server. |
| `npm run build` | Production Angular build into `dist/billeasy/`. |
| `npm run emulators` | Just the emulator suite. |
| `npm run test:rules` | Firestore Rules tests against the emulator. |
| `npm run test:functions` | Cloud Function tests (requires emulator running). |
| `npm run build:functions` | Compile the function. |
| `npm run deploy:rules` | `firebase deploy --only firestore:rules,firestore:indexes`. |
| `npm run deploy:functions` | Build + deploy the function. |
| `npm run deploy:hosting` | Production Angular build + deploy hosting. |
| `npm run deploy` | Test rules, then deploy rules → functions → hosting. |

## Production setup (one-time)

Owner of the Firebase project does these manually:

1. Create a Firebase project on the **Spark (free)** plan.
2. Enable **Cloud Firestore** in Native mode.
3. Enable **Firebase Authentication** with the email/password provider.
4. Enable **Cloud Functions** (Spark plan supports it with limits).
5. Enable **Firebase Hosting**.
6. Edit [.firebaserc](.firebaserc) — change the `default` project ID to your real Firebase project ID.
7. Replace the placeholder `REPLACE_ME` values in [src/environments/environment.ts](src/environments/environment.ts) with your real Firebase web config.
8. Install the Firebase CLI if not present (`npm install` puts `firebase-tools` in `node_modules`, so `npx firebase ...` works without a global install).
9. `npx firebase login`.
10. `npm run test:rules` — green required before first deploy.
11. `npm run deploy`.
12. Run the [super-admin bootstrap script](docs/bootstrap-super-admin.md) against the production project.
13. Sign in at `https://<project>.web.app/super-admin/login` as the new super admin and create the first company.

## Smoke testing

See [docs/smoke-test.md](docs/smoke-test.md) for the manual end-to-end test covering the critical path: super admin → company creation → admin login → user creation → non-admin invoice creation → admin marks paid → PDF download.

## Quota expectations

The MVP fits comfortably inside the Spark plan for ~10-15 pilot tenants. See [docs/quota-budget.md](docs/quota-budget.md) for the per-tenant read/write budget and the design decisions that keep usage bounded (90-day dashboard window, 25-row invoice pages, no realtime listeners for aggregate metrics).

## Specs and design

This project was scoped through OpenSpec. The proposal, design decisions, capability specs, and the implementation task list live in [openspec/changes/billeasy-mvp/](openspec/changes/billeasy-mvp/).

## Rollback

| Layer | How to roll back |
| --- | --- |
| Hosting | `npx firebase hosting:rollback` |
| Firestore Rules | Re-deploy the previous `firestore.rules` from git (`git checkout <sha> -- firestore.rules && npm run deploy:rules`) |
| Cloud Function | Re-deploy the previous `functions/src/index.ts` from git (`git checkout <sha> -- functions && npm run deploy:functions`) |

No MVP-time data migrations exist, so a rules/function rollback never needs to undo schema changes.
