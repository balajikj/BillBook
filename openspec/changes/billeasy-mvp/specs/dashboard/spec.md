## ADDED Requirements

### Requirement: Company admins view a per-company dashboard

The system SHALL provide a dashboard at `/app/dashboard` available to users with `role === 'company-admin'`. The dashboard MUST summarize the signed-in user's company only (scoped by `companyId` claim). Company users (non-admin) MUST be redirected to `/app/invoices` and MUST NOT see the dashboard.

#### Scenario: Company admin opens the dashboard

- **WHEN** a company admin navigates to `/app/dashboard`
- **THEN** the dashboard renders summary cards and recent activity scoped to their `companyId`

#### Scenario: Company user attempts to open the dashboard

- **WHEN** a company user navigates to `/app/dashboard`
- **THEN** the route guard redirects them to `/app/invoices`
- **AND** the dashboard is not rendered

### Requirement: Dashboard summarizes revenue and invoice status

The dashboard SHALL display the following summary cards for the company:

- Total revenue (sum of `total` across invoices with `status === 'paid'`) — grouped by currency.
- Count of `paid` invoices.
- Count of `pending` invoices that are NOT overdue.
- Count of `overdue` invoices (status `pending` AND `dueDate < today`).

#### Scenario: Dashboard shows revenue grouped by currency

- **WHEN** a company admin opens the dashboard
- **AND** their company has paid invoices of `1000 USD`, `500 USD`, and `200 EUR`
- **THEN** the revenue card displays `USD 1,500.00` and `EUR 200.00` as separate lines

#### Scenario: Dashboard distinguishes overdue from pending

- **WHEN** the company has 10 invoices with `status: 'pending'`, of which 3 have `dueDate < today`
- **THEN** the dashboard shows pending count as `7` (non-overdue) and overdue count as `3`

#### Scenario: Empty dashboard

- **WHEN** the company has no invoices
- **THEN** the dashboard displays zero counts and an empty state message
- **AND** no error is shown

### Requirement: Dashboard shows recent invoices

The dashboard SHALL display the 10 most recently created invoices for the company, with invoice number, customer name, total + currency, status, and issue date. Clicking an entry MUST navigate to that invoice's detail page.

#### Scenario: Recent invoices list

- **WHEN** a company admin opens the dashboard for a company with 25 invoices
- **THEN** the recent-invoices panel shows exactly 10 entries, ordered by `createdAt` descending

#### Scenario: Recent invoice click navigates to detail

- **WHEN** a company admin clicks an entry in the recent-invoices panel
- **THEN** the app navigates to that invoice's detail page

### Requirement: Dashboard queries respect the free-tier read budget

The dashboard SHALL limit its underlying Firestore queries to a bounded set sufficient for the metrics above. The default time window for revenue and status counts MUST be the last 90 days. The system MUST NOT issue an unbounded `getDocs(invoices)` to compute aggregates.

#### Scenario: Dashboard limits invoices considered

- **WHEN** the dashboard loads for a company with thousands of historical invoices
- **THEN** the queries used for the summary cards include `where('createdAt', '>=', now - 90d)` or equivalent bounded filters
- **AND** the recent-invoices panel uses `limit(10)`

#### Scenario: Dashboard time window is clearly labeled

- **WHEN** the dashboard renders revenue and counts
- **THEN** the UI clearly indicates that summary metrics cover the last 90 days
