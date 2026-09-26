import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PosScreen } from '@/features/pos/PosScreen';
import { CartProvider } from '@/features/pos/CartProvider';
import { CART_STORAGE_KEY, clearStoredCart } from '@/features/pos/cartStorage';
import type { Product } from '@/features/products/productApi';

/**
 * The cart belongs to the sale, not to the screen.
 *
 * It used to be local state inside PosScreen, so walking to the Products list to fetch another
 * item destroyed it — the "go back and add more" flow could not work, because there was nothing
 * to come back to. Here it lives above the router and is persisted, so navigation and even an
 * accidental refresh leave the sale intact.
 */

const cable: Product = {
  id: 1,
  name: 'Type-C Braided 2m',
  categoryId: 1,
  category: 'Cables',
  salePrice: 1100,
  quantityOnHand: 10,
  isLowStock: false,
  isActive: true,
};

function renderCounter(overrides: Partial<Parameters<typeof PosScreen>[0]> = {}) {
  const onFindProduct = vi.fn(async () => ({ kind: 'matches' as const, products: [cable] }));
  const onRepriceProduct = vi.fn(async () => cable.salePrice);
  const onSave = vi.fn().mockResolvedValue({
    invoiceId: 10,
    invoiceNumber: 'INV-2026-000010',
    subtotal: 1100,
    totalDiscount: 0,
    total: 1100,
    amountPaid: 1100,
    amountRemaining: 0,
    customerId: null,
    customerBalance: null,
  });

  const view = render(
    <CartProvider>
      <PosScreen
        onFindProduct={onFindProduct}
        onRepriceProduct={onRepriceProduct}
        onSave={onSave}
        onCreateCustomer={vi.fn()}
        onSearchCustomers={vi.fn(async () => [])}
        canSellOnCredit
        {...overrides}
      />
    </CartProvider>,
  );

  return { view, onRepriceProduct, onSave };
}

async function addCable(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/scan or search/i), 'cable');
  await user.click(screen.getByRole('button', { name: 'Search' }));

  const result = await screen.findByTestId(`pos-result-${cable.id}`);
  await user.click(within(result).getByRole('button', { name: 'Add' }));
}

/** A cart stored earlier today, as a refresh would leave behind. */
function seedStoredCart(savedAt: Date = new Date()) {
  sessionStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify({
      savedAt: savedAt.toISOString(),
      saleType: 'Retail',
      lines: [
        {
          productId: cable.id,
          productName: cable.name,
          quantity: 2,
          // Deliberately stale: the price has moved since this cart was built.
          unitSalePrice: 900,
          lineDiscount: 0,
        },
      ],
    }),
  );
}

describe('the cart survives', () => {
  beforeEach(() => {
    clearStoredCart();
  });

  it('a page refresh, restoring what was in it', async () => {
    seedStoredCart();
    renderCounter();

    expect(await screen.findByTestId(`cart-line-${cable.id}`)).toBeInTheDocument();
    expect(screen.getByLabelText(`Quantity for ${cable.name}`)).toHaveValue(2);
  });

  it('a walk to the Products list and back', async () => {
    const user = userEvent.setup();
    const { view } = renderCounter();

    await addCable(user);
    expect(screen.getByTestId(`cart-line-${cable.id}`)).toBeInTheDocument();

    // Leaving the counter unmounts the screen — exactly what navigating away does.
    view.unmount();
    renderCounter();

    expect(await screen.findByTestId(`cart-line-${cable.id}`)).toBeInTheDocument();
  });
});

describe('a restored cart is re-priced before it can be sold', () => {
  beforeEach(() => {
    clearStoredCart();
  });

  it('re-reads every restored line from the server', async () => {
    seedStoredCart();
    const { onRepriceProduct } = renderCounter();

    // The server takes the unit price from the client, so a stale cart would sell at the old
    // price and nothing would flag it. Restoring is not trusting.
    await waitFor(() => expect(onRepriceProduct).toHaveBeenCalledWith(cable.id, 'Retail'));
  });

  it('shows the current price, not the one the cart was built with', async () => {
    seedStoredCart();
    renderCounter();

    await waitFor(() =>
      expect(screen.getByLabelText(`Price for ${cable.name}`)).toHaveValue(cable.salePrice),
    );
  });

  it('does not re-price a cart the salesman built just now', async () => {
    const user = userEvent.setup();
    const { onRepriceProduct } = renderCounter();

    await addCable(user);

    // Those lines were priced moments ago by the lookup itself.
    expect(onRepriceProduct).not.toHaveBeenCalled();
  });
});

describe('finishing a sale clears the stored cart', () => {
  beforeEach(() => {
    clearStoredCart();
  });

  it('leaves nothing behind for the next refresh to restore', async () => {
    const user = userEvent.setup();
    renderCounter();

    await addCable(user);
    expect(sessionStorage.getItem(CART_STORAGE_KEY)).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /proceed to sale/i }));
    await user.click(await screen.findByRole('button', { name: /complete sale/i }));
    await screen.findByText(/saved INV-2026-000010/i);

    await waitFor(() => expect(sessionStorage.getItem(CART_STORAGE_KEY)).toBeNull());
  });
});
