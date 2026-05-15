import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9A-Z]$/;
export const HSN_PATTERN = /^\d{4,8}$/;
export const PHONE_PATTERN = /^(\+?\d{1,3}[\s-]?)?\d{10}$/;
export const GST_PERCENT_RANGE: readonly [number, number] = [0, 50];

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

export function gstinValidator(): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    if (isBlank(c.value)) return null;
    return GSTIN_PATTERN.test(String(c.value)) ? null : { gstin: true };
  };
}

export function hsnValidator(): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    if (isBlank(c.value)) return null;
    return HSN_PATTERN.test(String(c.value)) ? null : { hsn: true };
  };
}

export function phoneValidator(): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    if (isBlank(c.value)) return null;
    return PHONE_PATTERN.test(String(c.value)) ? null : { phone: true };
  };
}

export function gstPercentValidator(): ValidatorFn {
  const [min, max] = GST_PERCENT_RANGE;
  return (c: AbstractControl): ValidationErrors | null => {
    if (isBlank(c.value)) return null;
    const n = Number(c.value);
    if (Number.isNaN(n)) return { gstPercent: true };
    if (n < min || n > max) return { gstPercent: true };
    return null;
  };
}
