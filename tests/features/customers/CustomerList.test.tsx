import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { customerApi, type Customer } from '@/features/customers/customerApi';

/**
 * The Customers list. A customer has no retail/wholesale type any more — the owner's call: retail
 * or wholesale is chosen for each sale at the counter, for anyone. The list says only whether a
 * customer is a registered udhaar customer.
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

const plain: Customer = {
  id: 1,
  name: 'Ahmed (Counter)',
  mobileNumber: '03001234567',
  outstandingBalance: 0,
  isActive: true,
  saleType: 'Retail',
  creditAllowed: false,
};

const udhaar: Customer = {
  id: 2,
  name: 'Bilal Traders',
  mobileNumber: '03009876543',
  outstandingBalance: 5000,
  isActive: true,
  // Stored by the server from an earlier wholesale sale — no longer shown anywhere.
  saleType: 'Wholesale',
  creditAllowed: true,
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
  vi.mocked(customerApi.search).mockResolvedValue(page([plain, udhaar]));
});

describe('the customer list', () => {
  it('calls an udhaar customer just that — never "Retail" or "Wholesale"', async () => {
    renderPage();

    const udhaarRow = (await screen.findByText('Bilal Traders')).closest('tr')!;
    const plainRow = screen.getByText('Ahmed (Counter)').closest('tr')!;

    expect(within(udhaarRow).getByText('Udhaar customer')).toBeInTheDocument();
    expect(udhaarRow.textContent).not.toMatch(/retail|wholesale/i);
    expect(plainRow.textContent).not.toMatch(/retail|wholesale|udhaar/i);
  });

  it('offers no Retail / Wholesale filter, and never asks the server for one', async () => {
    renderPage();

    await screen.findByText('Bilal Traders');

    expect(screen.queryByRole('group', { name: /sale type/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^wholesale$/i })).not.toBeInTheDocument();
    expect(customerApi.search).toHaveBeenCalledWith({ search: undefined, withBalanceOnly: false });
  });

  it('still searches, and still narrows to those who owe', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText('Search'), 'Bilal');
    await user.click(screen.getByRole('checkbox'));

    await waitFor(() =>
      expect(customerApi.search).toHaveBeenLastCalledWith({ search: 'Bilal', withBalanceOnly: true }),
    );
  });

  it('says so when a search matches nobody', async () => {
    vi.mocked(customerApi.search).mockResolvedValue(page([]));
    renderPage();

    expect(await screen.findByText('No customers match that search.')).toBeInTheDocument();
  });
});
