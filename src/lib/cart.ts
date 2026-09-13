import { toPaisa, toRupees } from './money';

/**
 * Pure cart arithmetic (T092).
 *
 * Mirrors the server's InvoiceCalculator so the counter shows the same totals the server will
 * compute and store. The server is still the authority — this never decides what is charged,
 * only what is displayed while the sale is being built (FR-013, Constitution Principle III).
 *
 * All internal arithmetic is in whole paisa to avoid floating-point drift.
 */

export interface CartLine {
  readonly productId: number;
  readonly productName: string;
  readonly quantity: number;
  readonly unitSalePrice: number;
  readonly lineDiscount: number;
}

export interface CartLineTotals extends CartLine {
  readonly lineTotal: number;
}

export interface CartTotals {
  readonly lines: readonly CartLineTotals[];
  readonly subtotal: number;
  readonly totalDiscount: number;
  readonly total: number;
  readonly amountPaid: number;
  readonly amountRemaining: number;
}

export type CartErrorCode =
  | 'EMPTY_CART'
  | 'INVALID_QUANTITY'
  | 'INVALID_PRICE'
  | 'NEGATIVE_DISCOUNT'
  | 'LINE_DISCOUNT_EXCEEDS_LINE'
  | 'ORDER_DISCOUNT_EXCEEDS_SUBTOTAL'
  | 'PAYMENT_EXCEEDS_TOTAL'
  | 'NEGATIVE_PAYMENT';

export class CartError extends Error {
  constructor(
    readonly code: CartErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CartError';
  }
}

/** The total for one line, in paisa, before order-level discount. */
function lineTotalPaisa(line: CartLine): number {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
    throw new CartError('INVALID_QUANTITY', 'Quantity must be a whole number greater than zero.');
  }

  if (!Number.isFinite(line.unitSalePrice) || line.unitSalePrice < 0) {
    throw new CartError('INVALID_PRICE', 'Unit price cannot be negative.');
  }

  if (!Number.isFinite(line.lineDiscount) || line.lineDiscount < 0) {
    throw new CartError('NEGATIVE_DISCOUNT', 'Line discount cannot be negative.');
  }

  const gross = toPaisa(line.unitSalePrice) * line.quantity;
  const discount = toPaisa(line.lineDiscount);

  if (discount > gross) {
    throw new CartError(
      'LINE_DISCOUNT_EXCEEDS_LINE',
      `Discount on ${line.productName} exceeds the line value.`,
    );
  }

  return gross - discount;
}

export function calculateCart(
  lines: readonly CartLine[],
  orderDiscount = 0,
  amountPaid = 0,
): CartTotals {
  if (lines.length === 0) {
    throw new CartError('EMPTY_CART', 'Add at least one item before saving the sale.');
  }

  if (!Number.isFinite(orderDiscount) || orderDiscount < 0) {
    throw new CartError('NEGATIVE_DISCOUNT', 'Order discount cannot be negative.');
  }

  if (!Number.isFinite(amountPaid) || amountPaid < 0) {
    throw new CartError('NEGATIVE_PAYMENT', 'Amount paid cannot be negative.');
  }

  const pricedLines: CartLineTotals[] = [];
  let subtotalPaisa = 0;
  let lineDiscountPaisa = 0;

  for (const line of lines) {
    const total = lineTotalPaisa(line);
    subtotalPaisa += total;
    lineDiscountPaisa += toPaisa(line.lineDiscount);
    pricedLines.push({ ...line, lineTotal: toRupees(total) });
  }

  const orderDiscountPaisa = toPaisa(orderDiscount);

  if (orderDiscountPaisa > subtotalPaisa) {
    throw new CartError(
      'ORDER_DISCOUNT_EXCEEDS_SUBTOTAL',
      'Order discount cannot exceed the cart subtotal.',
    );
  }

  const totalPaisa = subtotalPaisa - orderDiscountPaisa;
  const paidPaisa = toPaisa(amountPaid);

  if (paidPaisa > totalPaisa) {
    throw new CartError('PAYMENT_EXCEEDS_TOTAL', 'Amount paid cannot exceed the invoice total.');
  }

  return {
    lines: pricedLines,
    subtotal: toRupees(subtotalPaisa),
    totalDiscount: toRupees(lineDiscountPaisa + orderDiscountPaisa),
    total: toRupees(totalPaisa),
    amountPaid: toRupees(paidPaisa),
    amountRemaining: toRupees(totalPaisa - paidPaisa),
  };
}

/** True when the sale leaves money owed, which makes a customer mandatory (FR-017). */
export function requiresCustomer(totals: CartTotals): boolean {
  return totals.amountRemaining > 0;
}
