// admin-ops.mjs — operator CLI replacing the setUserClaims Cloud Function.
//
// Why this exists: BillEasy was designed around one Cloud Function that sets
// Firebase Auth custom claims (role + companyId). The Spark (free) plan no
// longer allows deploying functions, so until we upgrade to Blaze we do those
// privileged operations from an operator workstation via the Admin SDK.
//
// Setup:
//   1. Firebase Console -> Project Settings -> Service accounts ->
//      "Generate new private key". Save as ./service-account.json (gitignored).
//   2. Run commands below from the repo root.
//
// Production usage:
//   node admin-ops.mjs <command> <args...>
//
// Emulator usage (no service-account.json needed):
//   $env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
//   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
//   $env:GCLOUD_PROJECT="billeasy-mvp"
//   node admin-ops.mjs <command> <args...>

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';

const COMPANY_CODE = /^[a-z0-9-]{3,32}$/;
const CURRENCY = /^[A-Z]{3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isEmulator =
  !!process.env.FIREBASE_AUTH_EMULATOR_HOST || !!process.env.FIRESTORE_EMULATOR_HOST;

if (isEmulator) {
  process.env.GCLOUD_PROJECT ??= 'billeasy-mvp';
  initializeApp({ projectId: process.env.GCLOUD_PROJECT });
} else {
  if (!existsSync('./service-account.json')) {
    console.error('Missing ./service-account.json. See Firebase Console -> Project Settings -> Service accounts.');
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync('./service-account.json', 'utf8'));
  initializeApp({ credential: cert(sa) });
}

const auth = getAuth();
const db = getFirestore();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function findOrCreateUser(email, displayName) {
  try {
    return (await auth.getUserByEmail(email)).uid;
  } catch (e) {
    if (e?.errorInfo?.code !== 'auth/user-not-found') throw e;
    const created = await auth.createUser({ email, displayName, emailVerified: false, disabled: false });
    return created.uid;
  }
}

async function bootstrapSuperAdmin(email, displayName) {
  assert(EMAIL.test(email), 'Invalid email');
  assert(displayName?.length, 'Display name required');
  const uid = await findOrCreateUser(email, displayName);
  await auth.setCustomUserClaims(uid, { role: 'super-admin' });
  await db.doc(`superAdmins/${uid}`).set(
    { uid, email, displayName, createdAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  const link = await auth.generatePasswordResetLink(email);
  console.log(`Super admin ready. uid=${uid}`);
  console.log(`Password reset link:\n${link}`);
}

async function createCompany(code, name, currency, adminEmail, adminName) {
  assert(COMPANY_CODE.test(code), 'company code must match /^[a-z0-9-]{3,32}$/');
  assert(name?.length, 'company name required');
  assert(CURRENCY.test(currency), 'currency must be ISO 4217 (e.g. USD)');
  assert(EMAIL.test(adminEmail), 'invalid admin email');
  assert(adminName?.length, 'admin display name required');

  const companyRef = db.doc(`companies/${code}`);
  if ((await companyRef.get()).exists) throw new Error(`Company "${code}" already exists`);

  const adminUid = await findOrCreateUser(adminEmail, adminName);
  await db.runTransaction(async (tx) => {
    tx.set(companyRef, {
      name,
      status: 'active',
      defaultCurrency: currency,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`companies/${code}/users/${adminUid}`), {
      uid: adminUid,
      email: adminEmail,
      displayName: adminName,
      role: 'company-admin',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'cli',
    });
  });
  await auth.setCustomUserClaims(adminUid, { role: 'company-admin', companyId: code });
  const link = await auth.generatePasswordResetLink(adminEmail);
  console.log(`Company "${code}" created. Admin uid=${adminUid}`);
  console.log(`Password reset link:\n${link}`);
}

async function setCompanyStatus(code, status) {
  assert(COMPANY_CODE.test(code), 'bad company code');
  assert(['active', 'inactive'].includes(status), 'status must be active|inactive');
  const ref = db.doc(`companies/${code}`);
  if (!(await ref.get()).exists) throw new Error('Company not found');
  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
  console.log(`${code} -> ${status}`);
}

async function createCompanyAdmin(code, email, displayName) {
  assert(COMPANY_CODE.test(code), 'bad company code');
  assert(EMAIL.test(email), 'invalid email');
  assert(displayName?.length, 'display name required');
  if (!(await db.doc(`companies/${code}`).get()).exists) throw new Error('Company not found');

  const uid = await findOrCreateUser(email, displayName);
  await auth.setCustomUserClaims(uid, { role: 'company-admin', companyId: code });
  await db.doc(`companies/${code}/users/${uid}`).set({
    uid,
    email,
    displayName,
    role: 'company-admin',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: 'cli',
  });
  const link = await auth.generatePasswordResetLink(email);
  console.log(`Company admin added to "${code}". uid=${uid}`);
  console.log(`Password reset link:\n${link}`);
}

async function createCompanyUser(code, email, displayName) {
  assert(COMPANY_CODE.test(code), 'bad company code');
  assert(EMAIL.test(email), 'invalid email');
  assert(displayName?.length, 'display name required');
  const snap = await db.doc(`companies/${code}`).get();
  if (!snap.exists || snap.data().status !== 'active') throw new Error('Company is not active');

  const uid = await findOrCreateUser(email, displayName);
  await auth.setCustomUserClaims(uid, { role: 'company-user', companyId: code });
  await db.doc(`companies/${code}/users/${uid}`).set({
    uid,
    email,
    displayName,
    role: 'company-user',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: 'cli',
  });
  const link = await auth.generatePasswordResetLink(email);
  console.log(`User added to "${code}". uid=${uid}`);
  console.log(`Password reset link:\n${link}`);
}

async function resetPassword(email) {
  assert(email?.includes('@'), 'valid email required');
  // Sanity: confirm the user actually exists so a typo doesn't silently mint
  // a worthless link.
  try {
    await auth.getUserByEmail(email);
  } catch {
    throw new Error(`No Firebase Auth user found for ${email}`);
  }
  const link = await auth.generatePasswordResetLink(email);
  console.log(`Password reset link for ${email}:\n${link}`);
}

async function removeCompanyUser(code, uid) {
  assert(COMPANY_CODE.test(code), 'bad company code');
  assert(uid?.length, 'uid required');
  const ref = db.doc(`companies/${code}/users/${uid}`);
  if (!(await ref.get()).exists) throw new Error('User not found in this company');
  await auth.updateUser(uid, { disabled: true });
  await auth.setCustomUserClaims(uid, null);
  await ref.delete();
  console.log(`Removed ${uid} from ${code}`);
}

function usage() {
  console.error([
    'BillEasy operator CLI',
    '',
    'Commands:',
    '  bootstrap-super-admin <email> <"display name">',
    '  create-company <code> <"name"> <CURRENCY> <admin-email> <"admin name">',
    '  set-company-status <code> <active|inactive>',
    '  create-company-admin <code> <email> <"display name">',
    '  create-company-user <code> <email> <"display name">',
    '  remove-company-user <code> <uid>',
    '  reset-password <email>                          (regenerate a one-shot reset link)',
    '',
    'Connection:',
    '  Production : requires ./service-account.json next to this script.',
    '  Emulator   : set FIREBASE_AUTH_EMULATOR_HOST + FIRESTORE_EMULATOR_HOST first.',
  ].join('\n'));
  process.exit(1);
}

const [, , cmd, ...rest] = process.argv;
const ops = {
  'bootstrap-super-admin': () => bootstrapSuperAdmin(rest[0], rest[1]),
  'create-company': () => createCompany(rest[0], rest[1], rest[2], rest[3], rest[4]),
  'set-company-status': () => setCompanyStatus(rest[0], rest[1]),
  'create-company-admin': () => createCompanyAdmin(rest[0], rest[1], rest[2]),
  'create-company-user': () => createCompanyUser(rest[0], rest[1], rest[2]),
  'remove-company-user': () => removeCompanyUser(rest[0], rest[1]),
  'reset-password': () => resetPassword(rest[0]),
};
if (!ops[cmd]) usage();

ops[cmd]().catch((e) => {
  console.error('Error:', e.message ?? e);
  process.exit(1);
});
