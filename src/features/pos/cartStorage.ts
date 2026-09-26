import type { CartLine } from '@/lib/cart';
import type { SaleType } from './posApi';

/**
 * Keeping a half-built sale across a page refresh.
 *
 * <b>sessionStorage, not localStorage</b>: the cart dies with the browser, so the shop never
 * opens tomorrow holding yesterday's half-sale. On top of that a hard <b>same-trading-day
 * expiry</b>, because the prices in a cart are the ones captured when each line was added and
 * the server takes the unit price from the client (`InvoiceService`) — a restored stale cart
 * would sell at an old price and nothing would flag it. Anything restored is re-priced before
 * it can be sold.
 *
 * Every read and write is wrapped: storage throws in a private window and can come back empty
 * or corrupted, and none of that may stop the counter from selling.
 */

export const CART_STORAGE_KEY = 'moizpos.cart.v1';

export interface StoredCart {
  lines: CartLine[];
  saleType: SaleType;
}

interface StoredCartEnvelope extends StoredCart {
  savedAt: string;
}

/** Two instants are the same trading day when they fall on the same local calendar date. */
function isSameTradingDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isCartLine(value: unknown): value is CartLine {
  const line = value as Partial<CartLine> | null;

  return (
    typeof line === 'object' &&
    line !== null &&
    typeof line.productId === 'number' &&
    typeof line.productName === 'string' &&
    typeof line.quantity === 'number' &&
    typeof line.unitSalePrice === 'number' &&
    typeof line.lineDiscount === 'number'
  );
}

export function writeStoredCart(cart: StoredCart, now: Date = new Date()): void {
  try {
    // An empty cart is not a cart. Storing one would resurrect "nothing" after a refresh and
    // leave a stale key behind for the next read to reason about.
    if (cart.lines.length === 0) {
      clearStoredCart();
      return;
    }

    const envelope: StoredCartEnvelope = {
      savedAt: now.toISOString(),
      lines: cart.lines,
      saleType: cart.saleType,
    };

    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Storage unavailable or full. The in-memory cart is unaffected, so the sale can still
    // be completed — it simply will not survive a refresh.
  }
}

export function readStoredCart(now: Date = new Date()): StoredCart | null {
  try {
    const raw = sessionStorage.getItem(CART_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const envelope = JSON.parse(raw) as Partial<StoredCartEnvelope>;
    const savedAt = envelope.savedAt ? new Date(envelope.savedAt) : null;

    if (!savedAt || Number.isNaN(savedAt.getTime()) || !isSameTradingDay(savedAt, now)) {
      // Expired: dropped here rather than merely ignored, so the next read is not asked the
      // same question again.
      clearStoredCart();
      return null;
    }

    if (!Array.isArray(envelope.lines) || !envelope.lines.every(isCartLine)) {
      clearStoredCart();
      return null;
    }

    if (envelope.lines.length === 0) {
      return null;
    }

    return {
      lines: envelope.lines,
      saleType: envelope.saleType === 'Wholesale' ? 'Wholesale' : 'Retail',
    };
  } catch {
    // Corrupted or unreadable. Start the sale fresh rather than guessing at what was meant.
    return null;
  }
}

export function clearStoredCart(): void {
  try {
    sessionStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    // Nothing to do — an unreadable store is also an unwritable one.
  }
}
