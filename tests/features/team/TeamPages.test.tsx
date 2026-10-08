import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TeamPage } from '@/features/team/TeamPage';
import { TeamMemberPage } from '@/features/team/TeamMemberPage';
import { teamApi, type TeamActivity, type TeamMember, type WatchItem } from '@/features/team/teamApi';

vi.mock('@/features/team/teamApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/team/teamApi')>()),
  teamApi: { members: vi.fn(), activity: vi.fn(), watchList: vi.fn() },
}));

/**
 * The owner's view of the team — a card per person, what each did, and what is worth a look.
 * Every figure is the server's; the screens only lay them out and word them.
 */

const ali: TeamMember = {
  userId: 7,
  fullName: 'Ali',
  role: 'Staff',
  job: 'FieldSales',
  invoiceCount: 23,
  totalSales: 48_500,
  receivedAtSale: 31_000,
  creditGiven: 17_500,
  discountGiven: 1_250,
  returnCount: 2,
  returnValue: 1_800,
  udhaarCollected: 5_000,
  lastLoginUtc: '2026-09-30T11:00:00Z',
  cashInHand: 3_000,
  stockUnits: 12,
};

const bilal: TeamMember = {
  ...ali,
  userId: 8,
  fullName: 'Bilal',
  job: 'Counter',
  invoiceCount: 0,
  totalSales: 0,
  lastLoginUtc: null,
};

const watch: WatchItem[] = [
  {
    kind: 'BigDiscount',
    referenceId: 231,
    reference: 'INV-2026-000231',
    entryDateUtc: '2026-09-30T14:00:00Z',
    userId: 7,
    userName: 'Ali',
    amount: 150,
    detail: '15% off — Rs 150 of Rs 1,000',
  },
];

const activity: TeamActivity[] = [
  {
    kind: 'Sale',
    referenceId: 231,
    reference: 'INV-2026-000231',
    entryDateUtc: '2026-09-30T14:42:00Z',
    amount: 2_400,
    method: 'JazzCash',
    detail: 'Asif',
  },
  {
    kind: 'SignIn',
    referenceId: 5,
    reference: '10.0.0.2',
    entryDateUtc: '2026-09-30T11:00:00Z',
    amount: null,
    method: null,
    detail: 'Mozilla/5.0 (Android)',
  },
];

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/team" element={<TeamPage />} />
          <Route path="/team/:userId" element={<TeamMemberPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(teamApi.members).mockResolvedValue([ali, bilal]);
  vi.mocked(teamApi.watchList).mockResolvedValue(watch);
  vi.mocked(teamApi.activity).mockResolvedValue(activity);
});

describe('Team overview', () => {
  it('shows a card per person with their job and day', async () => {
    renderAt('/team');

    const card = (await screen.findByRole('heading', { name: 'Ali' })).closest('article')!;

    expect(within(card).getByText(/field sales/i)).toBeInTheDocument();
    expect(within(card).getByTestId('total-sales')).toHaveTextContent('48,500');
    expect(within(card).getByTestId('bills')).toHaveTextContent('23');
    expect(within(card).getByTestId('discount')).toHaveTextContent('1,250');
    expect(within(card).getByTestId('udhaar-collected')).toHaveTextContent('5,000');

    const quiet = screen.getByRole('heading', { name: 'Bilal' }).closest('article')!;
    expect(within(quiet).getByText(/counter/i)).toBeInTheDocument();
    expect(within(quiet).getByText(/not signed in yet/i)).toBeInTheDocument();
  });

  it('lists what is worth a look, in words', async () => {
    renderAt('/team');

    const flag = (await screen.findByText('INV-2026-000231')).closest('tr')!;
    expect(within(flag).getByText('Big discount')).toBeInTheDocument();
    expect(within(flag).getByText('Ali')).toBeInTheDocument();
    expect(within(flag).getByText('15% off — Rs 150 of Rs 1,000')).toBeInTheDocument();
  });

  it('asks the server for the period chosen', async () => {
    renderAt('/team');
    await screen.findByRole('heading', { name: 'Ali' });

    await userEvent.type(screen.getByLabelText(/from/i), '2026-09-01');
    await userEvent.type(screen.getByLabelText(/^to$/i), '2026-09-30');

    await waitFor(() => expect(teamApi.members).toHaveBeenLastCalledWith('2026-09-01', '2026-09-30'));
    expect(teamApi.watchList).toHaveBeenLastCalledWith('2026-09-01', '2026-09-30');
  });

  it('offers the salesman’s commission from his card, and none from the counter’s', async () => {
    renderAt('/team');

    const salesman = (await screen.findByRole('heading', { name: 'Ali' })).closest('article')!;
    expect(within(salesman).getByRole('link', { name: /commission/i })).toHaveAttribute('href', '/commissions/7');

    const counter = screen.getByRole('heading', { name: 'Bilal' }).closest('article')!;
    expect(within(counter).queryByRole('link', { name: /commission/i })).not.toBeInTheDocument();
  });

  it('shows the cash the salesman is holding, and opens it — none on the counter’s card', async () => {
    renderAt('/team');

    const salesman = (await screen.findByRole('heading', { name: 'Ali' })).closest('article')!;
    expect(within(salesman).getByTestId('cash-in-hand')).toHaveTextContent('Rs 3,000.00');
    expect(within(salesman).getByRole('link', { name: /^cash/i })).toHaveAttribute('href', '/salesman-cash/7');

    const counter = screen.getByRole('heading', { name: 'Bilal' }).closest('article')!;
    expect(within(counter).queryByTestId('cash-in-hand')).not.toBeInTheDocument();
    expect(within(counter).queryByRole('link', { name: /^cash/i })).not.toBeInTheDocument();
  });

  it('shows the stock the salesman is carrying, and opens it — none on the counter’s card', async () => {
    renderAt('/team');

    const salesman = (await screen.findByRole('heading', { name: 'Ali' })).closest('article')!;
    expect(within(salesman).getByTestId('stock-units')).toHaveTextContent('12 units');
    expect(within(salesman).getByRole('link', { name: /^stock/i })).toHaveAttribute('href', '/salesman-stock/7');

    const counter = screen.getByRole('heading', { name: 'Bilal' }).closest('article')!;
    expect(within(counter).queryByRole('link', { name: /^stock/i })).not.toBeInTheDocument();
  });

  it('opens a person’s activity from their card', async () => {
    renderAt('/team');

    const card = (await screen.findByRole('heading', { name: 'Ali' })).closest('article')!;
    await userEvent.click(within(card).getByRole('link', { name: /activity/i }));

    expect(await screen.findByRole('heading', { name: /ali — activity/i })).toBeInTheDocument();
  });
});

describe('One person’s activity', () => {
  it('lists what they did, newest first, in words', async () => {
    renderAt('/team/7');

    expect(await screen.findByRole('heading', { name: /ali — activity/i })).toBeInTheDocument();

    const sale = (await screen.findByText('INV-2026-000231')).closest('li')!;
    expect(within(sale).getByText('Sale')).toBeInTheDocument();
    expect(within(sale).getByText(/2,400/)).toBeInTheDocument();
    expect(within(sale).getByText(/JazzCash · Asif/)).toBeInTheDocument();

    expect(screen.getByText('Signed in')).toBeInTheDocument();
    expect(teamApi.activity).toHaveBeenCalledWith(7, undefined, undefined);
  });

  it('says so when they did nothing in the period', async () => {
    vi.mocked(teamApi.activity).mockResolvedValue([]);
    renderAt('/team/7');

    expect(await screen.findByText(/nothing recorded/i)).toBeInTheDocument();
  });
});
