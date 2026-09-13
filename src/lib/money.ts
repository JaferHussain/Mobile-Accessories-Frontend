/**
 * Money helpers for the counter.
 *
 * JavaScript has no decimal type, so every amount is held as a whole number of paisa internally
 * and only converted to rupees for display. This keeps 0.1 + 0.2 from becoming 0.30000000000000004
 * on the screen the shopkeeper reads. The server remains the authority on totals (FR-013) — these
 * helpers exist so the cart shows the same number the server will compute.
 */

const PAISA_PER_RUPEE = 100;

/** Rounds to whole paisa, half away from zero, matching the server's decimal rounding. */
export function toPaisa(rupees: number): number {
  const scaled = rupees * PAISA_PER_RUPEE;
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

export function toRupees(paisa: number): number {
  return paisa / PAISA_PER_RUPEE;
}

/** Rounds a rupee amount to 2 decimal places without floating-point drift. */
export function roundMoney(rupees: number): number {
  return toRupees(toPaisa(rupees));
}

/** Formats an amount for display, e.g. 1234.5 -> "Rs 1,234.50". */
export function formatPkr(rupees: number): string {
  const rounded = roundMoney(rupees);
  const formatted = Math.abs(rounded).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return rounded < 0 ? `-Rs ${formatted}` : `Rs ${formatted}`;
}

/** True when the value is a finite, non-negative number usable as an amount. */
export function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
