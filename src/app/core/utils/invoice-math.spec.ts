import { describe, it, expect } from 'vitest';
import { computeCgstSgst, computeGrandTotal, roundMoney } from './invoice-math';

describe('roundMoney', () => {
  it('rounds 1.005 to 1.01 (half-up)', () => {
    expect(roundMoney(1.005)).toBe(1.01);
  });
  it('rounds 1.015 to 1.02 (half-up)', () => {
    expect(roundMoney(1.015)).toBe(1.02);
  });
  it('rounds 0.155 to 0.16', () => {
    expect(roundMoney(0.155)).toBe(0.16);
  });
  it('rounds 0.154 down to 0.15', () => {
    expect(roundMoney(0.154)).toBe(0.15);
  });
  it('handles negative values', () => {
    expect(roundMoney(-1.234)).toBe(-1.23);
  });
  it('returns 0 for NaN', () => {
    expect(roundMoney(NaN)).toBe(0);
  });
  it('returns 0 for Infinity', () => {
    expect(roundMoney(Infinity)).toBe(0);
  });
});

describe('computeCgstSgst', () => {
  it('18% GST on 1000 → 90/90', () => {
    expect(computeCgstSgst(1000, 18)).toEqual({ cgst: 90, sgst: 90 });
  });
  it('0% GST → 0/0', () => {
    expect(computeCgstSgst(1000, 0)).toEqual({ cgst: 0, sgst: 0 });
  });
  it('null gstPercent → 0/0', () => {
    expect(computeCgstSgst(1000, null)).toEqual({ cgst: 0, sgst: 0 });
  });
  it('undefined gstPercent → 0/0', () => {
    expect(computeCgstSgst(1000, undefined)).toEqual({ cgst: 0, sgst: 0 });
  });
  it('fractional rounding 333.33 × 18% → 30/30', () => {
    expect(computeCgstSgst(333.33, 18)).toEqual({ cgst: 30, sgst: 30 });
  });
  it('5% GST on 1234.56 → 30.86/30.86', () => {
    // 1234.56 * 5 / 200 = 30.864 → 30.86
    expect(computeCgstSgst(1234.56, 5)).toEqual({ cgst: 30.86, sgst: 30.86 });
  });
});

describe('computeGrandTotal', () => {
  it('subtotal + cgst + sgst + other + roundOff', () => {
    expect(computeGrandTotal(1000, 90, 90, 50, 0)).toBe(1230);
  });
  it('negative roundOff', () => {
    expect(computeGrandTotal(1000, 90, 90, 50.4, -0.4)).toBe(1230);
  });
  it('all zeroes', () => {
    expect(computeGrandTotal(0, 0, 0, 0, 0)).toBe(0);
  });
  it('zero other charges and round off', () => {
    expect(computeGrandTotal(500, 0, 0, 0, 0)).toBe(500);
  });
});
