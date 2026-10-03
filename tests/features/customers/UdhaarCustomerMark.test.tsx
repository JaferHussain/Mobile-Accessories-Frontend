import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UdhaarCustomerToggle } from '@/features/customers/UdhaarCustomerToggle';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { customerApi, type Customer } from '@/features/customers/customerApi';

/**
 * The owner's udhaar mark: the customers a field salesman may sell to on credit. Only the owner
 * sets it — the server ignores it from anyone else.
 */

vi.mock('@/features/customers/customerApi', () => ({
  customerApi: { search: vi.fn(), setCreditAllowed: vi.fn() },
}));

const shop: Customer = {
  id: 7,
  name: 'Rehman Mobiles',
  mobileNumber: '03001234567',
  address: null,
  outstandingBalance: 4200,
  isActive: true,
  saleType: 'Wholesale',
  creditAllowed: false,
};

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('marking an udhaar customer', () => {
  it('lets the owner allow the salesman to give this customer udhaar', async () => {
    const user = userEvent.setup();
    vi.mocked(customerApi.setCreditAllowed).mockResolvedValue({ ...shop, creditAllowed: true });

    wrap(<UdhaarCustomerToggle customer={shop} />);

    const box = screen.getByRole('checkbox', { name: /udhaar customer/i });
    expect(box).not.toBeChecked();

    await user.click(box);

    await waitFor(() => expect(customerApi.setCreditAllowed).toHaveBeenCalledWith(shop, true));
    expect(await screen.findByRole('checkbox', { name: /udhaar customer/i })).toBeChecked();
  });

  it('can take the mark away again', async () => {
    const user = userEvent.setup();
    vi.mocked(customerApi.setCreditAllowed).mockResolvedValue({ ...shop, creditAllowed: false });

    wrap(<UdhaarCustomerToggle customer={{ ...shop, creditAllowed: true }} />);
    await user.click(screen.getByRole('checkbox', { name: /udhaar customer/i }));

    await waitFor(() =>
      expect(customerApi.setCreditAllowed).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), false),
    );
  });

  it('says so in the customer list', async () => {
    vi.mocked(customerApi.search).mockResolvedValue({
      items: [{ ...shop, creditAllowed: true }, { ...shop, id: 8, name: 'City Phones', creditAllowed: false }],
      page: 1,
      pageSize: 25,
      totalItems: 2,
      totalPages: 1,
    });

    wrap(<CustomersPage />);

    const marked = (await screen.findByText('Rehman Mobiles')).closest('tr')!;
    const unmarked = screen.getByText('City Phones').closest('tr')!;
    expect(within(marked).getByText(/udhaar customer/i)).toBeInTheDocument();
    expect(within(unmarked).queryByText(/udhaar customer/i)).not.toBeInTheDocument();
  });
});
