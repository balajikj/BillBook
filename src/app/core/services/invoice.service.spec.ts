// Pure-logic tests for the math the InvoiceService composes at create() time.
// We don't spin up Firestore here — those paths are covered by the rules tests
// and emulator smoke tests. These specs lock the field-shape choices: when GST
// is non-zero, the doc carries the India totals; legacy invoices stay clean.

import { describe, it, expect } from 'vitest';
import { computeCgstSgst, computeGrandTotal, roundMoney } from '../utils/invoice-math';

/** Mirrors the relevant slice of InvoiceService.create() — pure computation only. */
function buildInvoiceTotals(args: {
  lineItems: { quantity: number; unitPrice: number; lineTotal: number }[];
  gstPercent?: number;
  otherCharges?: number;
  roundOff?: number;
}) {
  const subtotal = roundMoney(args.lineItems.reduce((s, li) => s + li.lineTotal, 0));
  const gstPercent = Number(args.gstPercent ?? 0);
  const otherCharges = roundMoney(Number(args.otherCharges ?? 0));
  const roundOff = roundMoney(Number(args.roundOff ?? 0));
  const { cgst, sgst } = computeCgstSgst(subtotal, gstPercent);
  const grandTotal = computeGrandTotal(subtotal, cgst, sgst, otherCharges, roundOff);
  const hasIndiaFields = gstPercent > 0 || otherCharges !== 0 || roundOff !== 0;
  const total = hasIndiaFields ? grandTotal : subtotal;

  const persisted: Record<string, unknown> = { subtotal, total };
  if (hasIndiaFields) {
    persisted['gstPercent'] = gstPercent;
    persisted['cgstAmount'] = cgst;
    persisted['sgstAmount'] = sgst;
    persisted['otherCharges'] = otherCharges;
    persisted['roundOff'] = roundOff;
    persisted['grandTotal'] = grandTotal;
  }
  return persisted;
}

describe('InvoiceService doc shape (computed totals)', () => {
  it('legacy invoice (no GST, no charges) persists only subtotal + total', () => {
    const out = buildInvoiceTotals({
      lineItems: [{ quantity: 2, unitPrice: 100, lineTotal: 200 }]
    });
    expect(out).toEqual({ subtotal: 200, total: 200 });
    // No india fields present.
    expect('gstPercent' in out).toBe(false);
    expect('cgstAmount' in out).toBe(false);
    expect('grandTotal' in out).toBe(false);
  });

  it('18% GST on 1000 subtotal persists the full breakdown', () => {
    const out = buildInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 1000, lineTotal: 1000 }],
      gstPercent: 18,
      otherCharges: 50,
      roundOff: 0
    });
    expect(out).toEqual({
      subtotal: 1000,
      total: 1230, // total mirrors grandTotal when India fields are present
      gstPercent: 18,
      cgstAmount: 90,
      sgstAmount: 90,
      otherCharges: 50,
      roundOff: 0,
      grandTotal: 1230
    });
  });

  it('0% GST with non-zero otherCharges still persists India fields', () => {
    const out = buildInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 500, lineTotal: 500 }],
      otherCharges: 25
    });
    expect(out).toEqual({
      subtotal: 500,
      total: 525,
      gstPercent: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      otherCharges: 25,
      roundOff: 0,
      grandTotal: 525
    });
  });

  it('negative roundOff is preserved', () => {
    const out = buildInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 1000, lineTotal: 1000 }],
      gstPercent: 18,
      otherCharges: 50.4,
      roundOff: -0.4
    });
    expect(out['grandTotal']).toBe(1230);
    expect(out['roundOff']).toBe(-0.4);
  });
});
