import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SupplierLedgerPage } from '@/features/suppliers/SupplierLedgerPage';
import { supplierApi, type SupplierLedger } from '@/features/suppliers/supplierApi';

vi.mock('@/features/suppliers/supplierApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/suppliers/supplierApi')>();

  return {
    ...actual,
    supplierApi: { ...actual.supplierApi, search: vi.fn(), ledger: vi.fn() },
  };
});

/**
 * A supplier's account, read the way the owner's own book reads.
 *
 * <p>Every figure — each line's balance, the totals, what the period opens on — comes from the
 * server. The screen lays them out and words each line; it never runs a balance itself.</p>
 */

const ledger: SupplierLedger = {
  supplierId: 7,
  supplierName: 'Ahmad Abbasi',
  payableBalance: 70_000,
  totalPurchased: 100_000,
  totalReturned: 10_000,
  totalPaid: 20_000,
  from: null,
  to: null,
  openingBalance: 0,
  entries: [
    {
      entryType: 'Purchase',
      referenceId: 501,
      entryDateUtc: '2026-09-01T05:00:00Z',
      productName: 'Tempered Glass 9H',
      quantity: 100,
      referenceNumber: null,
      paymentMethod: null,
      note: null,
      billAmount: 100_000,
      returnedAmount: 0,
      paidAmount: 0,
      hasProof: false,
      balanceAfter: 100_000,
    },
    {
      entryType: 'Return',
      referenceId: 12,
      entryDateUtc: '2026-09-10T05:00:00Z',
      productName: 'Tempered Glass 9H',
      quantity: 10,
      referenceNumber: 'PRT-2026-000012',
      paymentMethod: null,
      note: 'Cracked',
      billAmount: 0,
      returnedAmount: 10_000,
      paidAmount: 0,
      hasProof: false,
      balanceAfter: 90_000,
    },
    {
      entryType: 'Payment',
      referenceId: 33,
      entryDateUtc: '2026-09-15T05:00:00Z',
      productName: null,
      quantity: null,
      referenceNumber: null,
      paymentMethod: 'BankTransfer',
      note: 'TXN 4471',
      billAmount: 0,
      returnedAmount: 0,
      paidAmount: 20_000,
      hasProof: false,
      balanceAfter: 70_000,
    },
  ],
};

function renderPage(at = '/supplier-ledger?supplierId=7') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/supplier-ledger" element={<SupplierLedgerPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rowFor = (text: string) => screen.getByText(text).closest('tr')!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supplierApi.search).mockResolvedValue({
    items: [
      { id: 7, name: 'Ahmad Abbasi', payableBalance: 70_000, isActive: true },
      { id: 8, name: 'Al-Rehman Traders', payableBalance: 0, isActive: true },
    ],
    page: 1,
    pageSize: 100,
    totalItems: 2,
    totalPages: 1,
  });
  vi.mocked(supplierApi.ledger).mockResolvedValue(ledger);
});

describe('the supplier ledger', () => {
  it('opens on the supplier it was sent for', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: /ahmad abbasi/i })).toBeInTheDocument();
    expect(supplierApi.ledger).toHaveBeenCalledWith(7, undefined, undefined);
  });

  it('asks which supplier when none was chosen', async () => {
    renderPage('/supplier-ledger');

    expect(await screen.findByText(/choose a supplier to see/i)).toBeInTheDocument();
    expect(supplierApi.ledger).not.toHaveBeenCalled();
  });

  it('lists every purchase, return and payment with what was owed after each', async () => {
    renderPage();

    await screen.findByText(/tempered glass 9h × 100/i);

    expect(within(rowFor('Tempered Glass 9H × 100')).getByText('Purchase')).toBeInTheDocument();
    expect(within(rowFor('Tempered Glass 9H × 100')).getByTestId('balance')).toHaveTextContent('100,000');

    const returned = rowFor('PRT-2026-000012 · Tempered Glass 9H × 10 · Cracked');
    expect(within(returned).getByTestId('balance')).toHaveTextContent('90,000');

    // The method in words, and the reference the owner typed — what a supplier dispute needs.
    const paid = rowFor('Bank transfer · TXN 4471');
    expect(within(paid).getByTestId('balance')).toHaveTextContent('70,000');
  });

  it('shows the totals that explain what is owed', async () => {
    renderPage();

    expect(await screen.findByTestId('total-purchased')).toHaveTextContent('100,000');
    expect(screen.getByTestId('total-returned')).toHaveTextContent('10,000');
    expect(screen.getByTestId('total-paid')).toHaveTextContent('20,000');
    expect(screen.getByTestId('total-owed')).toHaveTextContent('70,000');
  });

  it('asks the server for a date range, and opens it on what was already owed', async () => {
    vi.mocked(supplierApi.ledger).mockResolvedValue({
      ...ledger,
      from: '2026-09-10',
      to: '2026-09-30',
      openingBalance: 100_000,
      entries: ledger.entries.slice(1),
    });

    renderPage();
    await screen.findByRole('heading', { name: /ahmad abbasi/i });

    await userEvent.type(screen.getByLabelText(/from/i), '2026-09-10');
    await userEvent.type(screen.getByLabelText(/^to$/i), '2026-09-30');

    await waitFor(() =>
      expect(supplierApi.ledger).toHaveBeenLastCalledWith(7, '2026-09-10', '2026-09-30'),
    );
    expect(await screen.findByTestId('opening-balance')).toHaveTextContent('100,000');
  });

  it('lets a transfer payment carry its proof, and never a cash one', async () => {
    renderPage();

    const paid = (await screen.findByText('Bank transfer · TXN 4471')).closest('tr')!;
    expect(within(paid).getByLabelText(/attach proof/i)).toBeInTheDocument();

    // Goods bought or sent back are not payments; there is nothing to screenshot.
    expect(within(rowFor('Tempered Glass 9H × 100')).queryByLabelText(/attach proof/i)).not.toBeInTheDocument();
  });

  it('switches supplier from the picker', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /ahmad abbasi/i });

    await userEvent.selectOptions(screen.getByLabelText(/supplier/i), '8');

    await waitFor(() => expect(supplierApi.ledger).toHaveBeenLastCalledWith(8, undefined, undefined));
  });
});
