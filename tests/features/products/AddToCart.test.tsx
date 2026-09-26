import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProductsPage } from '@/features/products/ProductsPage';
import { productApi, type Product } from '@/features/products/productApi';
import { brandApi, categoryApi } from '@/features/taxonomy/taxonomyApi';
import { AuthProvider } from '@/features/auth/AuthContext';
import { CartProvider } from '@/features/pos/CartProvider';
import { CART_STORAGE_KEY, clearStoredCart } from '@/features/pos/cartStorage';
import type { AuthUser } from '@/types/api';

/**
 * Shopping from the Products list.
 *
 * The counter can only be searched one term at a time, which is the wrong tool for "show me
 * everything Oppo and let me pick three". This puts the catalogue's own list and filters to work
 * building a sale, without leaving the screen.
 */

vi.mock('@/features/products/productApi', () => ({
  productApi: { search: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn() },
}));

vi.mock('@/features/taxonomy/taxonomyApi', () => ({
  categoryApi: { search: vi.fn() },
  brandApi: { search: vi.fn() },
}));

const staff: AuthUser = { id: 2, username: 'salesman', fullName: 'Salesman', role: 'Staff' };

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 100,
  totalItems: items.length,
  totalPages: 1,
});

const cable: Product = {
  id: 1,
  name: 'Type-C Braided Cable',
  categoryId: 10,
  category: 'Cables',
  salePrice: 1100,
  quantityOnHand: 10,
  isLowStock: false,
  isActive: true,
};

const soldOut: Product = { ...cable, id: 2, name: 'Earbuds Pro', quantityOnHand: 0 };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <MemoryRouter>
      <AuthProvider initialUser={staff}>
        <QueryClientProvider client={client}>
          <CartProvider>
            <ProductsPage />
          </CartProvider>
        </QueryClientProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const storedCart = () => JSON.parse(sessionStorage.getItem(CART_STORAGE_KEY) ?? 'null');

const addToCart = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(await screen.findByRole('button', { name: `Add ${name} to cart` }));

beforeEach(() => {
  vi.clearAllMocks();
  clearStoredCart();
  vi.mocked(productApi.search).mockResolvedValue(page([cable, soldOut]));
  vi.mocked(productApi.get).mockResolvedValue(cable);
  vi.mocked(categoryApi.search).mockResolvedValue(page([]));
  vi.mocked(brandApi.search).mockResolvedValue(page([]));
});

describe('adding to the cart from the Products list', () => {
  it('puts the product in the cart without leaving the screen', async () => {
    const user = userEvent.setup();
    renderPage();

    await addToCart(user, cable.name);

    await waitFor(() => expect(storedCart()?.lines).toHaveLength(1));
    expect(storedCart().lines[0]).toMatchObject({ productId: cable.id, quantity: 1 });

    // Still on the catalogue, ready to pick the next thing.
    expect(screen.getByText(cable.name)).toBeInTheDocument();
  });

  it('increments the quantity rather than adding a second line', async () => {
    const user = userEvent.setup();
    renderPage();

    await addToCart(user, cable.name);
    await waitFor(() => expect(storedCart()?.lines).toHaveLength(1));

    await addToCart(user, cable.name);

    // The server refuses two lines for one product, so a second Add is "one more of these".
    await waitFor(() => expect(storedCart().lines[0].quantity).toBe(2));
    expect(storedCart().lines).toHaveLength(1);
  });

  it('confirms what went in, so the click is not silent', async () => {
    const user = userEvent.setup();
    renderPage();

    await addToCart(user, cable.name);

    expect(await screen.findByRole('status')).toHaveTextContent(/type-c braided cable/i);
  });

  /**
   * The trap: the Products list is priced at the counter rate, but the sale being built may be
   * a wholesale one. Adding the row's own price would quietly sell wholesale goods at retail.
   */
  it('prices the item for the sale being built, not for the list', async () => {
    const user = userEvent.setup();
    renderPage();

    await addToCart(user, cable.name);

    await waitFor(() => expect(productApi.get).toHaveBeenCalledWith(cable.id, 'Retail'));
  });

  it('uses the price the server quoted, not the one on the row', async () => {
    const user = userEvent.setup();
    vi.mocked(productApi.get).mockResolvedValue({ ...cable, salePrice: 950 });
    renderPage();

    await addToCart(user, cable.name);

    await waitFor(() => expect(storedCart()?.lines[0].unitSalePrice).toBe(950));
  });

  it('refuses to add something that is out of stock', async () => {
    renderPage();


    // The sale would be refused by the server anyway; better to say so before the counter.
    expect(
      await screen.findByRole('button', { name: `Add ${soldOut.name} to cart` }),
    ).toBeDisabled();
  });

  it('leaves the cart alone when the price cannot be read', async () => {
    const user = userEvent.setup();
    vi.mocked(productApi.get).mockRejectedValue(new Error('offline'));
    renderPage();

    await addToCart(user, cable.name);

    // Adding at an unknown price is worse than not adding.
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(storedCart()).toBeNull();
  });
});
