import { beforeEach, describe, expect, it } from 'vitest';
import {
  CART_STORAGE_KEY,
  readStoredCart,
  writeStoredCart,
  clearStoredCart,
} from '@/features/pos/cartStorage';
import type { CartLine } from '@/lib/cart';

/**
 * The cart outlives a page refresh, but never outlives the trading day.
 *
 * A cart is worth keeping across an accidental refresh at a busy counter. It is NOT worth
 * keeping overnight: the prices in it are the ones captured when the lines were added, and the
 * server takes the unit price from the client, so a stale cart sells yesterday's price without
 * anyone noticing. Hence sessionStorage plus a hard same-day expiry.
 */

const lines: CartLine[] = [
  { productId: 1, productName: 'Type-C Braided 2m', quantity: 2, unitSalePrice: 1100, lineDiscount: 0 },
];

const morning = new Date('2026-09-23T09:00:00+05:00');
const afternoon = new Date('2026-09-23T17:30:00+05:00');
const nextMorning = new Date('2026-09-24T09:00:00+05:00');

describe('cart storage', () => {
  beforeEach(() => {
    clearStoredCart();
  });

  it('gives back nothing when no cart was ever stored', () => {
    expect(readStoredCart(morning)).toBeNull();
  });

  it('restores a cart stored earlier the same day', () => {
    writeStoredCart({ lines, saleType: 'Retail' }, morning);

    const restored = readStoredCart(afternoon);

    expect(restored?.lines).toEqual(lines);
    expect(restored?.saleType).toBe('Retail');
  });

  it('keeps the sale type, so a wholesale cart does not come back priced as retail', () => {
    writeStoredCart({ lines, saleType: 'Wholesale' }, morning);

    expect(readStoredCart(afternoon)?.saleType).toBe('Wholesale');
  });

  it('discards a cart from a previous trading day', () => {
    writeStoredCart({ lines, saleType: 'Retail' }, morning);

    // Yesterday's prices, yesterday's customer, yesterday's intent. Not worth restoring.
    expect(readStoredCart(nextMorning)).toBeNull();
  });

  it('removes the expired cart rather than leaving it to be read again', () => {
    writeStoredCart({ lines, saleType: 'Retail' }, morning);
    readStoredCart(nextMorning);

    expect(sessionStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('stores nothing for an empty cart', () => {
    writeStoredCart({ lines: [], saleType: 'Retail' }, morning);

    expect(readStoredCart(morning)).toBeNull();
  });

  it('survives corrupted storage instead of breaking the counter', () => {
    sessionStorage.setItem(CART_STORAGE_KEY, 'not json at all');

    expect(readStoredCart(morning)).toBeNull();
  });

  it('rejects a stored cart whose lines are not lines', () => {
    sessionStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ savedAt: morning.toISOString(), lines: [{ nonsense: true }], saleType: 'Retail' }),
    );

    expect(readStoredCart(morning)).toBeNull();
  });

  it('clears on request, for the New sale button', () => {
    writeStoredCart({ lines, saleType: 'Retail' }, morning);
    clearStoredCart();

    expect(readStoredCart(morning)).toBeNull();
  });
});
