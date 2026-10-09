import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { dashboardApi } from '@/features/dashboard/dashboardApi';
import { teamApi, type TeamMember } from '@/features/team/teamApi';
import { proofApi } from '@/features/proofs/proofApi';
import { dayCloseApi } from '@/features/dayclose/dayCloseApi';
import { reportApi } from '@/features/reports/reportApi';
import { supplierApi } from '@/features/suppliers/supplierApi';

/**
 * The owner's dashboard is one layout scoped by a row of chips: the whole shop, each person, and
 * the owner's money. These tests pin what each chip shows and that what is worth a look comes first.
 */

vi.mock('@/features/dashboard/dashboardApi', () => ({ dashboardApi: { get: vi.fn() } }));
vi.mock('@/features/team/teamApi', () => ({
  teamApi: { members: vi.fn(), watchList: vi.fn(), activity: vi.fn() },
}));
vi.mock('@/features/dayclose/dayCloseApi', () => ({ dayCloseApi: { preview: vi.fn() } }));
vi.mock('@/features/reports/reportApi', () => ({
  reportApi: { expenses: vi.fn(), receivables: vi.fn() },
}));
vi.mock('@/features/suppliers/supplierApi', () => ({ supplierApi: { search: vi.fn() } }));
vi.mock('@/features/proofs/proofApi', () => ({ proofApi: { missing: vi.fn() } }));

const base: TeamMember = {
  userId: 1, fullName: 'Shop Owner', role: 'Admin', job: null, invoiceCount: 4, totalSales: 4500,
  receivedAtSale: 5800, creditGiven: 0, discountGiven: 0, returnCount: 3, returnValue: 3900,
  udhaarCollected: 0, lastLoginUtc: null, cashInHand: 0, stockUnits: 0,
};
const salesman: TeamMember = {
  ...base, userId: 2, fullName: 'Jafer Hussain', role: 'Staff', job: 'FieldSales',
  invoiceCount: 5, totalSales: 7800, returnCount: 0, returnValue: 0, cashInHand: 3200, stockUnits: 26,
};
const counter: TeamMember = {
  ...base, userId: 3, fullName: 'Moiz', role: 'Staff', job: 'Counter',
  invoiceCount: 11, totalSales: 9150, returnCount: 0, returnValue: 0,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** A chip in the row at the top — never the same name in the compare table below it. */
async function chip(name: RegExp) {
  const group = await screen.findByRole('group', { name: /whose figures/i });

  return within(group).findByRole('button', { name });
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(dashboardApi.get).mockResolvedValue({
    period: 'Today', totalSales: 21450, totalPurchases: 0, totalSaleReturns: 0, totalPurchaseReturns: 0,
    grossProfit: 4000, totalExpenses: 0, netProfit: 4000, cashSales: 0, creditSales: 0,
    udhaarSalesCount: 0, udhaarSalesAmount: 0, partPaidSalesCount: 0, partPaidRemaining: 0,
    totalReceivables: 0, totalPayables: 0, itemsSoldCount: 0, lowStockProducts: [],
  } as never);
  vi.mocked(teamApi.members).mockResolvedValue([base, salesman, counter]);
  vi.mocked(teamApi.watchList).mockResolvedValue([
    {
      kind: 'SameDayReturn', referenceId: 3, reference: 'SRT-2026-000003', entryDateUtc: new Date().toISOString(),
      userId: 1, userName: 'Shop Owner', amount: 1300, detail: null,
    },
  ]);
  vi.mocked(teamApi.activity).mockResolvedValue([]);
  vi.mocked(proofApi.missing).mockResolvedValue([{}, {}] as never);
  vi.mocked(dayCloseApi.preview).mockResolvedValue({
    closingDate: '2026-10-08', openingFloat: 0, cashSales: 6150, cashRecovery: 3500, cashFromSalesmen: 3200,
    cashRefunds: 600, cashPaidOut: 1350, cashToSuppliers: 2000, expectedCash: 8900, countedCash: 0,
    difference: 0, note: null, closedByUserName: null, closedAtUtc: null, isClosed: false,
  });
  vi.mocked(reportApi.expenses).mockResolvedValue({
    total: 1850, byCategory: [{ category: 'Shop rent', total: 1200 }, { category: 'Electricity', total: 650 }],
  });
  vi.mocked(reportApi.receivables).mockResolvedValue([
    { customerId: 9, customerName: 'Ikram', outstandingBalance: 6200 },
  ]);
  vi.mocked(supplierApi.search).mockResolvedValue({
    items: [
      { id: 1, name: 'Al-Rehman Traders', payableBalance: 42000 },
      { id: 2, name: 'Paid Up Supplies', payableBalance: 0 },
    ],
    page: 1, pageSize: 25, totalItems: 2, totalPages: 1,
  } as never);
});

