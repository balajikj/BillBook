## Why

Small businesses and freelancers need a simple, low-overhead way to invoice customers, track payments, and produce professional PDF bills, but most SaaS billing tools charge per-seat or per-invoice fees that don't scale down for very small operators. BillEasy bootstraps that audience with a zero-infrastructure-cost MVP built on Firebase's free tier — multi-tenant by design so a single deployment can serve many independent companies, with strict tenant isolation and role-based access so each company's data stays private.

## What Changes

- Stand up a new Angular single-page application deployed to Firebase Hosting (no backend servers).
- Introduce a **two-step login flow**: a "company gate" screen (user enters a company code/identifier) followed by a user credentials screen. Only companies registered and marked `active` by the super admin can pass the gate; unregistered/disabled company codes are rejected before the user login form is shown.
- Introduce three user roles with distinct permission sets:
  - **Super Admin**: platform-level user. Can create/activate/deactivate companies and create the initial company admin user for each company. Does NOT participate in tenant data.
  - **Company Admin**: created by super admin. Has full access to that company's data — invoices, customers, products, users, dashboard. Can create non-admin users within their company.
  - **Company User (non-admin)**: created by company admin. Restricted to creating and viewing bills/invoices only. No customer/product/user/dashboard management.
- Multi-tenant data model in Cloud Firestore with strict per-company isolation, enforced by Firestore Security Rules (every tenant document keyed by `companyId`; reads/writes blocked unless the requester's custom claims match).
- Core billing features (MVP scope):
  - Create, edit, and list invoices with line items.
  - Customer catalog (CRUD).
  - Product catalog (CRUD).
  - Track invoice payment status: `paid`, `pending`, `overdue` (overdue computed from due date).
  - Generate and download invoices as PDF on the client (jsPDF / pdfmake — no server cost).
  - Dashboard summarizing total revenue, paid vs. pending vs. overdue counts, and recent invoices for the logged-in company.
  - Multi-currency: each invoice carries its own currency code; the company has a default currency.
- Firebase Authentication (email/password) with custom claims (`role`, `companyId`) set via a one-time Cloud Function callable at user-creation time. **Note**: a single Cloud Function is required for setting custom claims securely; everything else stays client-side. This stays inside the free tier at MVP scale.

## Capabilities

### New Capabilities

- `tenant-management`: Super admin creates and manages tenant companies; controls the company-code gate that decides whether anyone from a given company is allowed to reach the login screen.
- `authentication`: Two-step login (company gate → user login), Firebase Auth integration, custom-claims-based role and tenant binding, route guards.
- `user-management`: Company admins create and manage non-admin users within their own company; super admins bootstrap the first company admin per company.
- `customer-management`: Per-company customer catalog (CRUD) used as the recipient of invoices.
- `product-management`: Per-company product/service catalog (CRUD) used to populate invoice line items.
- `invoice-management`: Per-company invoice creation, editing, listing, and payment-status tracking (paid/pending/overdue) with multi-currency support.
- `pdf-billing`: Client-side rendering and download of invoices as PDF documents.
- `dashboard`: Per-company revenue and invoice-status summary view for company admins.

### Modified Capabilities

<!-- None. This is the inaugural change for the project; no existing specs are being modified. -->

## Impact

- **Code**: Greenfield Angular workspace under the repo root (project currently has no source). Adds an Angular app, Firebase SDK integration, Firestore data services, route guards, and a single Cloud Function (`setUserClaims`) for assigning custom claims at user-creation time.
- **Infrastructure**: New Firebase project required (Firestore in Native mode, Authentication with email/password provider enabled, Hosting site, single Cloud Function in the free Spark plan). No paid services introduced.
- **Dependencies**: `@angular/*`, `@angular/fire`, `firebase`, `firebase-admin` (for the Cloud Function), `jspdf` (or `pdfmake`), plus standard Angular tooling. No backend server framework.
- **Security**: Firestore Security Rules become the primary authorization boundary. Custom claims must be validated server-side via Firestore Rules on every read/write. The super-admin role lives outside the per-company data tree and must be gated by a separate rules path. This will need a careful review before any production data is loaded.
- **Out of scope for MVP** (deferred to later changes): payment gateway integration, recurring invoices, tax engine, email delivery of invoices, audit log, multi-language UI, mobile app, data export/import.
