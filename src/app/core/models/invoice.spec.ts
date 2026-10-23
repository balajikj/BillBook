import { describe, it, expect } from 'vitest';
import { getTaxMode, summarizeTaxBySlab } from './invoice';

describe('getTaxMode', () => {
  it('defaults legacy invoices to bill', () => {
    expect(getTaxMode({})).toBe('bill');
    expect(getTaxMode({ taxMode: 'item' })).toBe('item');
  });
});

describe('summarizeTaxBySlab', () => {
  it('groups lines by slab, ascending, skipping untaxed lines', () => {
    const line = (lineTotal: number, gstPercent: number, c: number) => ({
      productId: null, description: 'x', quantity: 1, unitPrice: lineTotal,
      lineTotal, gstPercent, cgstAmount: c, sgstAmount: c
    });
    const rows = summarizeTaxBySlab([line(100, 18, 9), line(200, 5, 5), line(50, 18, 4.5), line(10, 0, 0)]);
    expect(rows).toEqual([
      { gstPercent: 5, taxable: 200, cgst: 5, sgst: 5 },
      { gstPercent: 18, taxable: 150, cgst: 13.5, sgst: 13.5 }
    ]);
  });
});
