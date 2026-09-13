import { describe, expect, it } from 'vitest';
import { CartError, calculateCart, requiresCustomer, type CartLine } from '@/lib/cart';
import { formatPkr, roundMoney } from '@/lib/money';

/**
 * T091 — mirrors the server's InvoiceCalculatorTests so the counter can never display a total
 * the server would reject (Constitution Principle III).
 */

const line = (
  quantity: number,
  unitSalePrice: number,
  lineDiscount = 0,
  productName = 'Type-C Braided 2m',
): CartLine => ({ productId: 1, productName, quantity, unitSalePrice, lineDiscount });

describe('calculateCart', () => {
  // spec US1 scenario 1
  it('totals a simple cash sale', () => {
    const totals = calculateCart([line(2, 1100)], 0, 2200);

    expect(totals.subtotal).toBe(2200);
    expect(totals.total).toBe(2200);
    expect(totals.amountRemaining).toBe(0);
  });

  // spec US1 scenario 2: 5,000 cart, 100 line discount, 400 order discount -> 4,500
  it('applies line and order discounts together', () => {
    const totals = calculateCart([line(1, 3000, 100), line(1, 2000)], 400, 4500);

    expect(totals.subtotal).toBe(4900);
    expect(totals.totalDiscount).toBe(500);
    expect(totals.total).toBe(4500);
  });

  it('sums multiple lines', () => {
    const totals = calculateCart([line(3, 250), line(2, 1100), line(1, 99.5)]);

    expect(totals.subtotal).toBe(3049.5);
  });

  it('computes the remaining amount on a partial payment', () => {
    const totals = calculateCart([line(1, 3000)], 0, 1000);

    expect(totals.amountRemaining).toBe(2000);
  });

  it('treats a fully unpaid sale as entirely outstanding', () => {
    const totals = calculateCart([line(1, 3000)], 0, 0);

    expect(totals.amountRemaining).toBe(3000);
  });

  it('allows a line discount equal to the line value', () => {
    const totals = calculateCart([line(2, 100, 200)]);

    expect(totals.total).toBe(0);
  });

  it('never produces a negative total', () => {
    const totals = calculateCart([line(1, 1000)], 1000);

    expect(totals.total).toBe(0);
  });
});

describe('calculateCart validation', () => {
  it('rejects an empty cart', () => {
    expect(() => calculateCart([])).toThrow(CartError);
    expect(() => calculateCart([])).toThrow(/at least one item/i);
  });

  it('rejects a line discount larger than the line', () => {
    try {
      calculateCart([line(2, 100, 250)]);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CartError);
      expect((error as CartError).code).toBe('LINE_DISCOUNT_EXCEEDS_LINE');
    }
  });

  it('rejects an order discount larger than the subtotal', () => {
    try {
      calculateCart([line(1, 1000)], 1500);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as CartError).code).toBe('ORDER_DISCOUNT_EXCEEDS_SUBTOTAL');
    }
  });

  it('rejects paying more than the total', () => {
    try {
      calculateCart([line(1, 1000)], 0, 1500);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as CartError).code).toBe('PAYMENT_EXCEEDS_TOTAL');
    }
  });

  it.each([0, -1, 1.5])('rejects an invalid quantity: %s', (quantity) => {
    expect(() => calculateCart([line(quantity, 100)])).toThrow(CartError);
  });

  it('rejects a negative unit price', () => {
    expect(() => calculateCart([line(1, -5)])).toThrow(CartError);
  });

  it('rejects a negative discount', () => {
    expect(() => calculateCart([line(1, 100, -10)])).toThrow(CartError);
  });
});

describe('money precision', () => {
  it('does not drift on amounts that break binary floating point', () => {
    const totals = calculateCart([line(1, 0.1), line(1, 0.2)]);

    expect(totals.subtotal).toBe(0.3);
  });

  it('line totals sum exactly to the subtotal', () => {
    const totals = calculateCart([line(3, 33.33), line(7, 12.12), line(2, 999.99)]);
    const summed = totals.lines.reduce((acc, l) => acc + l.lineTotal, 0);

    expect(roundMoney(summed)).toBe(totals.subtotal);
  });

  it('rounds half a paisa away from zero', () => {
    expect(roundMoney(100.005)).toBe(100.01);
  });
});

describe('requiresCustomer', () => {
  it('is true when money remains owed', () => {
    expect(requiresCustomer(calculateCart([line(1, 3000)], 0, 1000))).toBe(true);
  });

  it('is false for a fully paid sale', () => {
    expect(requiresCustomer(calculateCart([line(1, 3000)], 0, 3000))).toBe(false);
  });
});

describe('formatPkr', () => {
  it('formats with two decimals and a thousands separator', () => {
    expect(formatPkr(1234.5)).toBe('Rs 1,234.50');
  });

  it('formats zero', () => {
    expect(formatPkr(0)).toBe('Rs 0.00');
  });

  it('formats a negative amount', () => {
    expect(formatPkr(-300)).toBe('-Rs 300.00');
  });
});
