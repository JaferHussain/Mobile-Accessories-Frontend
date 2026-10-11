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
import { myProductsApi } from '@/features/myDay/myProductsApi';
import { AuthProvider } from '@/features/auth/AuthContext';
import type { AuthUser } from '@/types/api';

vi.mock('@/features/myDay/myDayApi', () => ({ myDayApi: { mine: vi.fn() } }));
vi.mock('@/features/commission/commissionApi', () => ({ commissionApi: { mine: vi.fn() } }));
vi.mock('@/features/salesmanCash/salesmanCashApi', () => ({ salesmanCashApi: { mine: vi.fn() } }));
vi.mock('@/features/salesmanStock/salesmanStockApi', () => ({ salesmanStockApi: { mine: vi.fn() } }));
vi.mock('@/features/myDay/myProductsApi', () => ({ myProductsApi: { mine: vi.fn() } }));
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
    {
      kind: 'Sale',
      referenceId: 2,
      reference: 'INV-2026-000502',
      entryDateUtc: '2026-09-30T07:00:00Z',
      amount: 1_500,
      method: 'JazzCash',
      detail: null,
    },
  ],
  payments: {
    cashBills: 2,
    cashReceived: 7_500,
    onlineBills: 2,
    onlineReceived: 2_300,
    online: [
      { method: 'JazzCash', bills: 1, received: 1_500 },
      { method: 'BankTransfer', bills: 1, received: 800 },
    ],
  },
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
  vi.mocked(myProductsApi.mine).mockResolvedValue({
    assigned: [{ productId: 1, productName: 'Oppo Charger 18W', quantity: 4, price: 1100, value: 4400, commissionPerUnit: 50 }],
    assignedUnits: 4,
    assignedValue: 4400,
    sold: [
      { productId: 1, productName: 'Oppo Charger 18W', quantitySold: 3, amount: 3200 },
      { productId: 2, productName: 'Type-C Cable', quantitySold: 2, amount: 900 },
    ],
    soldUnits: 5,
    soldAmount: 4100,
  });
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

  it("shows the salesman the products given to him, at their price, and what he sold with its total", async () => {
    renderPage(salesman);

    const assigned = await screen.findByTestId('assigned-products');
    const charger = within(assigned).getByText('Oppo Charger 18W').closest('tr')!;
    expect(charger).toHaveTextContent('4');
    expect(charger).toHaveTextContent('Rs 1,100.00');
    expect(charger).toHaveTextContent('Rs 4,400.00');
    expect(screen.getByTestId('assigned-total')).toHaveTextContent('4 items · Rs 4,400.00');
    // The commission the owner promised him on each one he sells.
    expect(screen.getByTestId('commission-per-unit-1')).toHaveTextContent('Rs 50.00');

    const sold = screen.getByTestId('sold-products');
    expect(within(sold).getByText('Type-C Cable').closest('tr')!).toHaveTextContent('Rs 900.00');
    expect(screen.getByTestId('sold-total')).toHaveTextContent('5 items · Rs 4,100.00');
    expect(screen.queryByText(/wholesale|cost|profit/i)).not.toBeInTheDocument();
  });

  it("asks for this month's sales when This month is chosen", async () => {
    const user = userEvent.setup();
    renderPage(salesman);

    await screen.findByTestId('sold-products');
    await user.click(screen.getByRole('button', { name: 'This month' }));

    await waitFor(() => {
      const [from, to] = vi.mocked(myProductsApi.mine).mock.calls.at(-1) ?? [];
      expect(from && to && from.endsWith('-01') && from <= to).toBe(true);
    });
  });

  it('keeps the products panels off the counter shopkeeper', async () => {
    renderPage(counter);

    await screen.findByTestId('my-sales');
    expect(screen.queryByTestId('assigned-products')).not.toBeInTheDocument();
    expect(myProductsApi.mine).not.toHaveBeenCalled();
  });

  it('shows online sales clearly apart from cash, method by method, and marks each online sale', async () => {
    renderPage(salesman);

    expect(await screen.findByTestId('my-online-received')).toHaveTextContent('Rs 2,300.00');
    expect(screen.getByTestId('my-cash-received')).toHaveTextContent('Rs 7,500.00');

    const methods = screen.getByTestId('my-online-methods');
    expect(within(methods).getByText('JazzCash').closest('li')!).toHaveTextContent('Rs 1,500.00');
    expect(within(methods).getByText('Bank transfer').closest('li')!).toHaveTextContent('Rs 800.00');

    const onlineSale = screen.getByText('INV-2026-000502').closest('li')!;
    expect(within(onlineSale).getByText('Online')).toBeInTheDocument();
    const udhaarSale = screen.getByText('INV-2026-000501').closest('li')!;
    expect(within(udhaarSale).queryByText('Online')).not.toBeInTheDocument();
  });
});
