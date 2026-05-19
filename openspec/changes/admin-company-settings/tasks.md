## 1. Firestore rules

- [x] 1.1 Add an `isAdminGateUpdate(cid)` helper to `firestore.rules` that returns true iff: `isCompanyAdmin()` AND `request.auth.token.companyId == cid` AND `request.resource.data.keys().hasOnly(['name','status','defaultCurrency','createdAt','updatedAt'])` AND `request.resource.data.status == resource.data.status` AND `request.resource.data.name is string && request.resource.data.name.size() >= 1 && request.resource.data.name.size() <= 120` AND `request.resource.data.defaultCurrency.matches('^[A-Z]{3}$')`.
- [x] 1.2 Extend the `allow update` line for `match /companies/{cid}` so it reads `if (isSuperAdmin() && hasOnlyGateFields()) || isAdminGateUpdate(cid);`. Leave create/delete unchanged (super-admin only).
- [x] 1.3 If the `isCompanyAdmin()` helper was deleted as "unused" in a prior cleanup, restore it (it's now used by `isAdminGateUpdate`). _Helper was already present — no change needed._

## 2. Rules tests

- [x] 2.1 In `firestore-rules-tests/test/rules.test.ts`, extend the existing `describe('companies (gate document)', …)` block with cases matching each scenario in `specs/tenant-management/spec.md`.
- [ ] 2.2 Confirm `npm run test:rules` is green locally before any deploy. _**Owner action** — requires Java + emulator running._

## 3. CompanyService updates

- [x] 3.1 Add `updateGateInfo(args: { name: string; defaultCurrency: string }): Promise<void>` to `src/app/core/services/company.service.ts`.
- [x] 3.2 Add an `invalidate(): void` no-op on `CompanyService` so consumers can call it after a save.
- [x] 3.3 Throw a typed error with a clear message if client-side validation rejects the args.

## 4. Profile page — Company section

- [x] 4.1 Extend the reactive form with a new `company` FormGroup (`code`/`status` disabled; `name`/`defaultCurrency` editable with required + length/regex validators).
- [x] 4.2 Render the section as the first card on the page, above Header info.
- [x] 4.3 Auto-uppercase the Default currency input on every keystroke (reused `autoUppercase()` helper).
- [x] 4.4 Inline hint under Default currency: "Default for new invoices and new customers; existing records keep their saved currency."
- [x] 4.5 Per-field inline errors via existing `showError(control)` pattern when Name or Default currency is invalid + touched/dirty.
- [x] 4.6 Constructor fetches gate doc alongside invoice template via `Promise.all`.
- [x] 4.7 Patch the form's `company` group from the loaded gate doc and mark pristine.
- [x] 4.8 `onSave()` inspects `form.controls.company.dirty` and runs the two writes with `Promise.allSettled` for per-document error attribution.
- [x] 4.9 After a successful save, invalidate the company cache and re-fetch.

## 5. Smoke test docs

- [x] 5.1 New step `3b` in `docs/smoke-test.md` walks the Company-section edit + PDF re-download + new-invoice currency check.
- [x] 5.2 Negative tests for blank name and bad currency documented in the same step.

## 6. README

- [x] 6.1 Updated the Roles table row for `company-admin` to include "edit own company name + default currency".
- [x] 6.2 Added a Non-goals bullet that the company **code** and **status** stay super-admin-only.

## 7. Build & verify

- [x] 7.1 `npm run build` — completed with no errors and no new warnings.
- [ ] 7.2 `npm run test:rules` — the new rules tests must pass. _**Owner action**._
- [ ] 7.3 Manually walk the new smoke-test step against the emulator suite. _**Owner action**._

## 8. Deploy

- [ ] 8.1 Deploy in this order: `npm run deploy:rules` first, then `npm run deploy:hosting`. _**Owner action** — rules deploy is required because the UI's new Save flow calls update paths that the live rules currently reject._
