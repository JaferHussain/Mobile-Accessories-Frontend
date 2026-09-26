import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { supplierApi, type Supplier } from '@/features/suppliers/supplierApi';

/**
 * Feature 007 — the details the shop used to keep on paper.
 *
 * Two things matter here beyond "the fields exist": a supplier the shop only knows by name must
 * still save, and a supplier recorded before this feature must be able to gain its details
 * later. Without the second, every existing supplier would be stuck with whatever it had.
 */

vi.mock('@/features/suppliers/supplierApi', () => ({
  supplierApi: {
    search: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    recordPayment: vi.fn(),
  },
}));

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 100,
  totalItems: items.length,
  totalPages: 1,
});

const bare: Supplier = {
  id: 1,
  name: 'Old Supplier',
  contactNumber: null,
  address: null,
  cnic: null,
  email: null,
  bankName: null,
  bankAccountNumber: null,
  notes: null,
  payableBalance: 0,
  isActive: true,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <SuppliersPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supplierApi.search).mockResolvedValue(page([bare]) as never);
  vi.mocked(supplierApi.create).mockResolvedValue(bare as never);
  vi.mocked(supplierApi.update).mockResolvedValue(bare as never);
});

describe('recording a supplier', () => {
  it('offers identification and payment details', async () => {
    renderPage();

    expect(await screen.findByLabelText(/cnic/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bank name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
  });

  it('sends every detail that was filled in', async () => {
    renderPage();

    await userEvent.type(await screen.findByLabelText(/supplier name/i), 'Al-Rehman Traders');
    await userEvent.type(screen.getByLabelText(/cnic/i), '36603-1234567-1');
    await userEvent.type(screen.getByLabelText(/bank name/i), 'Meezan Bank');
    await userEvent.type(screen.getByLabelText(/account number/i), 'PK36MEZN000123');

    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() =>
      expect(supplierApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Al-Rehman Traders',
          cnic: '36603-1234567-1',
          bankName: 'Meezan Bank',
          bankAccountNumber: 'PK36MEZN000123',
        }),
      ),
    );
  });

  it('still adds a supplier the shop only knows by name', async () => {
    renderPage();

    await userEvent.type(await screen.findByLabelText(/supplier name/i), 'Just A Name');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(supplierApi.create).toHaveBeenCalled());

    // Empty boxes must reach the server as "not recorded", never as empty strings pretending
    // to be answers.
    const sent = vi.mocked(supplierApi.create).mock.calls[0]![0];

    expect(sent.name).toBe('Just A Name');
    expect(sent.cnic ?? null).toBeNull();
    expect(sent.bankName ?? null).toBeNull();
  });
});

describe('filling a supplier in later', () => {
  it('can edit a supplier that was recorded with a name only', async () => {
    renderPage();

    const row = (await screen.findByText('Old Supplier')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /edit/i }));

    await userEvent.type(await screen.findByLabelText(/bank name/i), 'HBL');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(supplierApi.update).toHaveBeenCalledWith(
        bare.id,
        expect.objectContaining({ name: 'Old Supplier', bankName: 'HBL' }),
      ),
    );
  });

  it('shows the payment details where the owner pays from', async () => {
    vi.mocked(supplierApi.search).mockResolvedValue(
      page([{ ...bare, bankName: 'Meezan Bank', bankAccountNumber: 'PK36MEZN000123' }]) as never,
    );

    renderPage();

    const row = (await screen.findByText('Old Supplier')).closest('tr')!;

    expect(within(row).getByText(/Meezan Bank/)).toBeInTheDocument();
    expect(within(row).getByText(/PK36MEZN000123/)).toBeInTheDocument();
  });
});
