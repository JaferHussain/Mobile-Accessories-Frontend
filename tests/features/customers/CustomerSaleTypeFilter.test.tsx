import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { customerApi, type Customer } from '@/features/customers/customerApi';

/**
 * Feature 004 — finding customers by sale type, in one click.
 *
 * All/Retail/Wholesale are alternatives, never additive (FR-092), combine with the existing
 * search and "owes money" filters (FR-094), and each customer's type is readable on their row
 * without opening them (FR-098).
 */

vi.mock('@/features/customers/customerApi', () => ({
  customerApi: { search: vi.fn() },
}));

const page = (items: Customer[]) => ({
  items,
  page: 1,
  pageSize: 25,
  totalItems: items.length,
  totalPages: 1,
});

const retailCustomer: Customer = {
  id: 1,
  name: 'Ahmed (Counter)',
  mobileNumber: '03001234567',
  outstandingBalance: 0,
  isActive: true,
  saleType: 'Retail',
};

const wholesaleCustomer: Customer = {
  id: 2,
  name: 'Bilal Traders',
  mobileNumber: '03009876543',
  outstandingBalance: 5000,
  isActive: true,
  saleType: 'Wholesale',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <CustomersPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(customerApi.search).mockResolvedValue(page([retailCustomer, wholesaleCustomer]));
});

describe('the sale-type filter', () => {
  it('shows all customers on arrival', async () => {
    renderPage();

    expect(await screen.findByText('Ahmed (Counter)')).toBeInTheDocument();
    expect(screen.getByText('Bilal Traders')).toBeInTheDocument();
  });

  it('lists only wholesale customers after clicking Wholesale', async () => {
    vi.mocked(customerApi.search).mockResolvedValue(page([wholesaleCustomer]));

    renderPage();
    await screen.findByText('Bilal Traders');

    await userEvent.click(screen.getByRole('button', { name: 'Wholesale' }));

    await waitFor(() =>
      expect(customerApi.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ saleType: 'Wholesale' }),
      ),
    );
  });

  it('lists only retail customers after clicking Retail', async () => {
    vi.mocked(customerApi.search).mockResolvedValue(page([retailCustomer]));

    renderPage();
    await screen.findByText('Ahmed (Counter)');

    await userEvent.click(screen.getByRole('button', { name: 'Retail' }));

    await waitFor(() =>
      expect(customerApi.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ saleType: 'Retail' }),
      ),
    );
  });

  it('returns to everyone after clicking All', async () => {
    renderPage();
    await screen.findByText('Ahmed (Counter)');

    await userEvent.click(screen.getByRole('button', { name: 'Wholesale' }));
    await userEvent.click(screen.getByRole('button', { name: 'All' }));

    await waitFor(() =>
      expect(customerApi.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ saleType: undefined }),
      ),
    );
  });

  it('marks the active choice so it reads as selected', async () => {
    renderPage();
    await screen.findByText('Ahmed (Counter)');

    const wholesaleButton = screen.getByRole('button', { name: 'Wholesale' });
    const allButton = screen.getByRole('button', { name: 'All' });

    expect(allButton).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(wholesaleButton);

    expect(wholesaleButton).toHaveAttribute('aria-pressed', 'true');
    expect(allButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('combines with the search box, not replaces it', async () => {
    renderPage();
    await screen.findByText('Ahmed (Counter)');

    await userEvent.click(screen.getByRole('button', { name: 'Wholesale' }));
    await userEvent.type(screen.getByLabelText(/search/i), 'Bilal');

    await waitFor(() =>
      expect(customerApi.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ saleType: 'Wholesale', search: 'Bilal' }),
      ),
    );
  });

  it('combines with the "owes money" filter', async () => {
    renderPage();
    await screen.findByText('Ahmed (Counter)');

    await userEvent.click(screen.getByRole('button', { name: 'Wholesale' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /owe/i }));

    await waitFor(() =>
      expect(customerApi.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ saleType: 'Wholesale', withBalanceOnly: true }),
      ),
    );
  });

  it('says so explicitly when a combination matches nobody', async () => {
    vi.mocked(customerApi.search).mockResolvedValue(page([]));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Wholesale' }));

    expect(await screen.findByText(/no customers match/i)).toBeInTheDocument();
  });
});

describe("each customer's type on the list", () => {
  it('is shown on the row without opening the customer', async () => {
    renderPage();

    const retailRow = (await screen.findByText('Ahmed (Counter)')).closest('tr')!;
    const wholesaleRow = screen.getByText('Bilal Traders').closest('tr')!;

    expect(retailRow.textContent).toMatch(/retail/i);
    expect(wholesaleRow.textContent).toMatch(/wholesale/i);
  });
});
