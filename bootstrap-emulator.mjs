// One-time bootstrap: create a super admin in the local Firebase emulator.
// Run with the emulator running:  node bootstrap-emulator.mjs
//
// Defaults: email=super@local.test, password=Password1!
// Override via env vars: SUPER_EMAIL, SUPER_PASSWORD

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ??= 'billeasy-mvp';

const email = process.env.SUPER_EMAIL ?? 'super@local.test';
const password = process.env.SUPER_PASSWORD ?? 'Password1!';
const displayName = 'Local Super Admin';

initializeApp({ projectId: process.env.GCLOUD_PROJECT });

const auth = getAuth();
const db = getFirestore();

let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password, emailVerified: true });
} catch {
  user = await auth.createUser({ email, password, displayName, emailVerified: true });
}

await auth.setCustomUserClaims(user.uid, { role: 'super-admin' });
await db.doc(`superAdmins/${user.uid}`).set(
  { uid: user.uid, email, displayName, createdAt: FieldValue.serverTimestamp() },
  { merge: true }
);

console.log('Super admin ready in the emulator:');
console.log('  email:    ', email);
console.log('  password: ', password);
console.log('  uid:      ', user.uid);
console.log('Sign in at http://localhost:4200/super-admin/login');
