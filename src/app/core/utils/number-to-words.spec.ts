import { describe, it, expect } from 'vitest';
import { numberToWords } from './number-to-words';

describe('numberToWords — INR', () => {
  it('renders 0 as Rupees Zero Only', () => {
    expect(numberToWords(0, 'INR')).toBe('Rupees Zero Only.');
  });
  it('renders 1 as Rupees One Only', () => {
    expect(numberToWords(1, 'INR')).toBe('Rupees One Only.');
  });
  it('renders 99', () => {
    expect(numberToWords(99, 'INR')).toBe('Rupees Ninety Nine Only.');
  });
  it('renders 100', () => {
    expect(numberToWords(100, 'INR')).toBe('Rupees One Hundred Only.');
  });
  it('renders 1000', () => {
    expect(numberToWords(1000, 'INR')).toBe('Rupees One Thousand Only.');
  });
  it('renders 100000 as One Lakh', () => {
    expect(numberToWords(100000, 'INR')).toBe('Rupees One Lakh Only.');
  });
  it('renders 125000 as One Lakh Twenty Five Thousand', () => {
    expect(numberToWords(125000, 'INR')).toBe('Rupees One Lakh Twenty Five Thousand Only.');
  });
  it('renders 10000000 as One Crore', () => {
    expect(numberToWords(10000000, 'INR')).toBe('Rupees One Crore Only.');
  });
  it('renders 1234.56 with paise', () => {
    expect(numberToWords(1234.56, 'INR')).toBe('Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only.');
  });
  it('renders 1230.50 with paise', () => {
    expect(numberToWords(1230.50, 'INR')).toBe('Rupees One Thousand Two Hundred Thirty and Fifty Paise Only.');
  });
});

describe('numberToWords — USD', () => {
  it('renders 0', () => {
    expect(numberToWords(0, 'USD')).toBe('Zero Dollars Only.');
  });
  it('renders 1234.56 with cents', () => {
    expect(numberToWords(1234.56, 'USD')).toBe('One Thousand Two Hundred Thirty Four Dollars and Fifty Six Cents Only.');
  });
  it('renders 1000000 as One Million', () => {
    expect(numberToWords(1000000, 'USD')).toBe('One Million Dollars Only.');
  });
});

describe('numberToWords — edge cases', () => {
  it('renders negative as Minus prefix', () => {
    expect(numberToWords(-1234, 'INR')).toBe('Minus Rupees One Thousand Two Hundred Thirty Four Only.');
  });
  it('returns empty string for NaN', () => {
    expect(numberToWords(NaN, 'INR')).toBe('');
  });
  it('returns empty string for Infinity', () => {
    expect(numberToWords(Infinity, 'INR')).toBe('');
  });
  it('falls back to generic units for unknown currency', () => {
    expect(numberToWords(100, 'XYZ')).toBe('One Hundred XYZ Only.');
  });
});
