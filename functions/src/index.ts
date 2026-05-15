import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

if (getApps().length === 0) {
  initializeApp();
}

// ----- shared types / validators -----

const COMPANY_CODE_REGEX = /^[a-z0-9-]{3,32}$/;
const CURRENCY_REGEX = /^[A-Z]{3}$/;

const createCompanySchema = z.object({
  op: z.literal('create-company'),
  companyCode: z.string().regex(COMPANY_CODE_REGEX),
  companyName: z.string().min(1).max(120),
  defaultCurrency: z.string().regex(CURRENCY_REGEX),
  adminEmail: z.string().email(),
  adminDisplayName: z.string().min(1).max(120)
});

const setCompanyStatusSchema = z.object({
  op: z.literal('set-company-status'),
  companyCode: z.string().regex(COMPANY_CODE_REGEX),
  status: z.enum(['active', 'inactive'])
});

const createCompanyAdminSchema = z.object({
  op: z.literal('create-company-admin'),
  companyCode: z.string().regex(COMPANY_CODE_REGEX),
  email: z.string().email(),
  displayName: z.string().min(1).max(120)
});

const createCompanyUserSchema = z.object({
  op: z.literal('create-company-user'),
  // Note: companyCode is intentionally omitted — caller's claim is the
  // source of truth for which tenant the new user joins.
  email: z.string().email(),
  displayName: z.string().min(1).max(120)
});

const removeCompanyUserSchema = z.object({
  op: z.literal('remove-company-user'),
  uid: z.string().min(1)
});

const requestSchema = z.discriminatedUnion('op', [
  createCompanySchema,
  setCompanyStatusSchema,
  createCompanyAdminSchema,
  createCompanyUserSchema,
  removeCompanyUserSchema
]);

type SetUserClaimsRequest = z.infer<typeof requestSchema>;

interface SetUserClaimsResult {
  ok: true;
  uid?: string;
  passwordResetLink?: string;
  message?: string;
}

// ----- helpers -----

function requireAuth(req: CallableRequest<unknown>): { uid: string; role?: string; companyId?: string } {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  return {
    uid: req.auth.uid,
    role: req.auth.token.role as string | undefined,
    companyId: req.auth.token.companyId as string | undefined
  };
}

function denyIf(condition: boolean, msg: string): void {
  if (condition) {
    throw new HttpsError('permission-denied', msg);
  }
}

async function createOrFindUser(email: string, displayName: string): Promise<string> {
  // Try to find; create if missing. The Admin SDK throws auth/user-not-found
  // when the user doesn't exist.
  try {
    const existing = await getAuth().getUserByEmail(email);
    return existing.uid;
  } catch (err: any) {
    if (err?.errorInfo?.code !== 'auth/user-not-found') throw err;
    const created = await getAuth().createUser({ email, displayName, emailVerified: false, disabled: false });
    return created.uid;
  }
}

async function generateResetLink(email: string): Promise<string> {
  // For password-first onboarding: returns a single-use link the caller can
  // pass on to the new user out-of-band. Production should configure ActionCodeSettings
  // here so the link points at the SPA's reset page; for MVP we use the default.
  return await getAuth().generatePasswordResetLink(email);
}

// ----- handlers -----

