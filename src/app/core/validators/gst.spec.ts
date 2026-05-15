import { describe, it, expect } from 'vitest';
import { gstinValidator, hsnValidator, phoneValidator, gstPercentValidator } from './gst';

// The validators only read `.value` off the control, so a plain object suffices
// and avoids dragging the Angular runtime into vitest.
const ctrl = (value: unknown) => ({ value } as any);

describe('gstinValidator', () => {
  const v = gstinValidator();
  it('accepts a valid 15-character GSTIN', () => {
    expect(v(ctrl('29ABCDE1234F1Z5'))).toBeNull();
  });
  it('rejects a 14-character GSTIN', () => {
    expect(v(ctrl('29ABCDE1234F1Z'))).toEqual({ gstin: true });
  });
  it('rejects a 16-character GSTIN', () => {
    expect(v(ctrl('29ABCDE1234F1Z5X'))).toEqual({ gstin: true });
  });
  it('rejects lowercase letters', () => {
    expect(v(ctrl('29abcde1234f1z5'))).toEqual({ gstin: true });
  });
  it('accepts empty string (optional field)', () => {
    expect(v(ctrl(''))).toBeNull();
  });
  it('accepts null', () => {
    expect(v(ctrl(null))).toBeNull();
  });
});

describe('hsnValidator', () => {
  const v = hsnValidator();
  it('accepts 4-digit HSN', () => {
    expect(v(ctrl('6109'))).toBeNull();
  });
  it('accepts 8-digit HSN', () => {
    expect(v(ctrl('61091000'))).toBeNull();
  });
  it('rejects 3-digit code', () => {
    expect(v(ctrl('610'))).toEqual({ hsn: true });
  });
  it('rejects 9-digit code', () => {
    expect(v(ctrl('610910001'))).toEqual({ hsn: true });
  });
  it('rejects alphanumeric mix', () => {
    expect(v(ctrl('61A9'))).toEqual({ hsn: true });
  });
  it('accepts empty string (optional field)', () => {
    expect(v(ctrl(''))).toBeNull();
  });
});

describe('phoneValidator', () => {
  const v = phoneValidator();
  it('accepts bare 10-digit number', () => {
    expect(v(ctrl('9876543210'))).toBeNull();
  });
  it('accepts +91 prefix with space', () => {
    expect(v(ctrl('+91 9876543210'))).toBeNull();
  });
  it('accepts +91 prefix with hyphen', () => {
    expect(v(ctrl('+91-9876543210'))).toBeNull();
  });
  it('accepts 91 prefix without +', () => {
    expect(v(ctrl('91 9876543210'))).toBeNull();
  });
  it('rejects 5-digit number', () => {
    expect(v(ctrl('98765'))).toEqual({ phone: true });
  });
  it('rejects letters', () => {
    expect(v(ctrl('phone here'))).toEqual({ phone: true });
  });
  it('accepts empty string (optional field)', () => {
    expect(v(ctrl(''))).toBeNull();
  });
});

describe('gstPercentValidator', () => {
  const v = gstPercentValidator();
  it('accepts 0', () => {
    expect(v(ctrl(0))).toBeNull();
  });
  it('accepts 18', () => {
    expect(v(ctrl(18))).toBeNull();
  });
  it('accepts 50 (upper bound)', () => {
    expect(v(ctrl(50))).toBeNull();
  });
  it('rejects 51', () => {
    expect(v(ctrl(51))).toEqual({ gstPercent: true });
  });
  it('rejects negative', () => {
    expect(v(ctrl(-1))).toEqual({ gstPercent: true });
  });
  it('rejects NaN-producing string', () => {
    expect(v(ctrl('abc'))).toEqual({ gstPercent: true });
  });
  it('accepts empty (treated as 0)', () => {
    expect(v(ctrl(''))).toBeNull();
  });
});
