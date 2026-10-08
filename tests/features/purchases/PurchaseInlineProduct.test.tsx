import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PurchasesPage } from '@/features/purchases/PurchasesPage';
import { productApi, type Product } from '@/features/products/productApi';
import { purchaseApi, supplierApi } from '@/features/suppliers/supplierApi';
import { brandApi, categoryApi } from '@/features/taxonomy/taxonomyApi';

/**
 * Feature 006 — buying something the shop has never sold before.
 *
 * The search only ever looked through products that already exist, so the first purchase of a
 * new line of stock had nowhere to go: the owner had to leave for the Products screen and come
 * back, or simply not record the purchase. These tests hold the escape hatch open, and hold it
 * to using the SAME product form — a second, drifting one is the real risk here.
 */

vi.mock('@/features/products/productApi', () => ({
  productApi: { search: vi.fn(), create: vi.fn(), uploadImage: vi.fn() },
}));

vi.mock('@/features/suppliers/supplierApi', () => ({
  supplierApi: { search: vi.fn() },
  purchaseApi: { search: vi.fn(), record: vi.fn() },
}));

vi.mock('@/features/purchases/purchaseBillApi', () => ({
  purchaseBillApi: { list: vi.fn().mockResolvedValue([]), get: vi.fn(), record: vi.fn(), pay: vi.fn() },
}));

vi.mock('@/features/shopAccounts/shopAccountApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/shopAccounts/shopAccountApi')>();
  return { ...actual, shopAccountApi: { ...actual.shopAccountApi, list: vi.fn().mockResolvedValue([]) } };
});

vi.mock('@/features/taxonomy/taxonomyApi', () => ({
  categoryApi: { search: vi.fn() },
  brandApi: { search: vi.fn() },
}));

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 100,
  totalItems: items.length,
  totalPages: 1,
});

const created: Product = {
  id: 42,
  name: 'Wireless Charger 15W',
  categoryId: 7,
  category: 'Chargers',
  brandId: null,
  brand: null,
  model: null,
  barcode: null,
  imagePath: null,
  salePrice: 2500,
  quantityOnHand: 0,
  isLowStock: true,
  isActive: true,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <PurchasesPage />
    </QueryClientProvider>,
  );
}

async function searchForSomethingThatDoesNotExist() {
  await userEvent.type(
    (await screen.findByLabelText(/which product did you buy/i)),
    'Wireless Charger',
  );

  await screen.findByText(/no products match/i);
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(productApi.search).mockResolvedValue(page([]) as never);
  vi.mocked(productApi.create).mockResolvedValue(created as never);
  vi.mocked(supplierApi.search).mockResolvedValue(
    page([{ id: 3, name: 'Al-Rehman Traders', payableBalance: 0, isActive: true }]) as never,
  );
  vi.mocked(purchaseApi.search).mockResolvedValue(page([]) as never);
  vi.mocked(categoryApi.search).mockResolvedValue(
    page([{ id: 7, name: 'Chargers', isActive: true }]) as never,
  );
  // A brand is required on a product, so the inline form needs one to pick.
  vi.mocked(brandApi.search).mockResolvedValue(
    page([{ id: 3, name: 'Baseus', isActive: true }]) as never,
  );
});

describe('buying a product that does not exist yet', () => {
  it('offers to create one when the search finds nothing', async () => {
    renderPage();
    await searchForSomethingThatDoesNotExist();

    expect(screen.getByRole('button', { name: /create.*product/i })).toBeInTheDocument();
  });

  it('opens the same product form the Products screen uses', async () => {
    renderPage();
    await searchForSomethingThatDoesNotExist();

    await userEvent.click(screen.getByRole('button', { name: /create.*product/i }));

    // Recognisable by its own fields rather than a test id: if this ever became a second,
    // simplified form, these would be the first things to diverge.
    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Brand')).toBeInTheDocument();
    // No price field: the purchase this form leads into is what prices the product.
    expect(screen.queryByLabelText('Sale price')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/picture/i)).toBeInTheDocument();
  });

  it('carries the new product straight into the purchase', async () => {
    renderPage();
    await searchForSomethingThatDoesNotExist();
    await userEvent.click(screen.getByRole('button', { name: /create.*product/i }));

    await userEvent.type(await screen.findByLabelText('Name'), 'Wireless Charger 15W');
    await userEvent.selectOptions(screen.getByLabelText('Category'), '7');
    await userEvent.selectOptions(screen.getByLabelText('Brand'), '3');
    await userEvent.click(screen.getByRole('button', { name: /save product/i }));

    await waitFor(() => expect(productApi.create).toHaveBeenCalled());

    // The point of the feature: no second search, no navigating back. The bill's line for the
    // product just created is already on screen, ready for its cost and quantity.
    expect(await screen.findByRole('button', { name: /add to bill/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Wireless Charger 15W/ })).toBeInTheDocument();
  });

  it('creates nothing when the form is cancelled', async () => {
    renderPage();
    await searchForSomethingThatDoesNotExist();
    await userEvent.click(screen.getByRole('button', { name: /create.*product/i }));

    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    expect(productApi.create).not.toHaveBeenCalled();
    expect((await screen.findByLabelText(/which product did you buy/i))).toBeInTheDocument();
  });

  it('does not offer creation while the search still matches something', async () => {
    vi.mocked(productApi.search).mockResolvedValue(page([created]) as never);

    renderPage();
    await userEvent.type((await screen.findByLabelText(/which product did you buy/i)), 'Wireless');

    await screen.findByText('Wireless Charger 15W');
    expect(screen.queryByRole('button', { name: /create.*product/i })).not.toBeInTheDocument();
  });
});

describe('a search too short for the server', () => {
  it('is never sent, and says why instead', async () => {
    renderPage();

    // The server refuses a search made only of one-letter words (FR-079). Sending it produced
    // a 400 at the counter and, worse, hid the "create a new product" offer behind an error —
    // exactly when the owner is trying to buy something that does not exist yet.
    await userEvent.type((await screen.findByLabelText(/which product did you buy/i)), 'c');

    expect(await screen.findByText(/at least 2 letters/i)).toBeInTheDocument();
    expect(productApi.search).not.toHaveBeenCalled();
  });

  it('searches as soon as the word is long enough', async () => {
    renderPage();

    await userEvent.type((await screen.findByLabelText(/which product did you buy/i)), 'ca');

    await waitFor(() =>
      expect(productApi.search).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'ca' }),
      ),
    );
  });
});