async function handleCreateCompany(
  payload: z.infer<typeof createCompanySchema>,
  caller: { uid: string; role?: string; companyId?: string }
): Promise<SetUserClaimsResult> {
  denyIf(caller.role !== 'super-admin', 'Only super admins may create companies.');

  const db = getFirestore();
  const companyRef = db.doc(`companies/${payload.companyCode}`);
  const snap = await companyRef.get();
  if (snap.exists) {
    throw new HttpsError('already-exists', 'Company code is already taken.');
  }

  // Create the company gate doc + the bootstrap admin atomically.
  const adminUid = await createOrFindUser(payload.adminEmail, payload.adminDisplayName);

  await db.runTransaction(async (tx) => {
    tx.set(companyRef, {
      name: payload.companyName,
      status: 'active',
      defaultCurrency: payload.defaultCurrency,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(db.doc(`companies/${payload.companyCode}/users/${adminUid}`), {
      uid: adminUid,
      email: payload.adminEmail,
      displayName: payload.adminDisplayName,
      role: 'company-admin',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid
    });
  });

  await getAuth().setCustomUserClaims(adminUid, {
    role: 'company-admin',
    companyId: payload.companyCode
  });

  const passwordResetLink = await generateResetLink(payload.adminEmail);
  return { ok: true, uid: adminUid, passwordResetLink };
}

async function handleSetCompanyStatus(
  payload: z.infer<typeof setCompanyStatusSchema>,
  caller: { role?: string }
): Promise<SetUserClaimsResult> {
  denyIf(caller.role !== 'super-admin', 'Only super admins may change company status.');
  const db = getFirestore();
  const companyRef = db.doc(`companies/${payload.companyCode}`);
  const snap = await companyRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Company not found.');
  await companyRef.update({
    status: payload.status,
    updatedAt: FieldValue.serverTimestamp()
  });
  return { ok: true };
}

async function handleCreateCompanyAdmin(
  payload: z.infer<typeof createCompanyAdminSchema>,
  caller: { uid: string; role?: string }
): Promise<SetUserClaimsResult> {
  denyIf(caller.role !== 'super-admin', 'Only super admins may create company admins.');

  const db = getFirestore();
  const companySnap = await db.doc(`companies/${payload.companyCode}`).get();
  if (!companySnap.exists) throw new HttpsError('not-found', 'Company not found.');

  const uid = await createOrFindUser(payload.email, payload.displayName);
  await getAuth().setCustomUserClaims(uid, {
    role: 'company-admin',
    companyId: payload.companyCode
  });
  await db.doc(`companies/${payload.companyCode}/users/${uid}`).set({
    uid,
    email: payload.email,
    displayName: payload.displayName,
    role: 'company-admin',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: caller.uid
  });

  const passwordResetLink = await generateResetLink(payload.email);
  return { ok: true, uid, passwordResetLink };
}

async function handleCreateCompanyUser(
  payload: z.infer<typeof createCompanyUserSchema>,
  caller: { uid: string; role?: string; companyId?: string }
): Promise<SetUserClaimsResult> {
  denyIf(caller.role !== 'company-admin', 'Only company admins may create users in their company.');
  const companyId = caller.companyId;
  if (!companyId) throw new HttpsError('permission-denied', 'Caller has no companyId claim.');

  const db = getFirestore();
  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists || companySnap.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Your company is not active.');
  }

  const uid = await createOrFindUser(payload.email, payload.displayName);
  await getAuth().setCustomUserClaims(uid, {
    role: 'company-user',
    companyId
  });
  await db.doc(`companies/${companyId}/users/${uid}`).set({
    uid,
    email: payload.email,
    displayName: payload.displayName,
    role: 'company-user',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: caller.uid
  });

  const passwordResetLink = await generateResetLink(payload.email);
  return { ok: true, uid, passwordResetLink };
}

async function handleRemoveCompanyUser(
  payload: z.infer<typeof removeCompanyUserSchema>,
  caller: { uid: string; role?: string; companyId?: string }
): Promise<SetUserClaimsResult> {
  denyIf(caller.role !== 'company-admin', 'Only company admins may remove users.');
  const companyId = caller.companyId;
  if (!companyId) throw new HttpsError('permission-denied', 'Caller has no companyId claim.');
  if (payload.uid === caller.uid) {
    throw new HttpsError('failed-precondition', 'You cannot remove yourself.');
  }

  const db = getFirestore();
  const userDocRef = db.doc(`companies/${companyId}/users/${payload.uid}`);
  const userSnap = await userDocRef.get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'User not found in this company.');

  // Disable the auth account, clear claims (defensive), and delete the directory doc.
  await getAuth().updateUser(payload.uid, { disabled: true });
  await getAuth().setCustomUserClaims(payload.uid, null);
  await userDocRef.delete();
  return { ok: true, uid: payload.uid };
}

// ----- exported callable -----

export const setUserClaims = onCall<SetUserClaimsRequest, Promise<SetUserClaimsResult>>(
  { region: 'us-central1' },
  async (req) => {
    const caller = requireAuth(req);
    let payload: SetUserClaimsRequest;
    try {
      payload = requestSchema.parse(req.data);
    } catch (e: any) {
      throw new HttpsError('invalid-argument', `Invalid request: ${e?.message ?? 'bad payload'}`);
    }

    switch (payload.op) {
      case 'create-company':
        return handleCreateCompany(payload, caller);
      case 'set-company-status':
        return handleSetCompanyStatus(payload, caller);
      case 'create-company-admin':
        return handleCreateCompanyAdmin(payload, caller);
      case 'create-company-user':
        return handleCreateCompanyUser(payload, caller);
      case 'remove-company-user':
        return handleRemoveCompanyUser(payload, caller);
    }
  }
);
