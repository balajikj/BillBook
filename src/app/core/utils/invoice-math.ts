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
