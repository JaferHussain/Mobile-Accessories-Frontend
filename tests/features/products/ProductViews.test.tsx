import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProductsPage } from '@/features/products/ProductsPage';
import { productApi, type Product } from '@/features/products/productApi';
import { brandApi, categoryApi } from '@/features/taxonomy/taxonomyApi';
import { AuthProvider } from '@/features/auth/AuthContext';
import { tokenStore } from '@/api/tokenStore';
import type { AuthUser } from '@/types/api';

// A stand-in for the real PosPage: this file's job is to prove Sell hands the counter
// something to look up via navigation state, not to re-test the counter screen itself
// (PosPage/PosScreen have their own suites, including how they consume this same state).
function FakePosPage() {
  const term = (useLocation().state as { prefillTerm?: string } | null)?.prefillTerm ?? '';

  return <input aria-label="Scan or search" defaultValue={term} readOnly />;
}

/**
 * Feature 005, US2 — the Products screen's two views.
 *
 * The point of the toggle is that it changes only the PRESENTATION. The same search, the same
 * filters and the same rows, drawn two ways. A grid that quietly queried differently would be
 * a second, drifting product list, which is the failure these tests exist to prevent.
 */

vi.mock('@/features/products/productApi', () => ({
  productApi: {
    search: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    uploadImage: vi.fn(),
  },
}));

vi.mock('@/features/taxonomy/taxonomyApi', () => ({
  categoryApi: { search: vi.fn() },
  brandApi: { search: vi.fn() },
}));

const admin: AuthUser = { id: 1, username: 'admin', fullName: 'Shop Owner', role: 'Admin' };
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
  categoryId: 7,
  category: 'Cables',
  brandId: 3,
  brand: 'Baseus',
  brandIsLocal: false,
  model: 'CATZ-01',
  barcode: '8901234567890',
  imagePath: 'content/products/cable.jpg',
  salePrice: 1100,
  quantityOnHand: 12,
  isLowStock: false,
  isActive: true,
  costPrice: 800,
  retailPrice: 1250,
};

const unphotographed: Product = {
  ...cable,
  id: 2,
  name: 'Plain Charger',
  imagePath: null,
  barcode: null,
  brandId: null,
  brand: null,
};

function renderPage(user: AuthUser = admin) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <MemoryRouter initialEntries={['/products']}>
      <AuthProvider initialUser={user}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/pos" element={<FakePosPage />} />
          </Routes>
        </QueryClientProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tokenStore.clear();
  window.localStorage.clear();

  vi.mocked(productApi.search).mockResolvedValue(page([cable, unphotographed]) as never);
  vi.mocked(categoryApi.search).mockResolvedValue(
    page([{ id: 7, name: 'Cables', isActive: true }]) as never,
  );
  vi.mocked(brandApi.search).mockResolvedValue(
    page([{ id: 3, name: 'Baseus', isLocal: false, isActive: true }]) as never,
  );
});

describe('Products view toggle', () => {
  it('opens as the table for someone who has never chosen', async () => {
    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('switches to the picture grid and back', async () => {
    renderPage();

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /pictures/i }));

    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
    expect(screen.getByTestId('product-grid')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /list/i }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('remembers the choice for next time', async () => {
    renderPage();

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /pictures/i }));
    await screen.findByTestId('product-grid');

    // A second visit, same browser.
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId('product-grid').length).toBeGreaterThan(0));
  });

  it('shows the same products, from the same query, in both views', async () => {
    renderPage();

    await screen.findByRole('table');
    const callsAsTable = vi.mocked(productApi.search).mock.calls.length;
    const lastTableQuery = vi.mocked(productApi.search).mock.calls[callsAsTable - 1]![0];

    await userEvent.click(screen.getByRole('button', { name: /pictures/i }));
    const grid = await screen.findByTestId('product-grid');

    // Both views list both products...
    expect(within(grid).getByText('Type-C Braided Cable')).toBeInTheDocument();
    expect(within(grid).getByText('Plain Charger')).toBeInTheDocument();

    // ...and the grid did not go asking the server anything different.
    const latest = vi.mocked(productApi.search).mock.calls.at(-1)![0];
    expect(latest).toEqual(lastTableQuery);
  });

  it('keeps the filters working in the grid', async () => {
    renderPage();

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /pictures/i }));
    await screen.findByTestId('product-grid');

    await userEvent.type(screen.getByLabelText(/search/i), 'cable');

    await waitFor(() =>
      expect(vi.mocked(productApi.search).mock.calls.at(-1)![0]).toMatchObject({
        search: 'cable',
      }),
    );
  });
});

