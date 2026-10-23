// Pure helpers for invoice money math. No Angular / Firestore dependencies.

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Half-up rounding at two decimals. Uses the exponent-string trick so that
  // values like 1.005 — which floating-point can't represent exactly — round
  // the way a human expects (1.01, not 1.00). `String(1.005)` returns "1.005"
  // because JS's toString prints the shortest decimal that round-trips.
  return Number(Math.round(Number(`${value}e2`)) + 'e-2');
}

export function computeCgstSgst(subtotal: number, gstPercent: number | null | undefined): { cgst: number; sgst: number } {
  const pct = Number(gstPercent ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return { cgst: 0, sgst: 0 };
  const half = roundMoney(subtotal * pct / 200);
  return { cgst: half, sgst: half };
}

export function computeGrandTotal(
  subtotal: number,
  cgst: number,
  sgst: number,
  otherCharges: number,
  roundOff: number
): number {
  return roundMoney(subtotal + cgst + sgst + otherCharges + roundOff);
}

export interface LineTaxInput {
  lineTotal: number;
  gstPercent?: number | null;
}

export interface ItemWiseTaxResult {
  /** Per-line CGST/SGST, same order as the input. */
  lines: Array<{ cgst: number; sgst: number }>;
  cgst: number;
  sgst: number;
  /** Highest slab used on any line (0 when none are taxed). */
  maxPercent: number;
}

/**
 * Item-wise tax: each line is taxed on its own slab, rounded per line, and the
 * bill-level CGST/SGST are the sums of the rounded line amounts — so the
 * printed lines always add up to the printed totals.
 */
export function computeItemWiseTax(lines: LineTaxInput[]): ItemWiseTaxResult {
  let cgst = 0;
  let sgst = 0;
  let maxPercent = 0;
  const out = lines.map((l) => {
    const t = computeCgstSgst(l.lineTotal, l.gstPercent);
    cgst += t.cgst;
    sgst += t.sgst;
    maxPercent = Math.max(maxPercent, Number(l.gstPercent ?? 0) || 0);
    return t;
  });
  return { lines: out, cgst: roundMoney(cgst), sgst: roundMoney(sgst), maxPercent };
}
