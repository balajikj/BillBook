import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ID = 'billeasy-rules-test';
const COMPANY_A = 'acme-co';
const COMPANY_B = 'other-co';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '..', '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080
    }
  });
});

afterAll(async () => { await env.cleanup(); });

beforeEach(async () => { await env.clearFirestore(); });

function adminCtx(companyId: string) {
  return env.authenticatedContext('admin-' + companyId, {
    role: 'company-admin',
    companyId
  });
}
function userCtx(companyId: string) {
  return env.authenticatedContext('user-' + companyId, {
    role: 'company-user',
    companyId
  });
}
function superCtx() {
  return env.authenticatedContext('super-1', { role: 'super-admin' });
}
function anonCtx() {
  return env.unauthenticatedContext();
}

async function seedCompany(code: string, status: 'active' | 'inactive' = 'active') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'companies', code), {
      name: code.toUpperCase(),
      status,
      defaultCurrency: 'USD'
    });
  });
}

describe('companies (gate document)', () => {
  it('allows anonymous read of /companies/{cid}', async () => {
    await seedCompany(COMPANY_A);
    const db = anonCtx().firestore();
    await assertSucceeds(getDoc(doc(db, 'companies', COMPANY_A)));
  });

  it('denies anonymous list of /companies', async () => {
    await seedCompany(COMPANY_A);
    const db = anonCtx().firestore();
    await assertFails(getDocs(collection(db, 'companies')));
  });

  it('denies non-super-admin from creating a company', async () => {
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(setDoc(doc(db, 'companies', 'fake-co'), {
      name: 'Fake', status: 'active', defaultCurrency: 'USD'
    }));
  });

  it('allows super-admin to create a company with gate-only fields', async () => {
    const db = superCtx().firestore();
    await assertSucceeds(setDoc(doc(db, 'companies', 'newco'), {
      name: 'NewCo', status: 'active', defaultCurrency: 'USD'
    }));
  });

  it('rejects super-admin company create with an invalid code', async () => {
    const db = superCtx().firestore();
    await assertFails(setDoc(doc(db, 'companies', 'BAD CODE'), {
      name: 'Bad', status: 'active', defaultCurrency: 'USD'
    }));
  });

  // ----- admin self-service of name + defaultCurrency (added by admin-company-settings) -----

  it('company-admin CAN update only `name` of their own gate doc', async () => {
    await seedCompany(COMPANY_A);
    const db = adminCtx(COMPANY_A).firestore();
    await assertSucceeds(updateDoc(doc(db, 'companies', COMPANY_A), {
      name: 'Acme Trading Co.'
    }));
  });

  it('company-admin CAN update only `defaultCurrency` of their own gate doc', async () => {
    await seedCompany(COMPANY_A);
    const db = adminCtx(COMPANY_A).firestore();
    await assertSucceeds(updateDoc(doc(db, 'companies', COMPANY_A), {
      defaultCurrency: 'INR'
    }));
  });

  it('company-admin CANNOT change `status`', async () => {
    await seedCompany(COMPANY_A, 'inactive');
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(updateDoc(doc(db, 'companies', COMPANY_A), {
      status: 'active'
    }));
  });

  it('company-admin CANNOT update another tenant gate doc', async () => {
    await seedCompany(COMPANY_A);
    await seedCompany(COMPANY_B);
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(updateDoc(doc(db, 'companies', COMPANY_B), {
      name: 'Hijacked'
    }));
  });

  it('company-admin CANNOT add a new top-level field', async () => {
    await seedCompany(COMPANY_A);
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(updateDoc(doc(db, 'companies', COMPANY_A), {
      customField: 'value'
    }));
  });

  it('company-admin CANNOT submit an empty `name`', async () => {
    await seedCompany(COMPANY_A);
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(updateDoc(doc(db, 'companies', COMPANY_A), {
      name: ''
    }));
  });

  it('company-admin CANNOT submit a lowercase `defaultCurrency`', async () => {
    await seedCompany(COMPANY_A);
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(updateDoc(doc(db, 'companies', COMPANY_A), {
      defaultCurrency: 'usd'
    }));
  });

  it('company-admin CANNOT submit a 4-letter `defaultCurrency`', async () => {
    await seedCompany(COMPANY_A);
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(updateDoc(doc(db, 'companies', COMPANY_A), {
      defaultCurrency: 'USDX'
    }));
  });

  it('non-admin (company-user) CANNOT update gate doc', async () => {
    await seedCompany(COMPANY_A);
    const db = userCtx(COMPANY_A).firestore();
    await assertFails(updateDoc(doc(db, 'companies', COMPANY_A), {
      name: 'Forbidden'
    }));
  });

  it('company-admin CANNOT create a new gate doc', async () => {
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(setDoc(doc(db, 'companies', 'new-tenant-co'), {
      name: 'New', status: 'active', defaultCurrency: 'USD'
    }));
  });

  it('company-admin CANNOT delete their own gate doc', async () => {
    await seedCompany(COMPANY_A);
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(deleteDoc(doc(db, 'companies', COMPANY_A)));
  });

  it('super-admin behaviour unchanged: status flip still allowed', async () => {
    await seedCompany(COMPANY_A);
    const db = superCtx().firestore();
    await assertSucceeds(updateDoc(doc(db, 'companies', COMPANY_A), {
      status: 'inactive'
    }));
  });
});

