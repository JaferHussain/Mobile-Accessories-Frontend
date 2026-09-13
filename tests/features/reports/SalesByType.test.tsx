import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { reportApi } from '@/features/reports/reportApi';

/**
 * The retail/wholesale report.
 *
 * The owner reads the split at day end, then clicks whichever half looks wrong to see the sales
 * behind it — who sold, and who bought.
 */

vi.mock('@/features/reports/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/reports/reportApi')>();

  return {
    ...actual,
    reportApi: {
      ...actual.reportApi,
      salesByType: vi.fn(),
      salesList: vi.fn(),
      profit: vi.fn().mockResolvedValue([]),
    },
  };
});

const split = [
  { saleType: 'Retail' as const, totalSales: 80_000, invoiceCount: 21, itemsSold: 40 },
  { saleType: 'Wholesale' as const, totalSales: 45_000, invoiceCount: 2, itemsSold: 23 },
];

const wholesaleSales = {
  items: [
    {
      invoiceId: 42,
      invoiceNumber: 'INV-2026-000042',
      invoiceDateUtc: '2026-09-10T05:15:00Z',
      saleType: 'Wholesale' as const,
      customerId: 7,
      customerName: 'Ali Mobile Shop',
      userName: 'Bilal',
      total: 27_000,
      amountPaid: 27_000,
      amountRemaining: 0,
      paymentMethod: 'Cash',
      itemCount: 30,
    },
    {
      invoiceId: 47,
      invoiceNumber: 'INV-2026-000047',
      invoiceDateUtc: '2026-09-10T09:40:00Z',
      saleType: 'Wholesale' as const,
      customerId: null,
      customerName: null,
      userName: 'Shop Owner',
      total: 18_000,
      amountPaid: 10_000,
      amountRemaining: 8_000,
      paymentMethod: 'Partial',
      itemCount: 12,
    },
  ],
  page: 1,
  pageSize: 200,
  totalItems: 2,
  totalPages: 1,
};

function renderReports() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}

async function openSplit(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Report'), 'sales-by-type');
  await screen.findByRole('button', { name: 'Wholesale' });
}

describe('Retail vs wholesale report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportApi.salesByType).mockResolvedValue(split);
    vi.mocked(reportApi.salesList).mockResolvedValue(wholesaleSales);
  });

  it('shows both halves of the day with a combined total', async () => {
    const user = userEvent.setup();
    renderReports();

    await openSplit(user);

    expect(screen.getByText('Rs 80,000.00')).toBeInTheDocument();
    expect(screen.getByText('Rs 45,000.00')).toBeInTheDocument();

    // The two halves must add up to what the owner sees elsewhere as the day's sales.
    expect(screen.getByText('Rs 125,000.00')).toBeInTheDocument();
  });

  it('does not fetch the drill-down until a total is clicked', async () => {
    const user = userEvent.setup();
    renderReports();

    await openSplit(user);

    expect(reportApi.salesList).not.toHaveBeenCalled();
  });

  it('opens the sales behind the wholesale total', async () => {
    const user = userEvent.setup();
    renderReports();

    await openSplit(user);
    await user.click(screen.getByRole('button', { name: 'Wholesale' }));

    await waitFor(() =>
      expect(reportApi.salesList).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'Wholesale',
      ),
    );

    expect(await screen.findByText('INV-2026-000042')).toBeInTheDocument();
  });

  it('names who bought and who sold each one', async () => {
    const user = userEvent.setup();
    renderReports();

    await openSplit(user);
    await user.click(screen.getByRole('button', { name: 'Wholesale' }));

    expect(await screen.findByText('Ali Mobile Shop')).toBeInTheDocument();
    expect(screen.getByText('Bilal')).toBeInTheDocument();
    expect(screen.getByText('Shop Owner')).toBeInTheDocument();
  });

  it('shows a walk-in rather than a blank customer', async () => {
    const user = userEvent.setup();
    renderReports();

    await openSplit(user);
    await user.click(screen.getByRole('button', { name: 'Wholesale' }));

    // A cash sale has no customer record, but the sale still happened and must be listed.
    expect(await screen.findByText('Walk-in')).toBeInTheDocument();
  });

  it('flags what is still owed on a part-paid sale', async () => {
    const user = userEvent.setup();
    renderReports();

    await openSplit(user);
    await user.click(screen.getByRole('button', { name: 'Wholesale' }));

    expect(await screen.findByText(/Rs 8,000.00 owing/)).toBeInTheDocument();
  });

  it('goes back to the split', async () => {
    const user = userEvent.setup();
    renderReports();

    await openSplit(user);
    await user.click(screen.getByRole('button', { name: 'Wholesale' }));

    await screen.findByText('INV-2026-000042');
    await user.click(screen.getByRole('button', { name: /back to the split/i }));

    expect(await screen.findByRole('button', { name: 'Retail' })).toBeInTheDocument();
    expect(screen.queryByText('INV-2026-000042')).not.toBeInTheDocument();
  });

  it('closes an open drill-down when another report is chosen', async () => {
    const user = userEvent.setup();
    renderReports();

    await openSplit(user);
    await user.click(screen.getByRole('button', { name: 'Wholesale' }));
    await screen.findByText('INV-2026-000042');

    await user.selectOptions(screen.getByLabelText('Report'), 'profit');
    await user.selectOptions(screen.getByLabelText('Report'), 'sales-by-type');

    // The drill-down belonged to the report that opened it.
    expect(await screen.findByRole('button', { name: 'Retail' })).toBeInTheDocument();
  });
});
