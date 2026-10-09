import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerReturnsPanel } from '@/features/customers/CustomerReturnsPanel';
import { returnApi } from '@/features/returns/returnApi';

vi.mock('@/features/returns/returnApi', () => ({ returnApi: { listSaleReturns: vi.fn() } }));

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 50, totalItems: items.length, totalPages: 1 });

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerReturnsPanel customerId={7} />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('CustomerReturnsPanel', () => {
  it('asks for this customer only, and shows a cash refund the ledger has no line for', async () => {
    vi.mocked(returnApi.listSaleReturns).mockResolvedValue(
      page([
        {
          returnId: 1, returnNumber: 'SRT-1', returnDateUtc: new Date().toISOString(), invoiceId: 3,
          invoiceNumber: 'INV-3', productName: 'Type-C Cable', quantity: 1, billedTotal: 500,
          discountTotal: 0, lineTotal: 500, refundDue: 500, refundMethod: 'Cash',
          hasRefundProof: false, reason: 'Wrong item',
        },
      ]),
    );

    renderPanel();

    const row = (await screen.findByText('Type-C Cable')).closest('tr')!;

    expect(returnApi.listSaleReturns).toHaveBeenCalledWith({ customerId: 7 });
    expect(within(row).getByText(/Rs\s?500\.00 \(Cash\)/)).toBeInTheDocument();
    expect(within(row).getByText('Wrong item')).toBeInTheDocument();
  });

  it('shows nothing at all when the customer has returned nothing', async () => {
    vi.mocked(returnApi.listSaleReturns).mockResolvedValue(page([]));

    renderPanel();

    await vi.waitFor(() => expect(returnApi.listSaleReturns).toHaveBeenCalled());
    expect(screen.queryByTestId('customer-returns')).not.toBeInTheDocument();
  });
});
