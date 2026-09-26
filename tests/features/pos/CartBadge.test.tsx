import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CartBadge } from '@/features/pos/CartBadge';
import { PosScreen } from '@/features/pos/PosScreen';
import { CartProvider } from '@/features/pos/CartProvider';
import { CART_STORAGE_KEY, clearStoredCart } from '@/features/pos/cartStorage';

/**
 * The way back to a sale in progress.
 *
 * Adding items from the Products list is only half the flow — without something showing that a
 * cart exists, the salesman has no reason to believe the items went anywhere, and no route back
 * to the counter that does not go through the menu.
 */

function seedCart(lines: Array<{ quantity: number; unitSalePrice: number }>) {
  sessionStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify({
      savedAt: new Date().toISOString(),
      saleType: 'Retail',
      lines: lines.map((line, index) => ({
        productId: index + 1,
        productName: `Item ${index + 1}`,
        lineDiscount: 0,
        ...line,
      })),
    }),
  );
}

function renderBadge() {
  render(
    <MemoryRouter initialEntries={['/products']}>
      <CartProvider>
        <Routes>
          <Route path="/products" element={<CartBadge />} />
          <Route path="/pos" element={<p>The counter</p>} />
        </Routes>
      </CartProvider>
    </MemoryRouter>,
  );
}

describe('CartBadge', () => {
  beforeEach(() => {
    clearStoredCart();
  });

  it('stays out of the way when no sale is in progress', () => {
    renderBadge();

    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
  });

  it('counts the units in the cart, not the lines', () => {
    // Three of one thing and two of another is five items to the shopkeeper, not two.
    seedCart([
      { quantity: 3, unitSalePrice: 100 },
      { quantity: 2, unitSalePrice: 50 },
    ]);
    renderBadge();

    expect(screen.getByTestId('cart-badge')).toHaveTextContent('5 items');
  });

  it('says "1 item" rather than "1 items"', () => {
    seedCart([{ quantity: 1, unitSalePrice: 100 }]);
    renderBadge();

    expect(screen.getByTestId('cart-badge')).toHaveTextContent('1 item');
  });

  it('shows what the cart comes to', () => {
    seedCart([
      { quantity: 3, unitSalePrice: 100 },
      { quantity: 2, unitSalePrice: 50 },
    ]);
    renderBadge();

    expect(screen.getByTestId('cart-badge')).toHaveTextContent('Rs 400.00');
  });

  it('goes back to the counter', async () => {
    const user = userEvent.setup();
    seedCart([{ quantity: 1, unitSalePrice: 100 }]);
    renderBadge();

    await user.click(screen.getByRole('button', { name: /cart/i }));

    expect(await screen.findByText('The counter')).toBeInTheDocument();
  });
});

/**
 * The return leg. Shopping from the catalogue only works as a round trip: out to the Products
 * list, and back to the counter with the cart intact.
 */
describe('the counter offers a way out to the catalogue', () => {
  it('hands over to the Products list', async () => {
    const user = userEvent.setup();
    const onBrowseProducts = vi.fn();

    render(
      <MemoryRouter>
        <CartProvider>
          <PosScreen
            onFindProduct={vi.fn()}
            onRepriceProduct={vi.fn()}
            onSave={vi.fn()}
            onCreateCustomer={vi.fn()}
            onSearchCustomers={vi.fn(async () => [])}
            onBrowseProducts={onBrowseProducts}
            canSellOnCredit
          />
        </CartProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /add more items/i }));

    expect(onBrowseProducts).toHaveBeenCalled();
  });

  it('says nothing about browsing when there is nowhere to go', () => {
    render(
      <MemoryRouter>
        <CartProvider>
          <PosScreen
            onFindProduct={vi.fn()}
            onRepriceProduct={vi.fn()}
            onSave={vi.fn()}
            onCreateCustomer={vi.fn()}
            onSearchCustomers={vi.fn(async () => [])}
            canSellOnCredit
          />
        </CartProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /add more items/i })).not.toBeInTheDocument();
  });
});