describe('customers (per-tenant isolation)', () => {
  beforeEach(async () => { await seedCompany(COMPANY_A); await seedCompany(COMPANY_B); });

  it('admin in company A can create/read customers in company A', async () => {
    const db = adminCtx(COMPANY_A).firestore();
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_A}/customers/c1`), { name: 'Customer 1' }));
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_A}/customers/c1`)));
  });

  it('admin in company A CANNOT read customers in company B', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `companies/${COMPANY_B}/customers/c1`), { name: 'Foreign' });
    });
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(getDoc(doc(db, `companies/${COMPANY_B}/customers/c1`)));
  });

  it('non-admin in company A can READ but NOT write customers', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `companies/${COMPANY_A}/customers/c1`), { name: 'Customer 1' });
    });
    const db = userCtx(COMPANY_A).firestore();
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_A}/customers/c1`)));
    await assertFails(setDoc(doc(db, `companies/${COMPANY_A}/customers/c2`), { name: 'Forbidden' }));
  });

  it('unauthenticated client CANNOT read any customer', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `companies/${COMPANY_A}/customers/c1`), { name: 'Customer 1' });
    });
    const db = anonCtx().firestore();
    await assertFails(getDoc(doc(db, `companies/${COMPANY_A}/customers/c1`)));
  });

  it('admin can write a customer with India-specific fields (GSTIN, shopName, fullAddress, phoneNumber)', async () => {
    const db = adminCtx(COMPANY_A).firestore();
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_A}/customers/c-india`), {
      name: 'Globex Traders',
      phoneNumber: '+91 9876543210',
      shopName: 'Globex Mart',
      fullAddress: '12 MG Road, Bengaluru 560001',
      gstNumber: '29ABCDE1234F1Z5'
    }));
  });

  it('admin in company A CANNOT read company B customer with India fields populated', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `companies/${COMPANY_B}/customers/c-india`), {
        name: 'Foreign', shopName: 'Foreign Mart', gstNumber: '07ZZZZZ1234Z1Z5'
      });
    });
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(getDoc(doc(db, `companies/${COMPANY_B}/customers/c-india`)));
  });
});

