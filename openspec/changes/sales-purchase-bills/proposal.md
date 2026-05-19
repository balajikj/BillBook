## Why

Every invoice in BillEasy today is implicitly a **sales** bill — one the tenant *issues* to a customer to collect money. Real small businesses (the GST-registered ones we already support) also need to record **purchase** bills — the bills they *receive* from their suppliers, so they can claim input-tax credit (ITC) and reconcile their GST liability at filing time.

Treating sales and purchase the same way means:

- The Dashboard's "Revenue (paid)" card mixes money you collected with money you paid out — useless.
- There is nowhere to see your **net GST liability** (output GST on sales − input GST on purchases). That single number is the most important figure in monthly GSTR-3B filing.
- The data model has no way to separate the two when you eventually want a tax-period export.

This change adds a single `kind: 'sales' | 'purchase'` field on the invoice, branches the invoice form and list on it, and rebuilds the dashboard so sales and purchase are first-class side-by-side categories with a third "GST Summary" card on top.

## What Changes

- Add a `kind` field to the `Invoice` model: `'sales' | 'purchase'`. New invoices default to `'sales'`. Existing invoices in Firestore that don't carry the field MUST be treated as `'sales'` on read — no migration script required.
- **Invoice form** sprouts a top-of-form **Bill kind** toggle (radio: *Sales* / *Purchase*). The toggle changes:
  - The page heading (`New invoice` → `New sales bill` / `New purchase bill`).
  - The counterparty label (`Customer` → `Vendor`). The picker still reads from the existing Customer catalog (per decision: reuse, not a separate Vendor catalog).
  - The **number** field:
    - Sales: continues to auto-generate `INV-YYYY-NNNN` via the per-tenant counter — unchanged from today.
    - Purchase: becomes a **required text input** where the user types the supplier's printed bill number (e.g. `VEN/2026/4521`). The system does NOT auto-generate; the counter is not touched. Validation: 1–64 chars, non-blank.
- **Invoice list** gets a **Kind filter** alongside the existing Status / date filters. A small `Sales` / `Purchase` badge appears in each row.
- **Invoice detail** page mirrors the labels:
  - Heading shows the kind.
  - "Bill to" → "Bill from" for purchase bills.
  - Existing PDF generator, totals, status flows, and notes remain unchanged for both kinds. (PDF will say `INVOICE` for both for now — a separate cosmetic pass can rename it to "PURCHASE BILL" later if you want.)
- **Dashboard** is restructured into three sections, each scoped to the existing 90-day window:
  1. **Sales** card group — revenue (sum of paid sales invoices), paid count, pending-not-overdue count, overdue count. (Same shape as today, but now filtered to `kind === 'sales'`.)
  2. **Purchase** card group — paid count, pending-not-overdue count, overdue count, **total amount paid out** (sum of paid purchase grand totals). Same window.
  3. **GST Summary** card group — for the same window:
     - **Output GST** (sales): `Σ (cgstAmount + sgstAmount)` over sales invoices where `gstPercent > 0`. (We include ALL statuses so the figure matches what gets filed, not just paid.)
     - **Input GST** (purchase): same sum over purchase invoices.
     - **Net GST liability**: Output GST − Input GST. Positive = payable to government; zero/negative = no liability (ITC carry-forward not modelled here yet).
- **Recent invoices** panel on the dashboard stays single-list (newest 10 across both kinds) with a small kind badge per row.
- **Rules**: no rules change required. The new `kind` field rides on the existing `/companies/{cid}/invoices/{id}` write path which the rules already allow for tenant members. New rules tests still cover the existing isolation paths — no new tests required for this change.

## Capabilities

### New Capabilities

<!-- None — this change extends existing capabilities. -->

### Modified Capabilities

- `invoice-management`: invoices now carry a `kind` field (`sales` | `purchase`). Sales bills keep the auto-generated `INV-YYYY-NNNN` numbering and the existing per-tenant counter; purchase bills carry a user-typed `number` (the supplier's printed bill number) and do NOT consume the counter. The invoice form, list, and detail pages branch on `kind` for labels and number-entry mode. The Customer catalog continues to be the single counterparty catalog (used for both customers and vendors).
- `dashboard`: the dashboard now presents Sales metrics, Purchase metrics, and a GST Summary (Output / Input / Net liability) as three distinct card groups, each over the existing 90-day window.

## Impact

- **Code**:
  - `src/app/core/models/invoice.ts` — add `kind` field with a default-on-read helper.
  - `src/app/core/services/invoice.service.ts` — `create` branches on kind: sales path keeps the transactional counter; purchase path takes a user-supplied number, validates it, and skips the counter. List queries gain an optional `kind` filter.
  - `src/app/core/services/dashboard.service.ts` — query bumped to fetch both kinds and bucket by `kind` server-side via `where('kind', '==', ...)` where possible. New computed fields: per-kind counts/revenue, per-kind GST totals, net liability.
  - `src/app/features/invoices/invoice-form.component.ts` — Bill-kind toggle; number-entry switches mode; labels swap.
  - `src/app/features/invoices/invoice-list.component.ts` — Kind filter + badge.
  - `src/app/features/invoices/invoice-detail.component.ts` — heading + Bill-to/from label tweak.
  - `src/app/features/dashboard/dashboard.component.ts` — three-section layout + new GST card group.
- **Data**: one new optional field. Old docs without `kind` resolve to `'sales'` at read time via a tiny accessor `getInvoiceKind(inv)`. No migration; no batch update needed.
- **Rules**: no change. The new field rides on the existing tenant-isolated invoice rules.
- **Indexes**: may need composite indexes on `(kind, status, createdAt)` and `(kind, createdAt)` for the dashboard queries. The dev build will surface any missing index via console warnings, then we add them to `firestore.indexes.json`.
- **Quota**: same dashboard read budget as today (~30 reads per dashboard load) — we keep the 90-day window and `limit(10)` for recent invoices. Bucketing kind happens client-side after the bounded fetch when an index is awkward.
- **PDF**: this change does NOT touch the PDF generator. The same invoice PDF prints regardless of kind. The "INVOICE" heading stays generic; renaming to "PURCHASE BILL" for the purchase kind is a separate cosmetic change if you want it later.
- **Out of scope** (intentionally deferred):
  - Separate Vendors catalog (decision: reuse Customers).
  - A real "tax period" export (GSTR-3B / GSTR-1 / GSTR-2A reconciliation). The new GST Summary card is a *rolling 90-day estimate*, not a filing-grade report.
  - Modelling ITC carry-forward across months when input GST > output GST.
  - Linking a purchase bill to a sales bill (cost-of-goods tracking).
  - Per-vendor purchase ledger.
  - Multi-currency purchase bills with FX (kept INR-only paths in scope; non-INR remains supported but the GST Summary only counts INR amounts).
