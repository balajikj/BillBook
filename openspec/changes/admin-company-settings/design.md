## Context

The `/companies/{cid}` gate document is publicly readable (so the unauthenticated login page can check whether a company code exists and is active before showing the password form). It carries exactly three fields today: `name`, `status`, `defaultCurrency`. The Firestore rules in [firestore.rules](../../../firestore.rules) currently permit `create`/`update`/`delete` only when `request.auth.token.role == 'super-admin'`, gated by a `hasOnlyGateFields()` helper that whitelists the shape.

Two of those three fields — `name` and `defaultCurrency` — are pure display cosmetics chosen by the tenant. `status` is a platform-control field that a super admin uses to suspend or reactivate a tenant. The current binding (all three fields gated identically to super-admin) made sense at the point we wrote `billeasy-mvp`, where we didn't yet have a tenant-side admin UI; now that `/app/profile` exists, the cosmetics belong to the company admin.

The constraint shaping this change is that the gate document is **publicly readable** and the rules must not allow a company admin to weaponise an update — e.g. by flipping their own `status` to `active` after a super admin deactivated them, or by adding free-form fields that exfiltrate tenant data to the world. The rule update must be tight on **which fields change** and **by whom**.

## Goals / Non-Goals

**Goals:**

- Let a company admin edit `name` and `defaultCurrency` of their own tenant's gate document, from inside the existing `/app/profile` page.
- Keep the rule surface as tight as possible: enforced server-side that an admin update can only modify the cosmetic fields, never `status`, never the doc ID, never add new fields.
- Preserve the existing public-readability contract of the gate document (no security regressions).
- Keep the change additive: a tenant who never opens the new section sees identical behaviour to today.
- No new Firestore documents, no new collections, no new indexes, no new Cloud Functions.

**Non-Goals:**

- Editing the company **code** (the gate doc ID). It is used as a tenant key everywhere (Auth claims, sub-collection paths, login URL state) — renaming it is a multi-step migration not worth doing for an MVP cosmetic edit. Defer.
- Letting an admin change `status` themselves. Admins can lock themselves out by accident, and that becomes a support case anyway. Stays super-admin-only.
- Admin-side delete or hard-renaming of the company. Out of scope.
- Multi-admin concurrent-edit conflict resolution beyond last-write-wins. Out of scope; we won't introduce optimistic-locking version fields for two fields at MVP scale.
- An audit log of edits beyond the existing `updatedAt`/`updatedBy` fields on the doc.
- Cross-tenant template/profile cloning, currency conversion of existing invoices, retroactive renaming on snapshotted customer/invoice records.

## Decisions

### Decision 1: Use the existing gate doc; do **not** introduce a parallel "company profile" doc

The two editable fields already live at `/companies/{cid}`. Splitting them into a private sub-document would either (a) duplicate the source of truth (the login flow needs the gate doc anyway), or (b) require a join read on every login. Keep one doc.

**Trade-off**: the gate doc is publicly readable. We mitigate by restricting **what an admin can write** (next decision) rather than by hiding the doc.

### Decision 2: Rule shape — diff-checking, not blanket-allow

The rule for `update` on `/companies/{cid}` is extended with an additional alternative branch that allows the update when **all** of the following hold:

1. `request.auth != null` and `request.auth.token.role == 'company-admin'`.
2. `request.auth.token.companyId == cid` (admin of *this* tenant).
3. The updated document's `keys()` is a subset of `['name', 'status', 'defaultCurrency', 'updatedAt', 'createdAt']` — same `hasOnlyGateFields()` whitelist used today.
4. `request.resource.data.status == resource.data.status` (status unchanged).
5. `request.resource.data.name is string` and `request.resource.data.name.size() >= 1 && request.resource.data.name.size() <= 120`.
6. `request.resource.data.defaultCurrency is string` and `request.resource.data.defaultCurrency.matches('^[A-Z]{3}$')`.

The existing super-admin branch is left untouched. The two branches are joined by `||`.

Concretely, this becomes a new helper `function isAdminGateUpdate(cid)` in `firestore.rules` and the `match /companies/{cid}` `allow update` line reads `if isSuperAdmin() && hasOnlyGateFields() || isAdminGateUpdate(cid);`.

**Alternatives considered:**

- *Single combined predicate that branches inside on caller role.* Rejected — readability suffers and the field-pinning logic gets buried.
- *Cloud Function shim that validates and writes.* Rejected — gate doc is client-write today, adding a function for one cosmetic field doubles deploy surface for no security gain.

### Decision 3: Profile UI — "Company" section at the top, read-only metadata + two editable fields

Order on the Profile page (top → bottom): **Company** → Header info → Footer / Payment info → Signature & Disclaimer. The Company section shows:

