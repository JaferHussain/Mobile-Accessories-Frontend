import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SalesmanCashPage } from '@/features/salesmanCash/SalesmanCashPage';
import { salesmanCashApi, type SalesmanCashStatement } from '@/features/salesmanCash/salesmanCashApi';

vi.mock('@/features/salesmanCash/salesmanCashApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/salesmanCash/salesmanCashApi')>()),
  salesmanCashApi: { statement: vi.fn(), mine: vi.fn(), receive: vi.fn() },
}));

/**
 * The cash a field salesman is carrying from the market, and the owner's "Received from
 * salesman". Every figure is the server's — collected, refunded, handed over, in hand.
 */

const statement: SalesmanCashStatement = {
  userId: 7,
  fullName: 'Ali',
  job: 'FieldSales',
  collected: 5000,
  refunded: 200,
  handedOver: 1800,
  inHand: 3000,
  movements: [
    { kind: 'Sale', referenceId: 1, reference: 'INV-2026-000401', entryDateUtc: '2026-09-30T06:00:00Z', amount: 3000, method: 'Cash', detail: 'Rehman Mobiles', effect: 3000 },
    { kind: 'Recovery', referenceId: 2, reference: 'RCP-2026-000050', entryDateUtc: '2026-09-30T07:00:00Z', amount: 2000, method: 'Cash', detail: 'City Phones', effect: 2000 },
    { kind: 'Refund', referenceId: 3, reference: 'RET-2026-000010', entryDateUtc: '2026-09-30T08:00:00Z', amount: 200, method: 'Cash', detail: null, effect: -200 },
    { kind: 'Handover', referenceId: 4, reference: null, entryDateUtc: '2026-09-30T09:00:00Z', amount: 1800, method: 'Cash', detail: 'Moiz', effect: -1800 },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/salesman-cash/7']}>
        <Routes>
          <Route path="/salesman-cash/:userId" element={<SalesmanCashPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(salesmanCashApi.statement).mockResolvedValue(statement);
});

describe('the salesman’s cash', () => {
  it('shows what he collected, gave back, handed over and holds now', async () => {
    renderPage();

    expect(await screen.findByTestId('in-hand')).toHaveTextContent('3,000');
    expect(screen.getByTestId('collected')).toHaveTextContent('5,000');
    expect(screen.getByTestId('refunded')).toHaveTextContent('200');
    expect(screen.getByTestId('handed-over')).toHaveTextContent('1,800');
  });

  it('lists every movement of his cash', async () => {
    renderPage();

    const table = await screen.findByRole('table', { name: /cash movements/i });
    expect(within(table).getByText('INV-2026-000401')).toBeInTheDocument();
    expect(within(table).getByText(/udhaar recovered/i)).toBeInTheDocument();
    expect(within(table).getByText(/handed over/i)).toBeInTheDocument();
  });

  it('records money received from him — starting at what he holds, asking how it came', async () => {
    const user = userEvent.setup();
    vi.mocked(salesmanCashApi.receive).mockResolvedValue({ ...statement, handedOver: 4800, inHand: 0 });

    renderPage();

    const amount = await screen.findByLabelText(/amount/i);
    expect(amount).toHaveValue(3000);

    // How it came starts unanswered: cash joins the drawer, a transfer does not.
    await user.click(screen.getByRole('button', { name: /received from salesman/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/how he handed it over/i);
    expect(salesmanCashApi.receive).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText(/received as/i), 'Cash');
    await user.click(screen.getByRole('button', { name: /received from salesman/i }));

    await waitFor(() => expect(salesmanCashApi.receive).toHaveBeenCalledWith(7, 3000, 'Cash', null));
  });

  it('shows the server’s refusal when more is entered than he holds', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('@/types/api');
    vi.mocked(salesmanCashApi.receive).mockRejectedValue(
      new ApiError('BUSINESS_RULE_VIOLATION', 'Ali holds Rs 3,000.00 — you cannot receive more than that.', 422),
    );

    renderPage();

    const amount = await screen.findByLabelText(/amount/i);
    await user.clear(amount);
    await user.type(amount, '5000');
    await user.selectOptions(screen.getByLabelText(/received as/i), 'Cash');
    await user.click(screen.getByRole('button', { name: /received from salesman/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot receive more/i);
  });
});
