# Spark-plan quota budget

The MVP targets the Firebase Spark (free) plan for the foreseeable pilot phase. Quotas (as of writing — verify in the [Firebase Pricing page](https://firebase.google.com/pricing) before launch):

| Service | Free-tier daily quota |
| --- | --- |
| Cloud Firestore | 50,000 reads, 20,000 writes, 20,000 deletes, 1 GB stored |
| Firebase Auth (email/password) | Unlimited |
| Firebase Hosting | 10 GB egress / 360 MB stored |
| Cloud Functions (HTTPS) | 125K invocations, 40K GB-seconds compute, 5 GB egress |

## Estimated usage per active tenant (per day)

Working assumptions: 5 users per tenant, 20 invoices created per day, dashboard loaded 10× per user, invoice list browsed 5× per user.

| Operation | Reads | Writes | Notes |
| --- | --- | --- | --- |
| Dashboard load (per visit) | ~30 | 0 | Bounded by 90-day window + `limit(10)` for recent. |
| Invoice list load | 26 | 0 | Page size 25 + 1 counter check on filter. |
| Create invoice | 1 | 2 | Transactional counter read + invoice write + counter update. |
| Mark paid | 1 | 1 | |
| Customer/product list | 25 | 0 | Bounded. |
| User-management page | 10 | 0 | Bounded by company size. |

Rough per-tenant daily total: ~3,000 reads, ~250 writes. **Spark plan supports ~16 pilot tenants comfortably** before reads become tight, ~80 before writes do. Storage is not a concern at MVP scale.

## Mitigations baked into the code

- Dashboard queries restrict `createdAt >= now - 90d` (see `DashboardService.load`).
- Invoice list page size is hard-capped at 25 (see `InvoiceListComponent`).
- "Recent invoices" uses `limit(10)`.
- No realtime listeners on long-lived screens beyond what AngularFire establishes for the visible list.

## What to monitor

- Firestore usage in the Firebase Console / Cloud Logging.
- Function cold-start frequency (each user-create round-trips through one function call).
- Hosting egress — `index.html` is cached `no-store`, but the JS bundles are immutable + 1y, so most repeat loads cost ~zero egress.

## When to consider Blaze

- When tenant count exceeds ~15 or you start hitting >40K reads/day.
- When you want scheduled functions (e.g. auto-flip status to `overdue` on a cron, or send invoice reminder emails).
- When you need outbound email / SMS.
