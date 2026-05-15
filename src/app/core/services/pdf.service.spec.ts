import { describe, it, expect } from 'vitest';
import { PdfService } from './pdf.service';
import { Invoice } from '../models/invoice';

// Vitest with Node runtime can instantiate the service directly. The dynamic
// pdfmake import only fires from generateInvoicePdf(), which we don't call.
// Importing `Timestamp` from `@angular/fire/firestore` pulls in the Firebase
// SDK during test resolution, which fails — so we shim a tiny `Timestamp`-like
// object that satisfies the `.toDate()` calls the PDF code makes.
const svc = new PdfService();

const fakeTs = (d: Date) => ({ toDate: () => d } as any);

function legacyInvoice(): Invoice {
  return {
    id: 'inv1',
    number: 'INV-2026-0001',
    customer: { id: 'c1', name: 'Walk-in', email: null, address: null },
    lineItems: [
      { productId: null, description: 'Item A', quantity: 1, unitPrice: 100, lineTotal: 100 }
    ],
    subtotal: 100,
    total: 100,
    currency: 'USD',
    status: 'pending',
    issueDate: fakeTs(new Date('2026-05-01')),
    dueDate: fakeTs(new Date('2026-05-15')),
    paidAt: null,
    createdBy: 'u1',
    createdAt: fakeTs(new Date('2026-05-01'))
  };
}

function indiaInvoice(): Invoice {
  return {
    id: 'inv2',
    number: 'INV-2026-0002',
    customer: {
      id: 'c2', name: 'Globex Traders', email: null, address: null,
      shopName: 'Globex Mart',
      fullAddress: '12 MG Road, Bengaluru 560001',
      gstNumber: '29ABCDE1234F1Z5',
      phoneNumber: '+91 9876543210'
    },
    lineItems: [
      { productId: 'p1', description: 'Cotton T-shirt', hsnSac: '6109', quantity: 2, unitPrice: 500, lineTotal: 1000 }
    ],
    subtotal: 1000,
    total: 1230,
    currency: 'INR',
    status: 'pending',
    issueDate: fakeTs(new Date('2026-05-01')),
    dueDate: fakeTs(new Date('2026-05-15')),
    paidAt: null,
    createdBy: 'u1',
    createdAt: fakeTs(new Date('2026-05-01')),
    gstPercent: 18,
    cgstAmount: 90,
    sgstAmount: 90,
    otherCharges: 50,
    roundOff: 0,
    grandTotal: 1230
  };
}

const company = { name: 'BillEasy', defaultCurrency: 'INR' };

function stringify(content: unknown): string {
  return JSON.stringify(content);
}

describe('PdfService.buildDocDefinition — legacy invoice', () => {
  const def = svc.buildDocDefinition(legacyInvoice(), company);
  const json = stringify(def.content);

  it('does not include CGST or SGST lines', () => {
    expect(json).not.toContain('CGST');
    expect(json).not.toContain('SGST');
  });
  it('does not include Grand Total label', () => {
    expect(json).not.toContain('Grand Total');
  });
  it('does not include amount in words', () => {
    expect(json).not.toContain('Amount in words');
  });
  it('includes Total label (legacy layout)', () => {
    expect(json).toContain('Total');
  });
});

describe('PdfService.buildDocDefinition — India 18% GST invoice', () => {
  const def = svc.buildDocDefinition(indiaInvoice(), company);
  const json = stringify(def.content);

  it('includes the recipient GSTIN', () => {
    expect(json).toContain('GSTIN: 29ABCDE1234F1Z5');
  });
  it('includes shop name in the bill-to block', () => {
    expect(json).toContain('Globex Mart');
  });
  it('includes the recipient phone with label', () => {
    expect(json).toContain('Phone: +91 9876543210');
  });
  it('includes CGST 9% and SGST 9% rows', () => {
    expect(json).toContain('CGST (9%)');
    expect(json).toContain('SGST (9%)');
  });
  it('includes Other Charges row', () => {
    expect(json).toContain('Other Charges');
  });
  it('includes the Grand Total row', () => {
    expect(json).toContain('Grand Total');
  });
  it('renders the amount in words', () => {
    expect(json).toContain('Amount in words');
    expect(json).toContain('Rupees One Thousand Two Hundred Thirty Only.');
  });
  it('includes the HSN/SAC column header (line item has hsnSac)', () => {
    expect(json).toContain('HSN/SAC');
    expect(json).toContain('6109');
  });
});

describe('PdfService.buildDocDefinition — India invoice without HSN', () => {
  const inv = { ...indiaInvoice() };
  inv.lineItems = inv.lineItems.map((li) => ({ ...li, hsnSac: null }));
  const def = svc.buildDocDefinition(inv, company);
  const json = stringify(def.content);

  it('omits the HSN/SAC column when no line carries one', () => {
    expect(json).not.toContain('"HSN/SAC"');
  });
});
