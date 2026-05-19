## ADDED Requirements

### Requirement: Dashboard splits metrics into Sales, Purchase, and GST Summary groups

The dashboard at `/app/dashboard` SHALL present three card groups, top-to-bottom, in this order: **Sales** (rolling 90 days), **Purchase** (rolling 90 days), and **GST Summary** (rolling 90 days). The existing "Recent invoices" panel SHALL remain below all three, showing the newest 10 invoices across both kinds (each row carrying a kind badge).

#### Scenario: Layout order on dashboard load

- **WHEN** a company admin opens `/app/dashboard`
- **THEN** the page renders in this top-to-bottom order: page heading, Sales group, Purchase group, GST Summary group, Recent invoices

### Requirement: Sales group shows revenue, paid/pending/overdue counts

The **Sales** group SHALL display four cards equivalent to today's dashboard cards but scoped to `kind === 'sales'` invoices over the 90-day window:

- **Revenue (paid)** — sum of `total` (or `grandTotal` if present) over paid sales invoices, grouped by currency.
- **Paid** — count of paid sales invoices.
- **Pending** — count of sales invoices with `status === 'pending'` and `dueDate >= today`.
- **Overdue** — count of sales invoices with `status === 'pending'` and `dueDate < today`.

#### Scenario: Revenue card sums sales only

- **WHEN** the tenant has two paid sales invoices totalling INR 5,000 and one paid purchase invoice totalling INR 8,000
- **THEN** the Sales group's Revenue card shows `INR 5,000.00` (and only that)
- **AND** the purchase invoice does NOT contribute to the Sales Revenue card

#### Scenario: Counts segment sales

- **WHEN** the tenant has 4 paid sales, 2 pending sales (1 overdue), and 3 paid purchases in the window
- **THEN** the Sales group shows Paid=4, Pending=1, Overdue=1
- **AND** the purchases do NOT appear in any Sales count

### Requirement: Purchase group shows paid-out and paid/pending/overdue counts

The **Purchase** group SHALL display four cards over the same 90-day window, scoped to `kind === 'purchase'` invoices:

- **Paid out** — sum of `total` (or `grandTotal` if present) over paid purchase invoices, grouped by currency.
- **Paid** — count of paid purchase invoices.
- **Pending** — count of purchase invoices with `status === 'pending'` and `dueDate >= today`.
- **Overdue** — count of purchase invoices with `status === 'pending'` and `dueDate < today`.

#### Scenario: Paid out card sums purchases only

- **WHEN** the tenant has paid purchase invoices totalling INR 8,000 and paid sales totalling INR 5,000
- **THEN** the Purchase group's Paid out card shows `INR 8,000.00`
- **AND** the sales paid total does NOT contribute

#### Scenario: Counts segment purchases

- **WHEN** the tenant has 3 paid purchases, 5 pending purchases (2 overdue) in the window
- **THEN** the Purchase group shows Paid=3, Pending=3, Overdue=2

### Requirement: GST Summary computes Output, Input, and Net GST

The **GST Summary** group SHALL display three cards, all over the 90-day window, including invoices of all statuses (paid, pending, overdue) but only INR invoices that carry `gstPercent > 0`:

- **Output GST** — `Σ (cgstAmount + sgstAmount)` over **sales** invoices.
- **Input GST** — `Σ (cgstAmount + sgstAmount)` over **purchase** invoices.
- **Net GST liability** — `Output GST − Input GST`. Positive means payable to government; zero or negative means no liability (and ITC available, but ITC carry-forward is not modelled here).

The Net liability MUST be styled to indicate direction (e.g. red/warning when positive, green/info when zero or negative).

#### Scenario: Output and Input GST sum correctly

- **WHEN** the tenant has, in the window, sales invoices with total CGST+SGST of INR 1,800 and purchase invoices with total CGST+SGST of INR 1,100
- **THEN** Output GST shows `1,800.00`
- **AND** Input GST shows `1,100.00`
- **AND** Net liability shows `700.00 payable`

#### Scenario: Net liability is zero when sums are equal

- **WHEN** Output GST equals Input GST
- **THEN** Net liability shows `0.00` (or `Balanced`)

#### Scenario: Net liability is shown as ITC available when negative

- **WHEN** Input GST exceeds Output GST (e.g. heavy purchase month)
- **THEN** Net liability shows the absolute difference labelled `ITC available` (or equivalent)
- **AND** the card uses the info / non-warning visual style

#### Scenario: All statuses count toward GST sums

- **WHEN** the tenant has an unpaid sales invoice carrying CGST 90 + SGST 90 (gstPercent 18 on subtotal 1000)
- **THEN** that invoice's 180 INR contributes to Output GST even though it is not yet paid

#### Scenario: Non-INR and zero-GST invoices are excluded from the Summary

- **WHEN** the tenant has a USD invoice carrying `gstPercent: 18` (an unusual edge case)
- **THEN** that invoice is NOT included in Output or Input GST
- **AND** the GST Summary cards reflect only INR invoices with `gstPercent > 0`

### Requirement: GST Summary surfaces a clarity caveat

The GST Summary group SHALL display a small inline caveat (e.g. under the cards) stating that the figures are a rolling 90-day INR-only estimate and NOT a filing-grade GSTR report.

#### Scenario: Caveat is visible

- **WHEN** the dashboard renders the GST Summary
- **THEN** a small line of text near the group indicates that the numbers are rolling-90-day, INR-only, and not for tax filing

### Requirement: Recent invoices panel shows both kinds with a badge

The Recent invoices panel SHALL continue to show the 10 newest invoices in the tenant regardless of kind, with each row carrying a visual `Sales` or `Purchase` badge.

#### Scenario: Recent panel mixes kinds

- **WHEN** the tenant's 10 newest invoices include 6 sales and 4 purchase
- **THEN** all 10 rows render in the recent panel
- **AND** each row's kind badge matches the invoice's `kind` (defaulting to `Sales` for legacy invoices)

### Requirement: Non-admin redirect behaviour is unchanged

A `company-user` (non-admin) navigating to `/app/dashboard` SHALL continue to be redirected to `/app/invoices` by the existing role guard. This change does NOT widen dashboard visibility.

#### Scenario: Non-admin still redirected away

- **WHEN** a `company-user` navigates to `/app/dashboard`
- **THEN** the role guard redirects them to `/app/invoices`
- **AND** the dashboard is not rendered