describe('products (per-tenant isolation)', () => {
  beforeEach(async () => { await seedCompany(COMPANY_A); });

  it('admin can write products in their tenant', async () => {
    const db = adminCtx(COMPANY_A).firestore();
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_A}/products/p1`), {
      name: 'P1', unitPrice: 10, currency: 'USD'
    }));
  });

  it('non-admin CANNOT create or wholesale-replace a product', async () => {
    const db = userCtx(COMPANY_A).firestore();
    await assertFails(setDoc(doc(db, `companies/${COMPANY_A}/products/p1`), {
      name: 'P1', unitPrice: 10, currency: 'USD'
    }));
  });

  it('non-admin CAN update only the quantity field of an existing product (inventory diff)', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_A}/products/p1`), {
        name: 'P1', unitPrice: 10, currency: 'USD', quantity: 5
      });
    });
    const db = userCtx(COMPANY_A).firestore();
    await assertSucceeds(updateDoc(doc(db, `companies/${COMPANY_A}/products/p1`), {
      quantity: 4
    }));
  });

  it('non-admin CANNOT update price or name via the inventory path', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_A}/products/p1`), {
        name: 'P1', unitPrice: 10, currency: 'USD', quantity: 5
      });
    });
    const db = userCtx(COMPANY_A).firestore();
    await assertFails(updateDoc(doc(db, `companies/${COMPANY_A}/products/p1`), {
      name: 'Hijacked', quantity: 4
    }));
    await assertFails(updateDoc(doc(db, `companies/${COMPANY_A}/products/p1`), {
      unitPrice: 99999
    }));
  });

  it('non-admin CANNOT delete a product', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_A}/products/p1`), {
        name: 'P1', unitPrice: 10, currency: 'USD'
      });
    });
    const db = userCtx(COMPANY_A).firestore();
    await assertFails(deleteDoc(doc(db, `companies/${COMPANY_A}/products/p1`)));
  });
});