```
+---------------------------------------------------------------+
| Company                                                       |
+---------------------------------------------------------------+
| Code:     acme-co                            (set by platform)|
| Status:   [active]                           (set by platform)|
| Name:     [Acme Co.                                         ] |
| Currency: [USD]                                               |
+---------------------------------------------------------------+
```

The two read-only rows use the same visual style as the rest of the form's labels but with `disabled` inputs (or plain text) so they read as informational. The Currency field auto-uppercases on input (consistent with the existing super-admin Companies form behaviour).

### Decision 4: Single Save action covers both docs

The Profile page currently saves one document (`/companies/{cid}/private/invoice-template`). After this change, Save additionally writes `/companies/{cid}` when either of the two editable fields has changed. The save handler:

1. Checks the Angular form for `dirty` on the new Company group; if dirty, queues a `CompanyService.updateGateInfo(name, defaultCurrency)` write.
2. Always queues the existing `CompanyProfileService.save(template)` write.
3. Runs both with `Promise.all` and reports success when both resolve. Reports a partial-failure message if one fails — the unaffected doc keeps its prior state, the user sees which write failed and can retry.

We don't attempt to use a Firestore batched write — the two docs are independent and Firestore batched writes are atomic only within a single security-rule evaluation; we'd lose the per-document error attribution. `Promise.all` with explicit error mapping is the right ergonomics here.

### Decision 5: Cache invalidation on save

`CompanyService` does not currently cache `getGate(cid)` — the invoice-detail page re-reads on each PDF download. That's fine — there's nothing to invalidate.

However, the **routing layer** (auth/redirect logic) reads the gate doc opportunistically. Specifically `LoginComponent`'s step-1 read of `/companies/{code}` happens once per login and is not cached across sessions. No invalidation needed there.

To be safe and to keep the codebase uniform, this change adds a small `invalidate()` no-op-today method on `CompanyService` mirroring the pattern from `CompanyProfileService`, so future cached reads can hook in without API churn. The Profile-save handler calls it after a successful gate-doc write.

### Decision 6: Currency change has no retroactive effect

Existing invoices snapshot their `currency` at create time (see `InvoiceService.create`). Existing customers carry an optional `currency` override. Changing the company's `defaultCurrency` **only** affects the **default** value the invoice form pre-populates for **new** invoices, and the default that new customers fall back to when they don't carry an override.

This is consistent with the snapshot-everything pattern used everywhere else in the app. We document it in a small "(default for new invoices)" hint next to the Currency field on the Profile page.

## Risks / Trade-offs

- [**Rule complexity grows**] → The new admin-update branch adds five field-diff checks to `firestore.rules`. We mitigate by extracting them into a single named helper and by covering each check with an emulator-based rules test. The rule remains short.
- [**Admin can rename to a misleading or offensive value**] → The name is publicly readable. We add a length cap (120) but no content moderation. Acceptable for MVP; if abused, super admin can `set-company-status: inactive` and the company is gone from the login flow.
- [**Last-write-wins on currency conflicts with in-flight invoices**] → Two admins editing concurrently can clobber each other. Acceptable for MVP; the editing window for cosmetic fields is short and edits are infrequent.
- [**Partial save (one doc succeeds, one fails)**] → Surfaced to the user with field-level error mapping; the unaffected doc keeps its prior state. The user retries the failed half. No automatic rollback.
- [**Currency change feels retroactive to users**] → Mitigated by explicit copy: "Default for new invoices and new customers. Existing records keep their saved currency."

## Migration Plan

Pure rules + UI change. No data migration required.

**Deploy order:**

1. `npm run test:rules` — green required before deploy.
2. `npm run deploy:rules` — rules + indexes.
3. `npm run deploy:hosting` — Angular build with the Profile-page changes.

The order matters: if hosting deploys first, the new UI is live but the rules still reject admin gate-doc writes — admins would see save failures. Rules first means the rules are permissive before the UI calls them, which is harmless because no existing client invokes those rules.

**Rollback**: `firebase hosting:rollback` reverts the SPA; redeploy the previous `firestore.rules` from git via `git checkout <sha> -- firestore.rules && npm run deploy:rules`. Data is unchanged, so nothing to undo.

## Open Questions

- **Should super-admin Companies list show admin-edited names?** Yes by design — the gate doc is the single source of truth; super admin reads the same field admins wrote. No additional work needed.
- **Should the activity log eventually include "admin renamed company"?** Not part of MVP. If we add an audit collection later, the gate-doc `updatedAt`/`updatedBy` already gives us per-doc timestamps to feed it.
- **Should we ever allow the admin to change the company code?** Documented non-goal. If this comes up, a separate change must address: claim re-issuance, sub-collection path rename, login URL deep-links, customer/invoice references, and so on. Not in this scope.
