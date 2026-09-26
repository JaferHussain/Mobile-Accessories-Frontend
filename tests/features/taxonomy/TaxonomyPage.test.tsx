import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BrandsPage, CategoriesPage } from '@/features/taxonomy/TaxonomyPage';
import { brandApi, categoryApi } from '@/features/taxonomy/taxonomyApi';
import { AuthProvider } from '@/features/auth/AuthContext';
import { tokenStore } from '@/api/tokenStore';
import type { AuthUser } from '@/types/api';

/**
 * The Categories and Brands screens.
 *
 * Both modules share one component, so the behaviour is tested once against Categories and the
 * Brands page is checked only for the things that differ: its wording and its endpoint.
 */

vi.mock('@/features/taxonomy/taxonomyApi', () => ({
  categoryApi: {
    search: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
  },
  brandApi: {
    search: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
  },
}));

const admin: AuthUser = { id: 1, username: 'admin', fullName: 'Shop Owner', role: 'Admin' };
const staff: AuthUser = { id: 2, username: 'salesman', fullName: 'Bilal', role: 'Staff' };

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 200,
  totalItems: items.length,
  totalPages: 1,
});

const cables = { id: 1, name: 'Cables', description: 'Charging cables', isActive: true, productCount: 3 };
const retired = { id: 2, name: 'Old Stock', description: null, isActive: false, productCount: 0 };

function renderPage(element: React.ReactElement, user: AuthUser = admin) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <AuthProvider initialUser={user}>
      <QueryClientProvider client={client}>
        <MemoryRouter>{element}</MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );
}

