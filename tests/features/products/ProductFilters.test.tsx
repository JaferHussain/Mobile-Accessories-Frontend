import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProductsPage } from '@/features/products/ProductsPage';
import { productApi, type Product } from '@/features/products/productApi';
import { brandApi, categoryApi } from '@/features/taxonomy/taxonomyApi';
import { AuthProvider } from '@/features/auth/AuthContext';
import { tokenStore } from '@/api/tokenStore';
import type { AuthUser } from '@/types/api';

/**
 * The Products screen's search and filters (US1 hint, US2, US3).
 *
 * The server decides what matches. What this screen owns is which choices it sends, how they
 * combine, and what it tells the shopkeeper when nothing comes back — so that is what is tested.
 */

vi.mock('@/features/products/productApi', () => ({
  productApi: { search: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn() },
}));

vi.mock('@/features/taxonomy/taxonomyApi', () => ({
  categoryApi: { search: vi.fn() },
  brandApi: { search: vi.fn() },
}));

const admin: AuthUser = { id: 1, username: 'admin', fullName: 'Shop Owner', role: 'Admin' };

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
  brandId: 20,
  brand: 'Baseus',
  salePrice: 1100,
  quantityOnHand: 10,
  isLowStock: false,
  isActive: true,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <MemoryRouter>
      <AuthProvider initialUser={admin}>
        <QueryClientProvider client={client}>
          <ProductsPage />
        </QueryClientProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** The most recent arguments the screen sent to product search. */
function lastSearch() {
  const calls = vi.mocked(productApi.search).mock.calls;
  return calls[calls.length - 1]?.[0] ?? {};
}

describe('Products search', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(productApi.search).mockResolvedValue(page([cable]));
    vi.mocked(categoryApi.search).mockResolvedValue(page([]));
    vi.mocked(brandApi.search).mockResolvedValue(page([]));
  });

  it('sends what the shopkeeper typed', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Type-C Braided Cable');
    await user.type(screen.getByLabelText('Search'), 'c type');

    await waitFor(() => expect(lastSearch()).toMatchObject({ search: 'c type' }));
  });

  it('asks for more letters instead of searching for a single letter', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Type-C Braided Cable');
    const callsBefore = vi.mocked(productApi.search).mock.calls.length;

    await user.type(screen.getByLabelText('Search'), 'c');

    // FR-079: the server would refuse it, so the screen does not ask.
    expect(await screen.findByText(/type at least 2 letters to search/i)).toBeInTheDocument();
    expect(vi.mocked(productApi.search).mock.calls.length).toBe(callsBefore);

    // The list the shopkeeper was looking at stays on screen rather than vanishing.
    expect(screen.getByText('Type-C Braided Cable')).toBeInTheDocument();
  });

  it('searches again as soon as a longer word is added', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Type-C Braided Cable');
    await user.type(screen.getByLabelText('Search'), 'c type');

    expect(screen.queryByText(/type at least 2 letters/i)).not.toBeInTheDocument();
    await waitFor(() => expect(lastSearch()).toMatchObject({ search: 'c type' }));
  });
});

describe('Products filters', () => {
  const brands = [
    { id: 21, name: 'Samsung', description: null, isActive: true, productCount: 3 },
    { id: 20, name: 'Oppo', description: null, isActive: true, productCount: 2 },
  ];

  const categories = [
    { id: 11, name: 'Chargers', description: null, isActive: true, productCount: 4 },
    { id: 10, name: 'Cables', description: null, isActive: true, productCount: 6 },
  ];

  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(productApi.search).mockResolvedValue(page([cable]));
    // The API returns active rows ordered by name; the mocks deliberately do not, so the screen's
    // own ordering is what the test checks.
    vi.mocked(brandApi.search).mockResolvedValue(page(brands));
    vi.mocked(categoryApi.search).mockResolvedValue(page(categories));
  });

  it('offers a brand filter and a category filter, each A to Z', async () => {
    renderPage();

    const brand = await screen.findByLabelText('Brand');
    const category = screen.getByLabelText('Category');

    await screen.findByRole('option', { name: 'Oppo' });

    // FR-085.
    expect(within(brand).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All brands',
      'Oppo',
      'Samsung',
    ]);
    expect(within(category).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All categories',
      'Cables',
      'Chargers',
    ]);
  });

  it('asks the server only for the chosen brand', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'Oppo' });
    await user.selectOptions(screen.getByLabelText('Brand'), '20');

    await waitFor(() => expect(lastSearch()).toMatchObject({ brandId: 20 }));
    expect(lastSearch()).not.toHaveProperty('categoryId', expect.anything());
  });

  it('sends brand, category and search together', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'Oppo' });
    await user.selectOptions(screen.getByLabelText('Brand'), '20');
    await user.selectOptions(screen.getByLabelText('Category'), '11');
    await user.type(screen.getByLabelText('Search'), 'fast');

    // FR-083: the server combines them; the screen's job is to send all of them.
    await waitFor(() =>
      expect(lastSearch()).toMatchObject({ brandId: 20, categoryId: 11, search: 'fast' }),
    );
  });

  it('has no Clear button until a filter is set', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'Oppo' });
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Category'), '11');

    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('clears every filter but keeps what was typed', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'Oppo' });
    await user.selectOptions(screen.getByLabelText('Brand'), '20');
    await user.selectOptions(screen.getByLabelText('Category'), '11');
    await user.type(screen.getByLabelText('Search'), 'fast');

    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    // FR-084.
    expect(screen.getByLabelText('Brand')).toHaveValue('');
    expect(screen.getByLabelText('Category')).toHaveValue('');
    expect(screen.getByLabelText('Search')).toHaveValue('fast');

    await waitFor(() => {
      const sent = lastSearch();
      expect(sent).toMatchObject({ search: 'fast' });
      expect(sent.brandId).toBeUndefined();
      expect(sent.categoryId).toBeUndefined();
    });
  });

  it('says so when the chosen filters match nothing', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'Oppo' });
    vi.mocked(productApi.search).mockResolvedValue(page([]));

    await user.selectOptions(screen.getByLabelText('Brand'), '21');

    // FR-086: never an unexplained empty table.
    expect(await screen.findByText(/no products match the chosen filters/i)).toBeInTheDocument();
  });
});

describe('Products filters no longer mention local brands', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(productApi.search).mockResolvedValue(page([cable]));
    vi.mocked(brandApi.search).mockResolvedValue(page([]));
    vi.mocked(categoryApi.search).mockResolvedValue(
      page([{ id: 11, name: 'Earbuds', description: null, isActive: true, productCount: 1 }]),
    );
  });

  it('offers no local-brands filter, and never asks the server for one', async () => {
    renderPage();

    await screen.findByText('Type-C Braided Cable');

    // The shop handles local goods as an ordinary brand with a name, not as a flag on every
    // brand. Replaces the old "Products local brands filter" block: with nothing able to set
    // the flag, a filter requiring it could only ever return an empty list.
    expect(screen.queryByLabelText(/local brands only/i)).not.toBeInTheDocument();
    expect(lastSearch().localOnly).toBeUndefined();
  });
});
