import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { InvoicesPage } from '@/features/invoices/InvoicesPage';
import { invoiceApi, type InvoiceListRow } from '@/features/invoices/invoiceApi';

import { AuthProvider } from '@/features/auth/AuthContext';
import type { AuthUser } from '@/types/api';

/**
 * Finding a past bill.
 *
 * <p>The customer ledger already covers a customer's own sales. This screen exists for the sale
 * that belongs to nobody — a walk-in, which is most counter sales. Those appear in no ledger, so
 * without this they are unreachable the moment the counter resets.</p>
 */

vi.mock('@/features/invoices/invoiceApi', () => ({
  invoiceApi: { search: vi.fn() },
}));

vi.mock('@/features/documents/documentApi', () => ({
  documentApi: { invoicePdf: vi.fn(), createShareLink: vi.fn() },
}));

const staff: AuthUser = { id: 2, username: 'salesman', fullName: 'Salesman', role: 'Staff' };

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 25,
  totalItems: items.length,
  totalPages: 1,
});

const withCustomer: InvoiceListRow = {
  id: 1,
  invoiceNumber: 'INV-2026-000001',
  invoiceDateUtc: '2026-09-20T09:15:00Z',
  customerId: 5,
  customerName: 'Bilal Traders',
  saleType: 'Retail',
  total: 2200,
  amountPaid: 2200,
  amountRemaining: 0,
  netAmount: 2200,
  paymentMethod: 'Cash',
};

const walkIn: InvoiceListRow = {
  ...withCustomer,
  id: 2,
  invoiceNumber: 'INV-2026-000002',
  customerId: null,
  customerName: null,
  total: 600,
  amountPaid: 600,
  netAmount: 600,
};

function renderPage(user: AuthUser = staff) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <MemoryRouter>
      <AuthProvider initialUser={user}>
        <QueryClientProvider client={client}>
          <InvoicesPage />
        </QueryClientProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoiceApi.search).mockResolvedValue(page([withCustomer, walkIn]));
});

describe('InvoicesPage', () => {
  it('lists past sales with their number, date and total', async () => {
    renderPage();

    const row = (await screen.findByText('INV-2026-000001')).closest('tr')!;

    expect(within(row).getByText(/Rs 2,200\.00/)).toBeInTheDocument();
    expect(row).toHaveTextContent(/2026/);
  });

  it('names the customer a sale was made to', async () => {
    renderPage();

    expect(await screen.findByText('Bilal Traders')).toBeInTheDocument();
  });

  it('words a sale that belongs to nobody as a walk-in', async () => {
    renderPage();

    // The server sends null; how to say it is this screen's choice.
    const row = (await screen.findByText('INV-2026-000002')).closest('tr')!;

    expect(within(row).getByText(/walk-in/i)).toBeInTheDocument();
  });

  it('keeps a row to one action, not a wall of controls', async () => {
    renderPage();

    const row = (await screen.findByText('INV-2026-000002')).closest('tr')!;

    // Four buttons, a hint, a number field and a links panel PER ROW turned this table into a
    // wall — and an error from one row pushed every other row around.
    expect(within(row).getByRole('button', { name: /give to customer/i })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /print/i })).not.toBeInTheDocument();
    expect(within(row).queryByLabelText(/mobile number/i)).not.toBeInTheDocument();
  });

  it('opens the ways of handing a bill over in a dialog', async () => {
    const user = userEvent.setup();
    renderPage();

    const row = (await screen.findByText('INV-2026-000002')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /give to customer/i }));

    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('button', { name: /print/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /whatsapp/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /sms/i })).toBeInTheDocument();
  });

  it('names the sale being handed over, so the wrong row cannot be shared by accident', async () => {
    const user = userEvent.setup();
    renderPage();

    const row = (await screen.findByText('INV-2026-000002')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /give to customer/i }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('INV-2026-000002');
  });

  it('asks a walk-in for a number inside the dialog, having none on file', async () => {
    const user = userEvent.setup();
    renderPage();

    const row = (await screen.findByText('INV-2026-000002')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /give to customer/i }));

    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText(/mobile number/i)).toBeInTheDocument();
  });

  it('closes again without doing anything', async () => {
    const user = userEvent.setup();
    renderPage();

    const row = (await screen.findByText('INV-2026-000001')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /give to customer/i }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /close/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows what a sale is worth today, not what it was billed at', async () => {
    // An invoice reduced by a later return is worth less now, and the bill must say so.
    vi.mocked(invoiceApi.search).mockResolvedValue(
      page([{ ...withCustomer, total: 2200, netAmount: 1100 }]),
    );

    renderPage();

    const row = (await screen.findByText('INV-2026-000001')).closest('tr')!;

    expect(within(row).getByText(/Rs 1,100\.00/)).toBeInTheDocument();
  });
});

describe('InvoicesPage filters', () => {
  it('narrows by date range', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('INV-2026-000001');

    // Exact labels: /to/i also matches every "Give to customer" button in the table.
    await user.type(screen.getByLabelText('From'), '2026-09-01');
    await user.type(screen.getByLabelText('To'), '2026-09-30');

    await waitFor(() =>
      expect(invoiceApi.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-09-01', to: '2026-09-30' }),
      ),
    );
  });

  it('says so when nothing matches rather than showing an empty table', async () => {
    vi.mocked(invoiceApi.search).mockResolvedValue(page([]));

    renderPage();

    expect(await screen.findByText(/no sales/i)).toBeInTheDocument();
  });
});