describe('the dashboard lens', () => {
  it('opens on the whole shop, with a chip for the owner, each person and Money', async () => {
    renderPage();

    expect(await chip(/everyone/i)).toHaveAttribute('aria-pressed', 'true');
    expect(await chip(/shop owner/i)).toBeInTheDocument();
    expect(await chip(/jafer hussain/i)).toBeInTheDocument();
    expect(await chip(/moiz/i)).toBeInTheDocument();
    expect(await chip(/money/i)).toBeInTheDocument();
  });

  it('puts what is worth a look before the figures, and counts it on the person it is about', async () => {
    renderPage();

    const strip = await screen.findByText(/1 to look at · Everyone/i);

    expect(strip).toBeInTheDocument();
    expect(screen.getByText('Same-day return')).toBeInTheDocument();

    // The count rides on the owner's chip, so a problem shows before anyone opens a person.
    const ownerChip = await chip(/shop owner/i);
    expect(within(ownerChip).getByTitle('1 to look at')).toBeInTheDocument();
  });

  it('compares everyone side by side, and a name opens that person', async () => {
    const user = userEvent.setup();
    renderPage();

    const table = await screen.findByTestId('compare-people');

    expect(within(table).getByText('Jafer Hussain')).toBeInTheDocument();
    expect(within(table).getByText(/Rs\s?7,800/)).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: 'Jafer Hussain' }));

    expect(await chip(/jafer hussain/i)).toHaveAttribute('aria-pressed', 'true');
  });

  it("shows one person's own figures — and cash and stock only for a field salesman", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await chip(/jafer hussain/i));

    expect(await screen.findByText('Cash with him')).toBeInTheDocument();
    expect(screen.getByText('26 units')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /commission/i })).toBeInTheDocument();
    // Nothing per person is a cost or a profit.
    expect(screen.queryByText(/profit/i)).not.toBeInTheDocument();

    await user.click(await chip(/moiz/i));

    expect(screen.queryByText('Cash with him')).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing to look at for Moiz/i)).toBeInTheDocument();
  });

  it("opens the owner's money: the drawer, expenses, what he owes and what is owed to him", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await chip(/money/i));

    expect(await screen.findByTestId('money-expected')).toHaveTextContent(/8,900/);
    expect(within(screen.getByTestId('money-expenses')).getByText('Shop rent')).toBeInTheDocument();
    // Only a supplier who is actually owed is listed.
    const suppliers = await screen.findByTestId('money-suppliers');
    expect(within(suppliers).getByText('Al-Rehman Traders')).toBeInTheDocument();
    expect(within(suppliers).queryByText('Paid Up Supplies')).not.toBeInTheDocument();
    expect(within(await screen.findByTestId('money-owed')).getByText('Ikram')).toBeInTheDocument();

    // Transfers still without their screenshot lead the money lens.
    expect(screen.getByText(/2 transfers without a screenshot/i)).toBeInTheDocument();
  });

  it('asks the server for the days the chosen period covers', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId('compare-people');
    await user.click(screen.getByRole('button', { name: 'This month' }));

    await vi.waitFor(() => {
      const [from, to] = vi.mocked(teamApi.members).mock.calls.at(-1) ?? [];
      expect(from && to && from <= to && from.endsWith('-01')).toBe(true);
    });
    expect(dashboardApi.get).toHaveBeenLastCalledWith('ThisMonth');
  });
});
