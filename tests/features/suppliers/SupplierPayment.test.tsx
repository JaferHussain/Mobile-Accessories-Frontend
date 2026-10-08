import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { supplierApi, type Supplier } from '@/features/suppliers/supplierApi';
import { shopAccountApi } from '@/features/shopAccounts/shopAccountApi';
import { proofApi } from '@/features/proofs/proofApi';

vi.mock('@/features/shopAccounts/shopAccountApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/shopAccounts/shopAccountApi')>();
  return { ...actual, shopAccountApi: { ...actual.shopAccountApi, list: vi.fn() } };
});

vi.mock('@/features/suppliers/supplierApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/suppliers/supplierApi')>();

  return {
    ...actual,
    supplierApi: { ...actual.supplierApi, search: vi.fn(), recordPayment: vi.fn() },
  };
});

/**
 * Paying a supplier, and finding their account.
 *
 * <p>The Pay box used to ask only for an amount and record every payment as Cash — so a bank
 * transfer to a supplier came out of the evening's drawer count as a short. It now asks how the
 * money went, with no answer chosen in advance.</p>
 */

const ahmad: Supplier = {
  id: 7,
  name: 'Ahmad Abbasi',
  contactNumber: '8878787',
  payableBalance: 90_000,
  isActive: true,
};

function LocationProbe() {
  const location = useLocation();

  return <p data-testid="location">{location.pathname + location.search}</p>;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/suppliers']}>
        <Routes>
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/supplier-ledger" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openPay() {
  renderPage();

  const row = (await screen.findByText('Ahmad Abbasi')).closest('tr')!;
  await userEvent.click(within(row).getByRole('button', { name: 'Pay' }));

  return screen.getByRole('dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supplierApi.search).mockResolvedValue({
    items: [ahmad],
    page: 1,
    pageSize: 25,
    totalItems: 1,
    totalPages: 1,
  });
  vi.mocked(supplierApi.recordPayment).mockResolvedValue({ supplierId: 7, paymentId: 40, payableBalance: 85_000 });
  vi.mocked(shopAccountApi.list).mockResolvedValue([
    { id: 10, name: 'HBL Current', accountType: 'Bank', accountNumber: '8989', accountTitle: null, isActive: true },
    { id: 11, name: 'JazzCash Shop', accountType: 'JazzCash', accountNumber: null, accountTitle: null, isActive: true },
  ]);
});

describe('paying a supplier', () => {
  it('asks how the money was paid, with nothing chosen in advance', async () => {
    const dialog = await openPay();

    // Defaulting to Cash is exactly what put every bank transfer into the drawer count.
    expect(within(dialog).getByLabelText(/paid by/i)).toHaveValue('');
  });

  it('offers only the real ways to pay — never credit or part payment', async () => {
    const dialog = await openPay();

    const options = within(within(dialog).getByLabelText(/paid by/i))
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(options).toEqual(
      expect.arrayContaining(['Cash', 'Bank transfer', 'JazzCash', 'EasyPaisa', 'Raast']),
    );
    expect(options.join(' ')).not.toMatch(/credit|part/i);
  });

  it('will not record a payment until it says how it was made', async () => {
    const dialog = await openPay();

    await userEvent.type(within(dialog).getByLabelText(/amount/i), '5000');
    await userEvent.click(within(dialog).getByRole('button', { name: /record payment/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/how/i);
    expect(supplierApi.recordPayment).not.toHaveBeenCalled();
  });

  it('records the method and the reference that were given', async () => {
    const dialog = await openPay();

    await userEvent.clear(within(dialog).getByLabelText(/amount/i));
    await userEvent.type(within(dialog).getByLabelText(/amount/i), '5000');
    await userEvent.selectOptions(within(dialog).getByLabelText(/paid by/i), 'BankTransfer');
    await userEvent.type(within(dialog).getByLabelText(/reference/i), 'TXN 4471');
    await userEvent.click(within(dialog).getByRole('button', { name: /record payment/i }));

    await waitFor(() =>
      expect(supplierApi.recordPayment).toHaveBeenCalledWith(7, 5000, 'BankTransfer', 'TXN 4471', false, null),
    );
  });

  it('asks which shop account paid, offering only those that could have carried it', async () => {
    const dialog = await openPay();

    // Cash left the drawer and no account.
    await userEvent.selectOptions(within(dialog).getByLabelText(/paid by/i), 'Cash');
    expect(within(dialog).queryByLabelText(/from account/i)).not.toBeInTheDocument();

    await userEvent.selectOptions(within(dialog).getByLabelText(/paid by/i), 'BankTransfer');
    const offered = await within(dialog).findByLabelText(/from account/i);

    expect(within(offered).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Not recorded', 'HBL Current · 8989']);
  });

  it('records the account that paid', async () => {
    const dialog = await openPay();

    await userEvent.clear(within(dialog).getByLabelText(/amount/i));
    await userEvent.type(within(dialog).getByLabelText(/amount/i), '5000');
    await userEvent.selectOptions(within(dialog).getByLabelText(/paid by/i), 'JazzCash');
    await userEvent.selectOptions(await within(dialog).findByLabelText(/from account/i), '11');
    await userEvent.click(within(dialog).getByRole('button', { name: /record payment/i }));

    await waitFor(() =>
      expect(supplierApi.recordPayment).toHaveBeenCalledWith(7, 5000, 'JazzCash', null, false, 11),
    );
  });
});

describe('a supplier’s account', () => {
  it('opens the ledger for that supplier from their row', async () => {
    renderPage();

    const row = (await screen.findByText('Ahmad Abbasi')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Ledger' }));

    expect(await screen.findByTestId('location')).toHaveTextContent('/supplier-ledger?supplierId=7');
  });
});

describe('paying a supplier — the screenshot, as the payment is recorded', () => {
  it('records the payment, then attaches the screenshot to it', async () => {
    // Spied on the real object, which the page and the shared save-then-attach helper both use.
    vi.spyOn(proofApi, 'attach').mockResolvedValue(undefined);
    const dialog = await openPay();

    await userEvent.clear(within(dialog).getByLabelText(/amount/i));
    await userEvent.type(within(dialog).getByLabelText(/amount/i), '5000');
    await userEvent.selectOptions(within(dialog).getByLabelText(/paid by/i), 'JazzCash');
    const shot = new File(['jpeg'], 'transfer.jpg', { type: 'image/jpeg' });
    await userEvent.upload(within(dialog).getByLabelText(/screenshot/i), shot);
    await userEvent.click(within(dialog).getByRole('button', { name: /record payment/i }));

    await waitFor(() => expect(proofApi.attach).toHaveBeenCalledWith('supplier-payment', 40, shot));
    expect(await screen.findByRole('status')).toHaveTextContent(/screenshot attached/i);
  });

  it('never asks for one when the supplier was paid in cash', async () => {
    const dialog = await openPay();

    await userEvent.selectOptions(within(dialog).getByLabelText(/paid by/i), 'Cash');

    expect(within(dialog).queryByLabelText(/screenshot/i)).not.toBeInTheDocument();
  });
});
