## Context

The current `Invoice` model has no notion of direction — every record represents a sales transaction (money coming in). The invoice-form, list, detail, dashboard, and PDF generator all implicitly assume this. To support a tenant tracking the bills they *receive*, we need to (a) flag direction on each record and (b) re-bucket the dashboard so it answers the obvious next question — *"how much GST do I owe net?"*

Two constraints frame the approach:

1. **Backwards compatibility.** Hundreds of existing invoices already in Firestore have no `kind` field. They are all sales by definition (that's all we supported). The rule is: a missing `kind` reads as `'sales'`. No data migration; no batch write.

2. **Numbering semantics differ by kind.** Sales bills are *generated* by the tenant — the system needs to assign a fresh number from a transactional counter, exactly like today. Purchase bills are *received* — the number is printed by the supplier, the tenant types it in, and the system stores it verbatim. The system MUST NOT touch the per-tenant counter for purchase bills.

## Goals / Non-Goals

**Goals:**

- A single `kind` field on the invoice (the canonical source of direction), with a default-on-read accessor so old docs stay valid.
- A Bill-kind toggle on the invoice form that visibly branches labels and switches number-entry mode in one place.
- Dashboard split into three groups (Sales / Purchase / GST Summary) without breaking the existing 90-day window or quota budget.
- Net GST liability shown alongside Output and Input GST so the user gets the actionable figure at a glance.
- Zero new Firestore documents, zero rule changes, zero new Cloud Functions, zero new npm dependencies.

**Non-Goals:**

- A real GST filing export. The Summary is a rolling 90-day rough cut, not GSTR-3B-grade.
- ITC carry-forward modelling (when Input GST > Output GST in a period).
- Separate Vendors catalog. Customers serve both roles.
- Per-vendor or per-customer ledgers.
- Multi-currency GST math. The Summary only sums INR amounts; non-INR purchases are excluded from the Net liability calculation (they're rare-to-impossible under Indian GST anyway).
- Renaming the PDF heading from `INVOICE` to `PURCHASE BILL` for purchase kind. Defer.
- Linking a purchase bill to a sales bill for cost-of-goods analytics.

## Decisions

### Decision 1: Single `kind` field on `/companies/{cid}/invoices/{id}`

```ts
export type InvoiceKind = 'sales' | 'purchase';
```

Stored at the top level of the invoice doc. Missing field on read defaults to `'sales'` via:

```ts
export function getInvoiceKind(inv: Pick<Invoice, 'kind'>): InvoiceKind {
  return inv.kind ?? 'sales';
}
```

**Alternatives considered:**

- *Two separate collections* (`/invoices` and `/purchases`). Rejected — every list query, every rule, every counter is duplicated; the dashboard cross-cut needs to do two fetches.
- *A `direction` boolean (`out` / `in`).* Rejected — the future will want `proforma`, `credit-note`, `debit-note`, etc.; a string enum extends cleanly, a boolean does not.

### Decision 2: Number assignment branches at `InvoiceService.create` time

The existing `InvoiceService.create` runs a Firestore transaction that:
1. Reads `/companies/{cid}/counters/invoice`.
2. Increments and writes `next + 1`.
3. Computes the number string `INV-YYYY-NNNN`.
4. Writes the invoice document.

For `kind: 'purchase'`, we **skip steps 1–3 entirely** and use the caller-supplied number. The transaction wrapper goes away on the purchase path because there is no counter contention — we just `setDoc` the new invoice with the verbatim user-typed `number` (after trim + format validation).

**Validation for purchase bill number:**

- Required, non-blank after trim.
- Length 1–64 (matching `setUserClaims`-style sanity bounds; supplier bill numbers in the wild rarely exceed 32 chars).
- Allowed chars: anything printable except control characters. We don't try to enforce a structure — supplier bill numbers in India are wildly inconsistent (`INV/2026/0042`, `B-4521`, `2024-25-AB-001`, etc.).
- We do NOT enforce uniqueness within the tenant. Two different suppliers could legitimately have the same printed bill number. If this turns out to bite, we can add a per-(supplier-id, number) index later.

**Per-kind counter** (deferred): a future change could give purchase bills their own per-tenant sequence to support an internal "purchase order number" workflow. Out of scope here.

### Decision 3: Dashboard restructure — three card groups + a shared recent-invoices list

The dashboard component renders top-to-bottom:

```
+------------------- Sales (last 90 days) -------------------+
| Revenue (paid) | Paid | Pending | Overdue                  |
+------------------- Purchase (last 90 days) ----------------+
| Paid out       | Paid | Pending | Overdue                  |
+------------------- GST Summary (last 90 days) -------------+
| Output GST     | Input GST       | Net liability           |
+------------- Recent invoices (mixed, newest 10) ------------+
| ... rows with a kind badge ...                             |
+------------------------------------------------------------+
```

The shape lets the user diagonally scan the page in the order: did I sell, did I buy, do I owe tax, what just happened.

### Decision 4: Dashboard query strategy — minimum reads, client-side bucketing

The existing `DashboardService.load` issues three queries today:
1. paid invoices in window (revenue + paid count)
2. pending invoices in window (overdue split)
3. recent 10 (ordering only)

After this change, we **stay at the same query count** by bucketing kind client-side rather than firing six. The flow becomes:

1. Paid invoices in window — single `where('status', '==', 'paid') AND where('createdAt', '>=', now-90d)`. Iterate; bucket per `kind`. Accumulate per-currency revenue (sales) and per-currency paid-out (purchase).
2. Pending invoices in window — same shape. Iterate; bucket per `kind` and per `dueDate < now`.
3. GST sums — additional query over `where('createdAt', '>=', now-90d) AND where('gstPercent', '>', 0)`. Iterate; bucket per `kind` and sum `cgstAmount + sgstAmount`. (We can't combine this with #1/#2 cleanly because GST applies regardless of status — including drafts/pending.)
4. Recent 10 — `orderBy('createdAt', 'desc') limit(10)`. Same as today.

Net: 4 queries vs today's 3. Each is bounded by date and a `limit` where appropriate. Quota delta is small.

The downside is that the bucket totals depend on the order Firestore returns docs — but order doesn't matter for sums, only for the recent panel.

**Alternatives considered:**

- *Six queries (one per kind per metric).* Reads doubled; abandoned.
- *Composite indexes on `(kind, status, createdAt)` so we can `where('kind', '==', 'sales')` directly.* Tempting but: (a) we don't actually save reads — we still need both kinds for the GST Summary; (b) two new composite indexes for a 1.5x speedup on a few hundred invoices isn't a good trade.

### Decision 5: GST Summary semantics — include ALL statuses, INR only

GST liability under Indian rules is incurred at *invoice issue time*, not at payment. So the Output GST figure counts every sales invoice that *carries* `gstPercent > 0` in the window, regardless of whether the customer has paid. Same for Input GST on purchases — Input Tax Credit accrues at the receipt of the supplier's tax invoice, not when you pay them.

We deliberately **exclude non-INR invoices** from the Summary even though they could carry a `gstPercent` field. Non-INR Indian GST invoicing is exotic and would muddle the simple "net rupees" number we want to show. We surface a small caveat in the UI: *"INR invoices only; rolling 90-day estimate, not a filing report."*

Net liability formula:

```
NetGST = OutputGST - InputGST
```

Display:

- `NetGST > 0` → "₹N payable" (warning colour).
- `NetGST < 0` → "₹N ITC available" (info colour).
- `NetGST == 0` → "Balanced" or just zero.

### Decision 6: Old invoices read as sales — implemented at one chokepoint

The `getInvoiceKind` accessor is used everywhere a kind is consumed:

- Dashboard bucketing.
- Invoice list badge.
- Invoice detail heading.
- Future filters / exports.

Direct field access (`inv.kind`) is forbidden by convention — call the accessor. This eliminates a class of bugs where a developer forgets the old-docs-default rule.

### Decision 7: Form-level branching, not separate components

A single `InvoiceFormComponent` handles both kinds. The kind toggle drives:

- Heading + counterparty label via `computed()` signals.
- Number control's validators (auto-readonly for sales, required-text for purchase).
- A small JIT swap of the auto-numbering preview (`Will be assigned INV-2026-NNNN` for sales, vs the text input for purchase).

Two separate components were considered and rejected — the line-items editor, totals math, GST inputs, and Save flow are identical; duplication would be worse than the conditional.

## Risks / Trade-offs

- [**Old code paths might still call `inv.kind` directly**] → Mitigated by introducing the accessor `getInvoiceKind` and grepping for `.kind` after the change. Code-review checklist item: any new `inv.kind` access goes through the accessor.
- [**Composite-index miss on dashboard queries**] → The `where('gstPercent', '>', 0) AND where('createdAt', '>=', ...)` query may need a composite index. Add to `firestore.indexes.json` once the first dev run logs a "needs index" link; pasting the autogenerated link gives us the right shape.
- [**Purchase-bill number uniqueness not enforced**] → Acceptable for MVP. Real businesses *do* see duplicate supplier numbers across suppliers; uniqueness within a single supplier is a future enhancement that requires a vendor model anyway.
- [**Net GST estimate vs actual filing**] → Documented in the dashboard caveat. The Summary is a rolling 90-day rough cut. Not GSTR-3B grade.
- [**Customer catalog conflates customers and vendors**] → The labels flip in context but the underlying list does mix. Acceptable per decision; we can add a `kind?: 'customer' | 'vendor' | 'both'` tag on Customer later if it gets confusing.

## Migration Plan

Pure additive. No data migration.

**Deploy steps:**

1. `npm run test:rules` — must be green (no rules changed but we want a clean signal).
2. `npm run deploy:rules` — only deploys if `firestore.indexes.json` changed (a new composite index is likely). Skipped otherwise.
3. `npm run deploy:hosting` — ships the new UI and dashboard logic.

**Rollback:** `firebase hosting:rollback` reverts the UI. The `kind: 'purchase'` records that existed will become orphaned-looking sales invoices in the rolled-back UI (they have the user-typed number where a system-generated `INV-...` would be) — but they will still render, and re-deploying the new build restores them. No data corruption.

## Open Questions

- **Should the PDF heading change to "PURCHASE BILL" for the purchase kind?** Defer. Many small businesses use the same printed format for in-house records; a tenant who cares can request the cosmetic pass later.
- **Should the recent-invoices panel filter by kind?** Default: no — show both interleaved with a badge, so you see "what happened today" regardless of direction. A toggle is a cheap follow-up if you want.
- **What about a "convert to credit/debit note" flow?** Out of scope; a credit/debit note is a different `kind` value altogether (`'credit-note'`) and a separate change.
- **Numeric precision in INR sums** — JavaScript number arithmetic over hundreds of invoices is fine for the dashboard (rupee-level rounding is enough). When we do filing-grade reports, we'll switch to integer paise.
