import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DayClosePage } from '@/features/dayclose/DayClosePage';
import { dayCloseApi, type DayClosing } from '@/features/dayclose/dayCloseApi';

/**
 * Counting the drawer.
 *
 * <p>The only control the shop has over physical cash. The screen's job is to make the
 * arithmetic impossible to argue with: every line except the counted amount comes from the
 * server, and the difference is stated plainly rather than buried.</p>
 */

vi.mock('@/features/dayclose/dayCloseApi', () => ({
  dayCloseApi: { preview: vi.fn(), close: vi.fn(), recent: vi.fn() },
}));

const openDay: DayClosing = {
  closingDate: '2026-09-23',
  openingFloat: 2000,
  cashSales: 18_400,
  cashRecovery: 3500,
  cashFromSalesmen: 0,
  cashRefunds: 590,
  cashPaidOut: 1200,
  cashToSuppliers: 4000,
  expectedCash: 18_110,
  countedCash: 0,
  difference: 0,
  note: null,
  closedByUserName: null,
  closedAtUtc: null,
  isClosed: false,
};

const closedDay: DayClosing = {
  ...openDay,
  countedCash: 17_910,
  difference: -200,
  note: 'Rs 200 to the delivery boy, not entered',
  closedByUserName: 'Shop Owner',
  closedAtUtc: '2026-09-23T15:30:00Z',
  isClosed: true,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <DayClosePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dayCloseApi.preview).mockResolvedValue(openDay);
  vi.mocked(dayCloseApi.recent).mockResolvedValue([]);
  vi.mocked(dayCloseApi.close).mockResolvedValue(closedDay);
});

describe('DayClosePage before counting', () => {
  it('shows every line the day put through the drawer', async () => {
    renderPage();

    expect(await screen.findByTestId('cash-sales')).toHaveTextContent('Rs 18,400.00');
    expect(screen.getByTestId('cash-recovery')).toHaveTextContent('Rs 3,500.00');
    expect(screen.getByTestId('cash-refunds')).toHaveTextContent('Rs 590.00');
    expect(screen.getByTestId('cash-paid-out')).toHaveTextContent('Rs 1,200.00');
    // Kept apart from expenses: a shopkeeper reading a short wants to know which one moved.
    expect(screen.getByTestId('cash-to-suppliers')).toHaveTextContent('Rs 4,000.00');
    expect(screen.getByTestId('expected-cash')).toHaveTextContent('Rs 18,110.00');
  });

  it('shows the cash a salesman handed over as money into the drawer', async () => {
    // His market cash is not in "Cash sales" — it joins the drawer only once he hands it over.
    vi.mocked(dayCloseApi.preview).mockResolvedValue({ ...openDay, cashFromSalesmen: 2500, expectedCash: 20_610 });

    renderPage();

    expect(await screen.findByTestId('cash-from-salesmen')).toHaveTextContent('Rs 2,500.00');
    expect(screen.getByTestId('expected-cash')).toHaveTextContent('Rs 20,610.00');
  });

  it('asks only for what the shopkeeper can actually know', async () => {
    renderPage();

    // Everything else is computed. A figure you can type over is a figure you can fudge.
    expect(await screen.findByLabelText(/counted/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/opening float/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/cash sales/i)).not.toBeInTheDocument();
  });

  it('works out the difference as the money is counted', async () => {
    const user = userEvent.setup();
    renderPage();

    const counted = await screen.findByLabelText(/counted/i);
    await user.clear(counted);
    await user.type(counted, '17910');

    expect(screen.getByTestId('difference')).toHaveTextContent('Rs 200.00');
    expect(screen.getByTestId('difference')).toHaveTextContent(/short/i);
  });

  it('says plainly when the drawer balances', async () => {
    const user = userEvent.setup();
    renderPage();

    const counted = await screen.findByLabelText(/counted/i);
    await user.clear(counted);
    await user.type(counted, '18110');

    expect(screen.getByTestId('difference')).toHaveTextContent(/balance/i);
  });

  it('flags a drawer holding more than the day accounts for', async () => {
    const user = userEvent.setup();
    renderPage();

    const counted = await screen.findByLabelText(/counted/i);
    await user.clear(counted);
    await user.type(counted, '18310');

    // Over is not good news: it usually means a sale went unrecorded.
    expect(screen.getByTestId('difference')).toHaveTextContent(/over/i);
  });

  it('re-reads the day when the opening float changes', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId('expected-cash');

    const float = screen.getByLabelText(/opening float/i);
    await user.clear(float);
    await user.type(float, '3000');

    await waitFor(() =>
      expect(dayCloseApi.preview).toHaveBeenLastCalledWith(expect.any(String), 3000),
    );
  });

  it('sends the counted amount and the note when the day is closed', async () => {
    const user = userEvent.setup();
    renderPage();

    const counted = await screen.findByLabelText(/counted/i);
    await user.clear(counted);
    await user.type(counted, '17910');
    await user.type(screen.getByLabelText(/note/i), 'delivery boy');
    await user.click(screen.getByRole('button', { name: /close the day/i }));

    await waitFor(() =>
      expect(dayCloseApi.close).toHaveBeenCalledWith(
        expect.objectContaining({ countedCash: 17_910, note: 'delivery boy' }),
      ),
    );
  });
});

describe('DayClosePage once the day is closed', () => {
  beforeEach(() => {
    vi.mocked(dayCloseApi.preview).mockResolvedValue(closedDay);
  });

  it('shows what was recorded, not a fresh sum', async () => {
    renderPage();

    expect(await screen.findByTestId('counted-cash')).toHaveTextContent('Rs 17,910.00');
    expect(screen.getByTestId('difference')).toHaveTextContent('Rs 200.00');
  });

  it('names who closed it, because a customer-facing control needs someone accountable', async () => {
    renderPage();

    expect(await screen.findByText(/shop owner/i)).toBeInTheDocument();
  });

  it('keeps the explanation that was given', async () => {
    renderPage();

    expect(await screen.findByText(/delivery boy/i)).toBeInTheDocument();
  });

  it('cannot be closed again', async () => {
    renderPage();

    await screen.findByTestId('counted-cash');

    // A day that could be closed twice would let a short be closed away and reopened.
    expect(screen.queryByRole('button', { name: /close the day/i })).not.toBeInTheDocument();
  });
});

describe('DayClosePage history', () => {
  it('lists recent closings so a pattern of small shorts shows', async () => {
    vi.mocked(dayCloseApi.recent).mockResolvedValue([
      { ...closedDay, closingDate: '2026-09-22', difference: -150 },
      { ...closedDay, closingDate: '2026-09-21', difference: -180 },
    ]);

    renderPage();

    const history = await screen.findByTestId('closing-history');

    // One short is an accident. Three is a pattern, and the pattern is the point.
    expect(within(history).getByText('2026-09-22')).toBeInTheDocument();
    expect(within(history).getByText('2026-09-21')).toBeInTheDocument();
  });
});
