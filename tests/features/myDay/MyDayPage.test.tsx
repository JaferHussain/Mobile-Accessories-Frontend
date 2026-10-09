import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MyDayPage } from '@/features/myDay/MyDayPage';
import { myDayApi, type MyDay } from '@/features/myDay/myDayApi';
import { commissionApi, type CommissionStatement } from '@/features/commission/commissionApi';
import { salesmanCashApi, type SalesmanCashStatement } from '@/features/salesmanCash/salesmanCashApi';
import { salesmanStockApi } from '@/features/salesmanStock/salesmanStockApi';
import { recoveryApi } from '@/features/recovery/recoveryApi';
import { AuthProvider } from '@/features/auth/AuthContext';
import type { AuthUser } from '@/types/api';

vi.mock('@/features/myDay/myDayApi', () => ({ myDayApi: { mine: vi.fn() } }));
vi.mock('@/features/commission/commissionApi', () => ({ commissionApi: { mine: vi.fn() } }));
vi.mock('@/features/salesmanCash/salesmanCashApi', () => ({ salesmanCashApi: { mine: vi.fn() } }));
vi.mock('@/features/salesmanStock/salesmanStockApi', () => ({ salesmanStockApi: { mine: vi.fn() } }));
vi.mock('@/features/recovery/recoveryApi', () => ({ recoveryApi: { report: vi.fn() } }));

/**
 * The salesman's own screen, on his phone: what he sold, the cash he is carrying, and the
 * commission he has earned. Every figure is the server's, and always his own.
 */

const salesman: AuthUser = { id: 7, username: 'ali', fullName: 'Ali', role: 'Staff', job: 'FieldSales' };
const counter: AuthUser = { id: 8, username: 'bilal', fullName: 'Bilal', role: 'Staff', job: 'Counter' };

const day: MyDay = {
  card: {
    userId: 7,
    fullName: 'Ali',
    role: 'Staff',
    job: 'FieldSales',
    invoiceCount: 4,
    totalSales: 12_500,
    receivedAtSale: 9_000,
    creditGiven: 3_500,
    discountGiven: 150,
    returnCount: 1,
    returnValue: 600,
    udhaarCollected: 2_000,
    lastLoginUtc: null,
    cashInHand: 7_400,
    stockUnits: 5,
  },
  activity: [
    {
      kind: 'Sale',
      referenceId: 1,
      reference: 'INV-2026-000501',
      entryDateUtc: '2026-09-30T06:00:00Z',
      amount: 3_500,
      method: 'Credit',
      detail: 'Rehman Mobiles',
    },
  ],
};

const commission: CommissionStatement = {
  userId: 7,
  fullName: 'Ali',
  job: 'FieldSales',
  totalCommission: 450,
  earned: 300,
  pending: 150,
  paidOut: 100,
  owed: 200,
  lines: [],
  payouts: [],
};

const cash: SalesmanCashStatement = {
  userId: 7,
  fullName: 'Ali',
  job: 'FieldSales',
  collected: 11_000,
  refunded: 600,
  handedOver: 3_000,
  inHand: 7_400,
  movements: [],
};

function renderPage(user: AuthUser = salesman) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <AuthProvider initialUser={user}>
        <MemoryRouter>
          <MyDayPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(myDayApi.mine).mockResolvedValue(day);
  vi.mocked(recoveryApi.report).mockResolvedValue({
    totalOwed: 9_600,
    customersOwing: 2,
    overdueCustomers: 1,
    overdueAmount: 6_200,
    accounts: [
      {
        customerId: 1, name: 'Ikram', mobileNumber: null, isUdhaarCustomer: true, outstanding: 6_200,
        unpaidSince: '2026-08-01', dueOn: '2026-09-01', monthsOverdue: 2, notPaidBills: 1, partPaidBills: 0, openBills: [],
      },
      {
        customerId: 2, name: 'Bilal Traders', mobileNumber: null, isUdhaarCustomer: true, outstanding: 3_400,
        unpaidSince: '2026-10-01', dueOn: '2026-11-01', monthsOverdue: 0, notPaidBills: 0, partPaidBills: 1, openBills: [],
      },
    ],
  });
  vi.mocked(commissionApi.mine).mockResolvedValue(commission);
  vi.mocked(salesmanCashApi.mine).mockResolvedValue(cash);
  vi.mocked(salesmanStockApi.mine).mockResolvedValue({
    userId: 7,
    fullName: 'Ali',
    job: 'FieldSales',
    totalUnits: 5,
    items: [{ productId: 11, productName: 'Oppo Charger', quantity: 5 }],
    movements: [],
  });
});

