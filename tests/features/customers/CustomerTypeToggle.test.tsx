import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerTypeToggle } from '@/features/customers/CustomerTypeToggle';
import { customerApi, type Customer } from '@/features/customers/customerApi';

vi.mock('@/features/customers/customerApi', () => ({ customerApi: { setSaleType: vi.fn() } }));

/**
 * Retail or wholesale — what the Customers screen's Wholesale filter reads. A wholesale sale sets
 * it on its own; this is the owner's switch for setting it first, or correcting it.
 */

const ikram: Customer = {
  id: 7,
  name: 'Ikram',
  mobileNumber: '03001234567',
  address: null,
  outstandingBalance: 0,
  isActive: true,
  saleType: 'Retail',
};

function renderToggle(customer: Customer = ikram) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CustomerTypeToggle customer={customer} />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('the customer type switch', () => {
  it('shows the type the customer has', () => {
    renderToggle();

    expect(screen.getByRole('button', { name: 'Retail' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Wholesale' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('makes a customer a wholesale customer', async () => {
    const user = userEvent.setup();
    vi.mocked(customerApi.setSaleType).mockResolvedValue({ ...ikram, saleType: 'Wholesale' });
    renderToggle();

    await user.click(screen.getByRole('button', { name: 'Wholesale' }));

    await waitFor(() => expect(customerApi.setSaleType).toHaveBeenCalledWith(ikram, 'Wholesale'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Wholesale' })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('sends nothing when the type already chosen is pressed again', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: 'Retail' }));

    expect(customerApi.setSaleType).not.toHaveBeenCalled();
  });
});
