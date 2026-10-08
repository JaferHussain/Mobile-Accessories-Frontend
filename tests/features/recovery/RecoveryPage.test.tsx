import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoveryPage } from '@/features/recovery/RecoveryPage';
import { recoveryApi, type RecoveryAccount, type RecoveryReport } from '@/features/recovery/recoveryApi';
import { customerApi } from '@/features/customers/customerApi';

vi.mock('@/features/recovery/recoveryApi', () => ({ recoveryApi: { report: vi.fn() } }));
vi.mock('@/features/customers/customerApi', () => ({ customerApi: { receivePayment: vi.fn(), reminder: vi.fn() } }));
vi.mock('@/features/documents/documentApi', () => ({
  documentApi: { paymentReceiptPdf: vi.fn(), createShareLink: vi.fn() },
}));

/**
 * Recovery — everyone who owes, most overdue first, with the bills still open and the two things
 * to do: remind, and take the payment. Every figure is the server's.
 */

const overdueShop: RecoveryAccount = {
  customerId: 7,
  name: 'Rehman Mobiles',
  mobileNumber: '03001234567',
  isUdhaarCustomer: true,
  outstanding: 4200,
  unpaidSince: '2026-07-10',
  dueOn: '2026-10-10',
  monthsOverdue: 2,
  notPaidBills: 1,
  partPaidBills: 1,
  openBills: [
    { onDate: '2026-07-10', entryType: 'Invoice', referenceId: 1, referenceNumber: 'INV-2026-000101', billAmount: 3000, remaining: 1200, status: 'PartPaid' },
    { onDate: '2026-08-02', entryType: 'Invoice', referenceId: 2, referenceNumber: 'INV-2026-000150', billAmount: 3000, remaining: 3000, status: 'NotPaid' },
  ],
};

const walkIn: RecoveryAccount = {
  customerId: 9,
  name: 'Walk-in Asif',
  mobileNumber: '03211234567',
  isUdhaarCustomer: false,
  outstanding: 600,
  unpaidSince: '2026-09-28',
  dueOn: '2026-10-28',
  monthsOverdue: 0,
  notPaidBills: 0,
  partPaidBills: 1,
  openBills: [
    { onDate: '2026-09-28', entryType: 'Invoice', referenceId: 3, referenceNumber: 'INV-2026-000301', billAmount: 1000, remaining: 600, status: 'PartPaid' },
  ],
};

const freshUdhaar: RecoveryAccount = {
  ...walkIn,
  customerId: 11,
  name: 'City Phones',
  isUdhaarCustomer: true,
  outstanding: 2000,
  partPaidBills: 0,
  notPaidBills: 1,
  openBills: [
    { onDate: '2026-09-28', entryType: 'Invoice', referenceId: 4, referenceNumber: 'INV-2026-000310', billAmount: 2000, remaining: 2000, status: 'NotPaid' },
  ],
};

const report: RecoveryReport = {
  totalOwed: 6800,
  customersOwing: 3,
  overdueCustomers: 1,
  overdueAmount: 4200,
  accounts: [overdueShop, walkIn, freshUdhaar],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RecoveryPage />
    </QueryClientProvider>,
  );
}

const card = (id: number) => screen.getByTestId(`recovery-${id}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recoveryApi.report).mockResolvedValue(report);
});

describe('the recovery page', () => {
  it('leads with what is owed, by how many, and how much is overdue', async () => {
    renderPage();

    expect(await screen.findByTestId('total-owed')).toHaveTextContent('6,800');
    expect(screen.getByTestId('customers-owing')).toHaveTextContent('3');
    expect(screen.getByTestId('overdue')).toHaveTextContent('1 · Rs 4,200.00');
  });

  it('says how long each has owed and flags the overdue', async () => {
    renderPage();

    await screen.findByTestId('recovery-7');
    expect(card(7)).toHaveTextContent('Owing since 10 Jul 2026');
    expect(card(7)).toHaveTextContent('2 months overdue');
    expect(card(9)).not.toHaveTextContent(/overdue/i);
  });

  it('tells udhaar customers from walk-ins who paid part', async () => {
    renderPage();

    await screen.findByTestId('recovery-7');
    expect(within(card(7)).getByText(/udhaar customer/i)).toBeInTheDocument();
    expect(within(card(9)).getByText(/part payment/i)).toBeInTheDocument();
  });

  it('shows the bills still open, each as part paid or not paid', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(within(await screen.findByTestId('recovery-7')).getByRole('button', { name: /show 2 open bills/i }));

    const bills = within(card(7)).getByRole('table', { name: /open bills of rehman mobiles/i });
    const older = within(bills).getByText('INV-2026-000101').closest('tr')!;
    expect(older).toHaveTextContent('Rs 1,200.00');
    expect(within(older).getByText(/part paid/i)).toBeInTheDocument();
    expect(within(within(bills).getByText('INV-2026-000150').closest('tr')!).getByText(/not paid/i)).toBeInTheDocument();
  });

  it.each([
    ['Udhaar customers', [7, 11], [9]],
    ['Part paid', [7, 9], [11]],
    ['Overdue', [7], [9, 11]],
  ])('filters to %s', async (label, shown, hidden) => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId('recovery-7');
    await user.click(screen.getByRole('button', { name: label }));

    shown.forEach((id) => expect(screen.getByTestId(`recovery-${id}`)).toBeInTheDocument());
    hidden.forEach((id) => expect(screen.queryByTestId(`recovery-${id}`)).not.toBeInTheDocument());
  });

  it('finds someone by name or phone', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId('recovery-7');
    await user.type(screen.getByLabelText(/search/i), '0321');

    expect(screen.getByTestId('recovery-9')).toBeInTheDocument();
    expect(screen.queryByTestId('recovery-7')).not.toBeInTheDocument();
  });

  it('takes a payment and says what is left', async () => {
    const user = userEvent.setup();
    vi.mocked(customerApi.receivePayment).mockResolvedValue({
      paymentId: 55,
      receiptNumber: 'RCP-2026-000055',
      amount: 1000,
      balanceAfter: 3200,
    });
    renderPage();

    await user.click(within(await screen.findByTestId('recovery-7')).getByRole('button', { name: /receive payment/i }));
    fireEvent.change(screen.getByLabelText(/amount received/i), { target: { value: '1000' } });
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    await waitFor(() => expect(customerApi.receivePayment).toHaveBeenCalledWith(7, 1000, 'Cash', null, false));
    expect(await screen.findByRole('status')).toHaveTextContent(/received rs 1,000\.00 from rehman mobiles/i);
    expect(screen.getByRole('status')).toHaveTextContent(/rs 3,200\.00 still owed/i);
    // The list is re-read: the server decides what is left open.
    await waitFor(() => expect(recoveryApi.report).toHaveBeenCalledTimes(2));
  });

  it('says so plainly when nobody owes anything', async () => {
    vi.mocked(recoveryApi.report).mockResolvedValue({ ...report, totalOwed: 0, customersOwing: 0, overdueCustomers: 0, overdueAmount: 0, accounts: [] });
    renderPage();

    expect(await screen.findByText(/nobody owes the shop anything/i)).toBeInTheDocument();
  });
});