describe('my day', () => {
  it('shows what he sold today', async () => {
    renderPage();

    const sales = await screen.findByRole('region', { name: /my sales/i });
    expect(within(sales).getByTestId('my-sales')).toHaveTextContent('12,500');
    expect(within(sales).getByTestId('my-bills')).toHaveTextContent('4');
    expect(within(sales).getByTestId('my-udhaar-given')).toHaveTextContent('3,500');
    expect(within(sales).getByTestId('my-udhaar-collected')).toHaveTextContent('2,000');
  });

  it('shows the cash he is carrying, to hand over', async () => {
    renderPage();

    const section = await screen.findByRole('region', { name: /my cash/i });
    expect(await within(section).findByTestId('my-cash-in-hand')).toHaveTextContent('7,400');
    expect(within(section).getByTestId('my-handed-over')).toHaveTextContent('3,000');
  });

  it('shows what commission he has earned, what waits on udhaar, and what he is owed', async () => {
    renderPage();

    const section = await screen.findByRole('region', { name: /my commission/i });
    expect(await within(section).findByTestId('my-earned')).toHaveTextContent('300');
    expect(within(section).getByTestId('my-pending')).toHaveTextContent('150');
    expect(within(section).getByTestId('my-owed')).toHaveTextContent('200');
  });

  it('shows the stock he is carrying', async () => {
    renderPage();

    const section = await screen.findByRole('region', { name: /my stock/i });
    const row = (await within(section).findByText('Oppo Charger')).closest('tr')!;
    expect(row).toHaveTextContent('5');
  });

  it('lists what he did, in words', async () => {
    renderPage();

    const list = await screen.findByRole('list', { name: /what i did/i });
    expect(within(list).getByText('INV-2026-000501')).toBeInTheDocument();
    expect(within(list).getByText(/rehman mobiles/i)).toBeInTheDocument();
  });

  it('asks the server for this month when chosen', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId('my-sales');
    await user.click(screen.getByRole('button', { name: /this month/i }));

    await waitFor(() =>
      expect(myDayApi.mine).toHaveBeenLastCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-01$/),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      ),
    );
  });

  it('shows the counter shopkeeper his sales, and no market cash or commission', async () => {
    renderPage(counter);

    await screen.findByTestId('my-sales');
    expect(screen.queryByRole('region', { name: /my cash/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /my commission/i })).not.toBeInTheDocument();
    expect(commissionApi.mine).not.toHaveBeenCalled();
    expect(salesmanCashApi.mine).not.toHaveBeenCalled();
    expect(salesmanStockApi.mine).not.toHaveBeenCalled();
  });

  it('shows the counter shopkeeper who to chase, most overdue first, and his discounts', async () => {
    renderPage(counter);

    const chase = await screen.findByTestId('my-chase');

    expect(within(chase).getByText('Ikram')).toBeInTheDocument();
    expect(within(chase).getByText(/2 months overdue/)).toBeInTheDocument();
    expect(within(chase).getByText('Bilal Traders')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open recovery/i })).toHaveAttribute('href', '/recovery');
    expect(screen.getByTestId('my-discounts')).toHaveTextContent(/150/);
  });

  it('keeps the chase list off the salesman in the market, who has his own round', async () => {
    renderPage(salesman);

    await screen.findByTestId('my-sales');

    expect(screen.queryByTestId('my-chase')).not.toBeInTheDocument();
    expect(recoveryApi.report).not.toHaveBeenCalled();
  });

  it('carries no cost and no profit on either kind of day', async () => {
    renderPage(counter);

    await screen.findByTestId('my-sales');

    expect(screen.queryByText(/profit|cost/i)).not.toBeInTheDocument();
  });
});