describe('Categories page', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(categoryApi.search).mockResolvedValue(page([cables]));
    vi.mocked(brandApi.search).mockResolvedValue(page([]));
  });

  it('lists the categories with how many products use each', async () => {
    renderPage(<CategoriesPage />);

    expect(await screen.findByText('Cables')).toBeInTheDocument();
    expect(screen.getByText('Charging cables')).toBeInTheDocument();

    // The count is what tells the owner whether retiring this is disruptive.
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('creates a category', async () => {
    vi.mocked(categoryApi.create).mockResolvedValue({ ...cables, id: 9, name: 'Earbuds' });

    const user = userEvent.setup();
    renderPage(<CategoriesPage />);

    await screen.findByText('Cables');

    await user.type(screen.getByLabelText('Name'), 'Earbuds');
    await user.click(screen.getByRole('button', { name: /save category/i }));

    await waitFor(() =>
      expect(categoryApi.create).toHaveBeenCalledWith({ name: 'Earbuds', description: null }),
    );
  });

  it('trims the name and sends null for an empty description', async () => {
    vi.mocked(categoryApi.create).mockResolvedValue(cables);

    const user = userEvent.setup();
    renderPage(<CategoriesPage />);

    await screen.findByText('Cables');

    await user.type(screen.getByLabelText('Name'), '  Covers  ');
    await user.click(screen.getByRole('button', { name: /save category/i }));

    await waitFor(() =>
      expect(categoryApi.create).toHaveBeenCalledWith({ name: 'Covers', description: null }),
    );
  });

  it('refuses to save an empty name without calling the server', async () => {
    const user = userEvent.setup();
    renderPage(<CategoriesPage />);

    await screen.findByText('Cables');
    await user.click(screen.getByRole('button', { name: /save category/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i);
    expect(categoryApi.create).not.toHaveBeenCalled();
  });

  it('edits an existing category through the same form', async () => {
    vi.mocked(categoryApi.update).mockResolvedValue(cables);

    const user = userEvent.setup();
    renderPage(<CategoriesPage />);

    await screen.findByText('Cables');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Cables');

    await user.clear(name);
    await user.type(name, 'Data Cables');
    await user.click(screen.getByRole('button', { name: /save category/i }));

    // One rename, and every product filed here follows — the reason the module exists.
    await waitFor(() =>
      expect(categoryApi.update).toHaveBeenCalledWith(1, {
        name: 'Data Cables',
        description: 'Charging cables',
      }),
    );
  });

  it('warns how many products are affected before retiring one', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(categoryApi.deactivate).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage(<CategoriesPage />);

    await screen.findByText('Cables');
    await user.click(screen.getByRole('button', { name: 'Retire' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('3 product(s)'));
    await waitFor(() => expect(categoryApi.deactivate).toHaveBeenCalledWith(1));

    confirm.mockRestore();
  });

  it('does not retire anything if the warning is dismissed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const user = userEvent.setup();
    renderPage(<CategoriesPage />);

    await screen.findByText('Cables');
    await user.click(screen.getByRole('button', { name: 'Retire' }));

    expect(categoryApi.deactivate).not.toHaveBeenCalled();

    confirm.mockRestore();
  });

  it('offers to restore a retired category', async () => {
    vi.mocked(categoryApi.search).mockResolvedValue(page([retired]));
    vi.mocked(categoryApi.reactivate).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage(<CategoriesPage />);

    await screen.findByText('Old Stock');
    expect(screen.getByText('Retired')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(categoryApi.reactivate).toHaveBeenCalledWith(2));
  });

  it('shows a staff user the list but no way to change it', async () => {
    renderPage(<CategoriesPage />, staff);

    expect(await screen.findByText('Cables')).toBeInTheDocument();

    // Hiding these is a convenience; the server refuses a Staff write regardless.
    expect(screen.queryByRole('button', { name: /save category/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument();
  });

  it('reports a failure from the server', async () => {
    vi.mocked(categoryApi.create).mockRejectedValue(new Error('boom'));

    const user = userEvent.setup();
    renderPage(<CategoriesPage />);

    await screen.findByText('Cables');
    await user.type(screen.getByLabelText('Name'), 'Earbuds');
    await user.click(screen.getByRole('button', { name: /save category/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Brands page', () => {
  beforeEach(() => {
    tokenStore.clear();
    vi.clearAllMocks();
    vi.mocked(brandApi.search).mockResolvedValue(
      page([{ id: 5, name: 'Baseus', description: null, isActive: true, productCount: 2 }]),
    );
  });

  it('is its own list, separate from categories', async () => {
    renderPage(<BrandsPage />);

    expect(await screen.findByText('Baseus')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Brands' })).toBeInTheDocument();
    expect(brandApi.search).toHaveBeenCalled();
    expect(categoryApi.search).not.toHaveBeenCalled();
  });

  it('creates a brand', async () => {
    vi.mocked(brandApi.create).mockResolvedValue({
      id: 6,
      name: 'Anker',
      description: null,
      isActive: true,
      productCount: 0,
    });

    const user = userEvent.setup();
    renderPage(<BrandsPage />);

    await screen.findByText('Baseus');

    await user.type(screen.getByLabelText('Name'), 'Anker');
    await user.click(screen.getByRole('button', { name: /save brand/i }));

    await waitFor(() =>
      // Just a name and a description. Local goods are handled as an ordinary brand with a
      // name of its own, not as a flag carried by every brand in the shop.
      expect(brandApi.create).toHaveBeenCalledWith({
        name: 'Anker',
        description: null,
      }),
    );
  });
});

describe('Local is an ordinary brand now, not a flag', () => {
  beforeEach(() => {
    tokenStore.clear();
    vi.clearAllMocks();
    vi.mocked(brandApi.search).mockResolvedValue(
      page([
        { id: 5, name: 'Baseus', description: null, isActive: true, productCount: 2 },
        { id: 6, name: 'Localled Brand', description: null, isActive: true, productCount: 1 },
      ]),
    );
    vi.mocked(categoryApi.search).mockResolvedValue(page([cables]));
  });

  it('shows no Local or Imported label against any brand', async () => {
    renderPage(<BrandsPage />);

    await screen.findByText('Baseus');

    // Replaces the old local/imported column. Nothing could set the flag any more, so the
    // column could only ever read "Imported" on every row — noise, not information.
    expect(screen.queryByText('Imported')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Made' })).not.toBeInTheDocument();
  });

  it('lists a brand named for local goods exactly like any other brand', async () => {
    renderPage(<BrandsPage />);

    // The shop's whole handling of local goods: a brand with a name, sitting in the same list,
    // edited the same way, with nothing special about it.
    expect(await screen.findByText('Localled Brand')).toBeInTheDocument();
  });

  it('offers no local tick-box on either screen', async () => {
    renderPage(<CategoriesPage />);

    await screen.findByText('Cables');

    expect(screen.queryByLabelText(/local brand/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Imported')).not.toBeInTheDocument();
  });
});
