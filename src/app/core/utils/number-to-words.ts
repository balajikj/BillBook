// Convert a numeric amount to a human-readable English words representation.
// Two modes:
//   - 'INR' currency uses the Indian numbering system (Lakh/Crore) and Rupees/Paise units.
//   - Other currencies use the international short scale (Thousand/Million/Billion) with currency-specific
//     major/minor unit names (currently USD/EUR/GBP; falls back to generic "units"/"cents").
// Always terminates with "Only." per Indian invoice convention.

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–99 → words; returns empty string for 0. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}

/** 0–999 → words; returns empty string for 0. */
function threeDigits(n: number): string {
  if (n === 0) return '';
  if (n < 100) return twoDigits(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  return r === 0 ? `${ONES[h]} Hundred` : `${ONES[h]} Hundred ${twoDigits(r)}`;
}

/** Indian system: groups are last-3, then 2-digit groups for Thousand/Lakh/Crore. */
function indianGroups(n: number): string {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore > 0) parts.push(`${indianGroups(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest > 0) parts.push(threeDigits(rest));
  return parts.join(' ').trim();
}

/** International short scale: Thousand / Million / Billion. */
function shortScaleGroups(n: number): string {
  if (n === 0) return 'Zero';
  const billion = Math.floor(n / 1_000_000_000);
  const million = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((n % 1_000_000) / 1_000);
  const rest = n % 1_000;
  const parts: string[] = [];
  if (billion > 0) parts.push(`${shortScaleGroups(billion)} Billion`);
  if (million > 0) parts.push(`${threeDigits(million)} Million`);
  if (thousand > 0) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest > 0) parts.push(threeDigits(rest));
  return parts.join(' ').trim();
}

interface CurrencyUnits {
  major: string;
  minor: string;
  precedeMajor: boolean; // INR style: "Rupees X Y Only." vs USD style: "X Y Dollars and ... Cents Only."
  indianGrouping: boolean;
}

function unitsFor(currency: string): CurrencyUnits {
  switch (currency?.toUpperCase()) {
    case 'INR':
      return { major: 'Rupees', minor: 'Paise', precedeMajor: true, indianGrouping: true };
    case 'USD':
      return { major: 'Dollars', minor: 'Cents', precedeMajor: false, indianGrouping: false };
    case 'EUR':
      return { major: 'Euros', minor: 'Cents', precedeMajor: false, indianGrouping: false };
    case 'GBP':
      return { major: 'Pounds', minor: 'Pence', precedeMajor: false, indianGrouping: false };
    default:
      return { major: currency || 'Units', minor: 'Subunits', precedeMajor: false, indianGrouping: false };
  }
}

export function numberToWords(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return '';

  const negative = amount < 0;
  const abs = Math.abs(amount);
  const major = Math.floor(abs);
  // Round minor to avoid 1.005 → 0 paise issues.
  const minor = Math.round((abs - major) * 100);

  const units = unitsFor(currency);
  const groupFn = units.indianGrouping ? indianGroups : shortScaleGroups;

  const majorWords = groupFn(major);
  const minorWords = minor > 0 ? `${twoDigits(minor)} ${units.minor}` : '';

  let out: string;
  if (units.precedeMajor) {
    // INR style: "Rupees Twelve Thousand and Fifty Paise Only."
    const parts = [`${units.major} ${majorWords}`];
    if (minorWords) parts.push(`and ${minorWords}`);
    out = parts.join(' ');
  } else {
    // International: "Twelve Thousand Dollars and Fifty Cents Only."
    const parts = [`${majorWords} ${units.major}`];
    if (minorWords) parts.push(`and ${minorWords}`);
    out = parts.join(' ');
  }
  if (negative) out = `Minus ${out}`;
  return `${out.replace(/\s+/g, ' ').trim()} Only.`;
}
