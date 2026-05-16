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

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  // Escape regex metacharacters so we can match literal substrings.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = haystack.match(new RegExp(escaped, 'g'));
  return matches ? matches.length : 0;
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

describe('PdfService.buildDocDefinition — two-up landscape layout', () => {
  describe('page geometry', () => {
    const def = svc.buildDocDefinition(indiaInvoice(), company);
    it('uses landscape orientation', () => {
      expect(def.pageOrientation).toBe('landscape');
    });
    it('uses A4 page size', () => {
      expect(def.pageSize).toBe('A4');
    });
    it('uses tight margins [24, 18, 24, 18]', () => {
      expect(def.pageMargins).toEqual([24, 18, 24, 18]);
    });
  });

  describe('typography', () => {
    const def = svc.buildDocDefinition(indiaInvoice(), company);
    it('defaultStyle.fontSize is 8', () => {
      expect((def.defaultStyle as any)?.fontSize).toBe(8);
    });
    it('companyHeader is 13pt bold', () => {
      expect((def.styles as any)?.companyHeader?.fontSize).toBe(13);
      expect((def.styles as any)?.companyHeader?.bold).toBe(true);
    });
    it('invoiceHeader is 11pt', () => {
      expect((def.styles as any)?.invoiceHeader?.fontSize).toBe(11);
    });
    it('footer is 7pt grey', () => {
      expect((def.styles as any)?.footer?.fontSize).toBe(7);
      expect((def.styles as any)?.footer?.color).toBe('#888');
    });
  });

  describe('content duplication — India invoice', () => {
    const def = svc.buildDocDefinition(indiaInvoice(), company);
    const json = stringify(def.content);

    it('invoice number appears exactly twice (one per copy)', () => {
      expect(countOccurrences(json, 'Invoice INV-2026-0002')).toBe(2);
    });
    it('customer GSTIN appears exactly twice', () => {
      expect(countOccurrences(json, 'GSTIN: 29ABCDE1234F1Z5')).toBe(2);
    });
    it('CGST row appears exactly twice', () => {
      expect(countOccurrences(json, 'CGST (9%)')).toBe(2);
    });
    it('SGST row appears exactly twice', () => {
      expect(countOccurrences(json, 'SGST (9%)')).toBe(2);
    });
    it('Grand Total row appears exactly twice', () => {
      expect(countOccurrences(json, 'Grand Total')).toBe(2);
    });
    it('amount-in-words footer appears exactly twice', () => {
      expect(countOccurrences(json, 'Rupees One Thousand Two Hundred Thirty Only.')).toBe(2);
    });
  });

  describe('content duplication — legacy invoice', () => {
    const def = svc.buildDocDefinition(legacyInvoice(), company);
    const json = stringify(def.content);

    it('invoice number appears exactly twice', () => {
      expect(countOccurrences(json, 'Invoice INV-2026-0001')).toBe(2);
    });
    it('Total label appears exactly twice', () => {
      // "Total" is a substring of "Line total", which appears in the header row of
      // each copy's line items table. Match the standalone totals row label.
      const totalsRowMatches = countOccurrences(json, '"Total"');
      // pdfmake serialises the bold totals cell as { text: 'Total', bold: true } —
      // its JSON form contains "text":"Total". Use that as a less-ambiguous marker.
      const totalsByTextProp = countOccurrences(json, '"text":"Total"');
      expect(Math.max(totalsRowMatches, totalsByTextProp)).toBeGreaterThanOrEqual(2);
    });
    it('Subtotal row appears exactly twice', () => {
      expect(countOccurrences(json, '"Subtotal"')).toBe(2);
    });
  });

  describe('separator', () => {
    const def = svc.buildDocDefinition(indiaInvoice(), company);
    const json = stringify(def.content);

    it('renders the cut-line label exactly once between the two copies', () => {
      expect(countOccurrences(json, 'Cut along the dashed line')).toBe(1);
    });
    it('uses a dashed line at 794pt width (page width minus margins)', () => {
      expect(json).toContain('"x2":794');
      expect(json).toContain('"dash"');
    });
  });
});