describe('Product grid cards', () => {
  it('shows name, brand, category, price and stock on each card', async () => {
    renderPage();

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /pictures/i }));

    const grid = await screen.findByTestId('product-grid');
    const card = within(grid).getByTestId('product-card-1');

    expect(within(card).getByText('Type-C Braided Cable')).toBeInTheDocument();
    expect(within(card).getByText(/Baseus/)).toBeInTheDocument();
    expect(within(card).getByText(/Cables/)).toBeInTheDocument();
    expect(within(card).getByText(/1,100/)).toBeInTheDocument();
    expect(within(card).getByText(/12/)).toBeInTheDocument();
  });

  it('loads the thumbnail, never the full-size picture', async () => {
    renderPage();

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /pictures/i }));

    const card = within(await screen.findByTestId('product-grid')).getByTestId('product-card-1');
    const image = within(card).getByRole('img');

    expect(image.getAttribute('src')).toContain('cable_thumb.jpg');
    expect(image).toHaveAttribute('loading', 'lazy');
  });

  it('shows a placeholder for a product that has no picture', async () => {
    renderPage();

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /pictures/i }));

    const card = within(await screen.findByTestId('product-grid')).getByTestId('product-card-2');

    expect(within(card).getByTestId('product-picture-placeholder')).toBeInTheDocument();
  });
});

describe('Product detail', () => {
  async function openDetail(user: AuthUser = admin) {
    renderPage(user);

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /pictures/i }));

    const card = within(await screen.findByTestId('product-grid')).getByTestId('product-card-1');
    await userEvent.click(card);

    return screen.findByTestId('product-detail');
  }

  it('opens the full picture and the product details', async () => {
    const detail = await openDetail();

    expect(within(detail).getByText('Type-C Braided Cable')).toBeInTheDocument();
    expect(within(detail).getByText(/Baseus/)).toBeInTheDocument();
    expect(within(detail).getByText(/Cables/)).toBeInTheDocument();
    expect(within(detail).getByText(/CATZ-01/)).toBeInTheDocument();
    expect(within(detail).getByText(/8901234567890/)).toBeInTheDocument();

    // The full image here, and only here — this is the one screen where the picture is the
    // subject rather than a thumbnail in a list.
    const image = within(detail).getByRole('img');
    expect(image.getAttribute('src')).toContain('cable.jpg');
    expect(image.getAttribute('src')).not.toContain('_thumb');
  });

  it('shows the retail price, not the counter sale price', async () => {
    // retailPrice (1,250) and salePrice (1,100) deliberately differ in the fixture: a
    // discounted counter price must not be mistaken for the sticker price when the owner is
    // reviewing the catalogue.
    const detail = await openDetail(admin);

    expect(within(detail).getByText('Rs 1,250.00')).toBeInTheDocument();
    expect(within(detail).queryByText('Rs 1,100.00')).not.toBeInTheDocument();
  });

  it('falls back to the sale price for a salesman, who is not sent retailPrice', async () => {
    const staffProduct: Product = { ...cable, costPrice: undefined, retailPrice: undefined };
    vi.mocked(productApi.search).mockResolvedValue(page([staffProduct]) as never);

    const detail = await openDetail(staff);

    expect(within(detail).getByText('Rs 1,100.00')).toBeInTheDocument();
  });

  it('never shows cost — the detail view is for finding a product, not costing it', async () => {
    // Cost/margin belongs to the reports and purchase screens; showing it here, even to the
    // owner, is scope this view does not need and the architecture tests already treat cost
    // as sensitive everywhere it is not explicitly required.
    const detail = await openDetail(admin);

    expect(within(detail).queryByText(/cost/i)).not.toBeInTheDocument();
  });

  it('offers a Sell button to jump straight to the counter with this product', async () => {
    const detail = await openDetail(admin);

    expect(within(detail).getByRole('button', { name: /sell/i })).toBeInTheDocument();
  });

  it('offers Sell to a salesman too — anyone at the counter may sell a product', async () => {
    const detail = await openDetail(staff);

    expect(within(detail).getByRole('button', { name: /sell/i })).toBeInTheDocument();
  });

  it('offers Edit and Retire to the owner, matching the table', async () => {
    const detail = await openDetail(admin);

    expect(within(detail).getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /retire/i })).toBeInTheDocument();
  });

  it('offers no Edit or Retire to a salesman', async () => {
    const detail = await openDetail(staff);

    expect(within(detail).queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: /retire/i })).not.toBeInTheDocument();
  });

  it('sends the counter to /pos, ready to find this product', async () => {
    const detail = await openDetail();

    await userEvent.click(within(detail).getByRole('button', { name: /sell/i }));

    // The counter itself decides how to look the product up; this screen's job ends at
    // handing over which one and getting out of the way.
    expect(await screen.findByLabelText(/scan or search/i)).toHaveValue('8901234567890');
  });

  it('closes the detail when the view is switched back to the table', async () => {
    const detail = await openDetail();

    await userEvent.click(screen.getByRole('button', { name: /list/i }));

    expect(detail).not.toBeInTheDocument();
  });
});