describe('invoices (creation, status guard, cross-tenant)', () => {
  beforeEach(async () => { await seedCompany(COMPANY_A); await seedCompany(COMPANY_B); });

  it('non-admin can create a pending invoice in their tenant', async () => {
    const ctx = userCtx(COMPANY_A);
    const db = ctx.firestore();
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_A}/invoices/i1`), {
      number: 'INV-2026-0001',
      customer: { id: 'c1', name: 'C', email: null, address: null },
      lineItems: [{ productId: null, description: 'x', quantity: 1, unitPrice: 1, lineTotal: 1 }],
      subtotal: 1, total: 1, currency: 'USD',
      status: 'pending',
      issueDate: Timestamp.now(),
      dueDate: Timestamp.now(),
      paidAt: null,
      notes: '',
      createdBy: ctx.firestore().app.options.appId ? 'user-' + COMPANY_A : 'user-' + COMPANY_A,
      createdAt: serverTimestamp()
    }));
  });

  it('non-admin CANNOT change invoice status (paid)', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_A}/invoices/i2`), {
        number: 'INV-2026-0002',
        customer: { id: 'c1', name: 'C', email: null, address: null },
        lineItems: [],
        subtotal: 0, total: 0, currency: 'USD',
        status: 'pending',
        issueDate: Timestamp.now(),
        dueDate: Timestamp.now(),
        paidAt: null,
        notes: '',
        createdBy: 'user-' + COMPANY_A
      });
    });
    const db = userCtx(COMPANY_A).firestore();
    await assertFails(updateDoc(doc(db, `companies/${COMPANY_A}/invoices/i2`), { status: 'paid' }));
  });

  it('admin CAN change invoice status', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_A}/invoices/i3`), {
        number: 'INV-2026-0003',
        customer: { id: 'c1', name: 'C', email: null, address: null },
        lineItems: [],
        subtotal: 0, total: 0, currency: 'USD',
        status: 'pending',
        issueDate: Timestamp.now(),
        dueDate: Timestamp.now(),
        paidAt: null,
        notes: '',
        createdBy: 'user-' + COMPANY_A
      });
    });
    const db = adminCtx(COMPANY_A).firestore();
    await assertSucceeds(updateDoc(doc(db, `companies/${COMPANY_A}/invoices/i3`), { status: 'paid' }));
  });

  it('cross-tenant invoice access is denied', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_B}/invoices/i1`), {
        number: 'X', status: 'pending', total: 1, currency: 'USD'
      });
    });
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(getDoc(doc(db, `companies/${COMPANY_B}/invoices/i1`)));
  });

  it('super-admin CANNOT read tenant invoices (platform-only role)', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_A}/invoices/i1`), {
        number: 'X', status: 'pending', total: 1, currency: 'USD'
      });
    });
    const db = superCtx().firestore();
    await assertFails(getDoc(doc(db, `companies/${COMPANY_A}/invoices/i1`)));
  });
});

describe('users directory & counters', () => {
  beforeEach(async () => { await seedCompany(COMPANY_A); });

  it('clients CANNOT directly write a user-directory entry (Cloud Function only)', async () => {
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(setDoc(doc(db, `companies/${COMPANY_A}/users/some-uid`), {
      uid: 'some-uid', email: 'x@y.z', displayName: 'X', role: 'company-user'
    }));
  });

  it('tenant member can read invoice counter (needed for transactional create)', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_A}/counters/invoice`), {
        year: 2026, next: 1
      });
    });
    const db = userCtx(COMPANY_A).firestore();
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_A}/counters/invoice`)));
  });
});

describe('invoice-template profile doc', () => {
  beforeEach(async () => { await seedCompany(COMPANY_A); await seedCompany(COMPANY_B); });

  it('admin in tenant A CAN write the template doc', async () => {
    const db = adminCtx(COMPANY_A).firestore();
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_A}/private/invoice-template`), {
      header: { phone: '+91 9876543210', gstin: '29ABCDE1234F1Z5' },
      footer: { bankName: 'HDFC', accountNumber: '50100123456789' },
      signature: { signatoryName: 'Alice', signatoryTitle: 'Director' },
      termsAndConditions: 'Payment due within 14 days.',
      disclaimer: 'Subject to Bengaluru jurisdiction.'
    }));
  });

  it('admin in tenant A CAN read the template doc', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_A}/private/invoice-template`), {
        header: { phone: '+91 9876543210' }
      });
    });
    const db = adminCtx(COMPANY_A).firestore();
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_A}/private/invoice-template`)));
  });

  it('admin in tenant A CANNOT read tenant B template doc', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_B}/private/invoice-template`), {
        header: { phone: 'foreign' }
      });
    });
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(getDoc(doc(db, `companies/${COMPANY_B}/private/invoice-template`)));
  });

  it('admin in tenant A CANNOT write tenant B template doc', async () => {
    const db = adminCtx(COMPANY_A).firestore();
    await assertFails(setDoc(doc(db, `companies/${COMPANY_B}/private/invoice-template`), {
      header: { phone: 'forbidden' }
    }));
  });

  it('non-admin in tenant A CANNOT read the template doc', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_A}/private/invoice-template`), {
        header: { phone: '+91 9876543210' }
      });
    });
    const db = userCtx(COMPANY_A).firestore();
    await assertFails(getDoc(doc(db, `companies/${COMPANY_A}/private/invoice-template`)));
  });

  it('non-admin in tenant A CANNOT write the template doc', async () => {
    const db = userCtx(COMPANY_A).firestore();
    await assertFails(setDoc(doc(db, `companies/${COMPANY_A}/private/invoice-template`), {
      header: { phone: 'forbidden' }
    }));
  });

  it('unauthenticated client CANNOT read the template doc', async () => {
    await env.withSecurityRulesDisabled(async (sctx) => {
      await setDoc(doc(sctx.firestore(), `companies/${COMPANY_A}/private/invoice-template`), {
        header: { phone: '+91 9876543210' }
      });
    });
    const db = anonCtx().firestore();
    await assertFails(getDoc(doc(db, `companies/${COMPANY_A}/private/invoice-template`)));
  });
});
