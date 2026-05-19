## Why

Today only the super admin can set a company's display **name** and **default currency** — they're captured at company-creation time on the `/super-admin/companies` form and written into the public gate document at `/companies/{cid}`. After that, the company admin has no way to correct a typo in their company name or switch the default currency (e.g. from `USD` to `INR`) without contacting the platform operator. That puts every cosmetic edit through a support loop, and it leaks who-owns-what nuance into the super admin's queue. The values aren't security-bearing — name and `defaultCurrency` already live in a publicly-readable document — so there is no good reason to keep them locked to super-admin write.

This change gives the company admin self-service over their **own** company's display name and default currency, surfaced inside the existing `/app/profile` page so they have a single place to manage everything that prints on their invoices. The company **code** (the gate doc ID, used for login and tenant isolation) and **status** (active/inactive) remain super-admin-only — those are platform-control concerns, not tenant cosmetics.

## What Changes

- Add a new **"Company" section** at the top of the `/app/profile` page (above the existing "Header info" / "Footer / Payment info" / "Signature & Disclaimer" sections), showing:
  - **Company code** — read-only, with a small "(set by platform admin)" hint.
  - **Status** — read-only badge (`active` / `inactive`) with the same hint.
  - **Company name** — editable text input, validated 1–120 chars, required.
  - **Default currency** — editable text input, validated `^[A-Z]{3}$`, auto-uppercase on input (mirroring the existing super-admin form pattern).
- Persist edits to the existing public gate document at `/companies/{cid}` — same field shape; no new fields, no new documents.
- Update **Firestore Security Rules** to allow `company-admin` of a tenant to update **only** the `name` and `defaultCurrency` fields of their own gate document. Status, document creation, and document deletion remain super-admin-only. The rule MUST guarantee that an admin attempt to change `status` (or add new fields) is denied.
- Update **rules tests** to cover the new admin-update path (allow), and the forbidden paths (cross-tenant admin update, admin attempting to change status, non-admin attempt, super-admin behaviour unchanged).
- Add a small consistency safeguard in the Profile editor: when the admin changes `defaultCurrency` and **also** has an in-flight unsaved invoice-template edit, both writes are committed together via a single `Promise.all` so the user perceives one Save action. (No transactional guarantee across the two docs — they're independent — but the user-visible save flow is unified.)
- After a successful save, **invalidate the company-gate cache** in `CompanyService.getGate` so the next invoice PDF download picks up the new values without a page reload. (Mirrors the existing `CompanyProfileService.invalidate()` pattern from `invoice-branding`.)

## Capabilities

### New Capabilities

<!-- None — this change extends existing capabilities only. -->

### Modified Capabilities

- `tenant-management`: company admins can now self-service the `name` and `defaultCurrency` fields of their own company gate document. Company code, document creation, status flips, and deletion remain super-admin-only.
- `company-profile`: the Profile page gains a "Company" section at the top that exposes the gate-doc fields the admin can edit (name, defaultCurrency) alongside the read-only ones (code, status).

## Impact

- **Code**: small UI additions to `src/app/features/profile/profile.component.ts`; a new `updateGateInfo(name, defaultCurrency)` method on `src/app/core/services/company.service.ts`; one new write path through the same `getGate`-style cache invalidation. No new routes; no new components; no new dependencies.
- **Rules**: extends `firestore.rules` `match /companies/{cid}` `allow update` branch to admit a tightly-constrained company-admin path (same-tenant + diff limited to `{name, defaultCurrency, updatedAt}` + status unchanged + code/id unchanged). New tests in `firestore-rules-tests/test/rules.test.ts`.
- **Data**: no schema change — uses the existing `name`, `defaultCurrency` fields on `/companies/{cid}`. The optional `updatedAt` field is set on edit (already part of the gate-fields whitelist).
- **Login flow**: unaffected. Company code is still the gate doc ID and unchanged by this feature; `name` change is purely cosmetic; `status` stays super-admin-only so admins cannot lock themselves out.
- **Downstream of currency change**: existing invoices and customers continue to carry their snapshotted currencies. Only **new** invoices created after the change default to the new currency. Documented in `design.md`.
- **Quota**: one extra read (the company gate) per Profile page load, one extra write per Save — negligible relative to the Spark plan budget in `docs/quota-budget.md`.
- **Out of scope** (deferred): editing the company code (the doc ID — would be a destructive rename); admin changing status; multiple admins concurrently editing the same field (last-write-wins is acceptable for MVP); audit log of who-edited-when beyond `updatedAt`.
