import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CommissionPage } from '@/features/commission/CommissionPage';
import { commissionApi, type CommissionStatement } from '@/features/commission/commissionApi';

vi.mock('@/features/commission/commissionApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/commission/commissionApi')>()),
  commissionApi: { statement: vi.fn(), mine: vi.fn(), pay: vi.fn() },
}));

/**
 * The salesman's commission account, as the owner reads and pays it. Every figure — each line's
 * commission, what is earned, what is owed — is the server's.
 */

const statement: CommissionStatement = {
  userId: 7,
  fullName: 'Ali',
  job: 'FieldSales',
  totalCommission: 150,
  earned: 100,
  pending: 50,
  paidOut: 60,
  owed: 40,
  lines: [
    {
      invoiceId: 1,
      invoiceNumber: 'INV-2026-000301',
      saleDate: '2026-09-30',
      customerName: null,
      productName: 'Oppo Charger',
      unitsSold: 1,
      unitsReturned: 0,
      baseUnitPrice: 1000,
      soldAtUnitPrice: 1200,
      extraPerUnit: 200,
      ratePercent: 50,
      commission: 100,
      earned: 100,
      pending: 0,
      status: 'Earned',
      earnedOn: '2026-09-30',
    },
    {
      invoiceId: 2,
      invoiceNumber: 'INV-2026-000302',
      saleDate: '2026-09-30',
      customerName: 'Rehman Mobiles',
      productName: 'Headphone',
      unitsSold: 1,
      unitsReturned: 0,
      baseUnitPrice: 500,
      soldAtUnitPrice: 600,
      extraPerUnit: 100,
      ratePercent: 50,
      commission: 50,
      earned: 0,
      pending: 50,
      status: 'Pending',
      earnedOn: null,
    },
  ],
  payouts: [
    { id: 1, amount: 60, paymentMethod: 'Cash', note: null, paidAtUtc: '2026-09-30T12:00:00Z', recordedBy: 'Moiz' },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/commissions/7']}>
        <Routes>
          <Route path="/commissions/:userId" element={<CommissionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(commissionApi.statement).mockResolvedValue(statement);
  vi.mocked(commissionApi.pay).mockResolvedValue({ ...statement, paidOut: 100, owed: 0 });
});

describe('Commission', () => {
  it('shows what he has earned, what is still waiting on udhaar, and what the shop owes him', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: /ali — commission/i })).toBeInTheDocument();
    expect(screen.getByTestId('earned')).toHaveTextContent('100');
    expect(screen.getByTestId('pending')).toHaveTextContent('50');
    expect(screen.getByTestId('paid-out')).toHaveTextContent('60');
    expect(screen.getByTestId('owed')).toHaveTextContent('40');
  });

  it('lists each product with the owner’s price, the price it fetched, and whether it is earned yet', async () => {
    renderPage();

    const earned = (await screen.findByText('Oppo Charger')).closest('tr')!;
    expect(within(earned).getByText(/1,000/)).toBeInTheDocument();
    expect(within(earned).getByText(/1,200/)).toBeInTheDocument();
    expect(within(earned).getByText(/earned 30 sep/i)).toBeInTheDocument();

    const waiting = screen.getByText('Headphone').closest('tr')!;
    expect(within(waiting).getByText(/waiting for udhaar/i)).toBeInTheDocument();
    expect(within(waiting).getByText('Rehman Mobiles')).toBeInTheDocument();
  });

  it('pays what he is owed, asking how it was paid', async () => {
    renderPage();
    await screen.findByTestId('owed');

    // The amount starts at what he is owed; how it was paid starts unanswered.
    expect(screen.getByLabelText(/^amount$/i)).toHaveValue(40);
    expect(screen.getByLabelText(/paid by/i)).toHaveValue('');

    await userEvent.selectOptions(screen.getByLabelText(/paid by/i), 'Cash');
    await userEvent.click(screen.getByRole('button', { name: /pay commission/i }));

    await waitFor(() => expect(commissionApi.pay).toHaveBeenCalledWith(7, 40, 'Cash', null));
  });

  it('will not pay until it says how', async () => {
    renderPage();
    await screen.findByTestId('owed');

    await userEvent.click(screen.getByRole('button', { name: /pay commission/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/how/i);
    expect(commissionApi.pay).not.toHaveBeenCalled();
  });

  it('lists what has been paid already', async () => {
    renderPage();

    const payout = (await screen.findByText('Moiz')).closest('tr')!;
    expect(within(payout).getByText(/60/)).toBeInTheDocument();
    expect(within(payout).getByText('Cash')).toBeInTheDocument();
  });
});
