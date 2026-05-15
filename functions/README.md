# Cloud Functions — `setUserClaims`

This is the **only** server-side code in the BillEasy app. All other operations go directly from the Angular client to Firestore, gated by Firestore Security Rules.

## Why a function?

Firebase Auth custom claims (`role`, `companyId`) can only be set with the Admin SDK. The client cannot set them. So we expose a single `https.onCall` function that:

1. Authenticates the caller via `request.auth`.
2. Authorizes the caller against the requested operation (a `super-admin` can create companies; a `company-admin` can create `company-user`s in their own tenant only).
3. Performs the privileged work: create a Firebase Auth user, write `role`/`companyId` claims, write the tenant `/companies/{cid}/users/{uid}` directory document, and (for new users) return a password-reset link the admin shares out-of-band.

## Request contract

The function accepts a discriminated-union request body. The `op` field selects the operation:

### `op: 'create-company'` *(super-admin only)*

```jsonc
{
  "op": "create-company",
  "companyCode": "acme-co",          // ^[a-z0-9-]{3,32}$
  "companyName": "Acme Co.",
  "defaultCurrency": "USD",          // ISO 4217
  "adminEmail": "alice@acme.example",
  "adminDisplayName": "Alice Smith"
}
```

Creates `/companies/acme-co` (gate doc), creates the Firebase Auth user, sets claims `{ role: 'company-admin', companyId: 'acme-co' }`, writes `/companies/acme-co/users/{uid}`, returns `{ uid, passwordResetLink }`.

### `op: 'set-company-status'` *(super-admin only)*

```jsonc
{ "op": "set-company-status", "companyCode": "acme-co", "status": "inactive" }
```

Flips the gate doc's `status`. Active users keep their session until token refresh (see [design.md](../openspec/changes/billeasy-mvp/design.md#decisions) Decision 8).

### `op: 'create-company-admin'` *(super-admin only)*

```jsonc
{ "op": "create-company-admin", "companyCode": "acme-co", "email": "bob@acme.example", "displayName": "Bob" }
```

Adds another `company-admin` to an existing company.

### `op: 'create-company-user'` *(company-admin only)*

```jsonc
{ "op": "create-company-user", "email": "carol@acme.example", "displayName": "Carol" }
```

The `companyId` is taken from the caller's claims — a `company-admin` of `acme-co` can only create users in `acme-co`. There is no field that lets the caller override this.

### `op: 'remove-company-user'` *(company-admin only)*

```jsonc
{ "op": "remove-company-user", "uid": "abc123" }
```

Disables the Auth user, clears claims, deletes the directory document. A caller cannot remove themselves.

## Response contract

```jsonc
{ "ok": true, "uid": "abc123", "passwordResetLink": "https://..." /* present only for create-* ops */ }
```

Errors are returned as `HttpsError` with one of: `unauthenticated`, `permission-denied`, `invalid-argument`, `not-found`, `already-exists`, `failed-precondition`.

## Development

```bash
npm install            # from this folder
npm run build          # tsc → lib/
npm test               # vitest, expects emulators to be running
```

## Deployment

Deployed automatically via the root `npm run deploy:functions`. The function runs in `us-central1` and uses the Node 20 runtime — both within the Spark plan.
