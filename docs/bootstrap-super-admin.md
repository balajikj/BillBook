# Bootstrapping the first super admin

The `setUserClaims` Cloud Function requires the caller to *already* have `role: 'super-admin'` to onboard companies — chicken-and-egg. Use this one-time script to create the very first super admin against any Firebase project (production or emulator).

**This script is NOT shipped with the deployed app.** Run it locally from a workstation that has the Firebase Admin credentials.

## Prerequisites

- Node 20+
- A service-account key JSON for the target Firebase project (Console → Project Settings → Service Accounts → Generate new private key). Save it locally as `service-account.json` and **never commit it**.
- Email/password Auth provider enabled on the project.

## The script

Save as `bootstrap-super-admin.mjs` (gitignored; do not check in):

```js
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const [, , email, displayName] = process.argv;
if (!email || !displayName) {
  console.error('Usage: node bootstrap-super-admin.mjs <email> "<display name>"');
  process.exit(1);
}

initializeApp({ credential: cert('./service-account.json') });

async function main() {
  const auth = getAuth();
  const db = getFirestore();

  let user;
  try { user = await auth.getUserByEmail(email); }
  catch { user = await auth.createUser({ email, displayName, emailVerified: false }); }

  await auth.setCustomUserClaims(user.uid, { role: 'super-admin' });
  await db.doc(`superAdmins/${user.uid}`).set({
    uid: user.uid, email, displayName, createdAt: FieldValue.serverTimestamp()
  });

  const link = await auth.generatePasswordResetLink(email);
  console.log('Super admin created.');
  console.log('Send this single-use password reset link to the user:');
  console.log(link);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

## Run

```bash
node bootstrap-super-admin.mjs alice@billeasy.example "Alice the Super Admin"
```

The script prints a password-reset link. Send it to the new super admin out-of-band; they set their password and can sign in at `/super-admin/login`.

## Running against the emulator

If you want to bootstrap a super admin in the **emulator** (e.g. for the smoke test), set these env vars before running the script:

```bash
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
node bootstrap-super-admin.mjs alice@local.test "Alice"
```

In emulator mode, `generatePasswordResetLink` returns a link pointing at the local Auth Emulator UI; sign in directly with the test password via the emulator UI or set a password using the Admin SDK.

## After bootstrap

Subsequent super admins can be created by the existing super admin via... actually, this MVP does not expose a "create another super admin" UI. To add more, rerun this script. Future work: add a super-admin self-management page.
