import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProofMissingPage } from '@/features/proofs/ProofMissingPage';
import { proofApi, type MissingProof } from '@/features/proofs/proofApi';

vi.mock('@/features/proofs/proofApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/proofs/proofApi')>();

  return { ...actual, proofApi: { ...actual.proofApi, missing: vi.fn(), attach: vi.fn(), view: vi.fn() } };
});

/**
 * The owner's daily list: every non-cash transaction still without its proof.
 *
 * <p>Proofs are optional when a transaction is saved, so the counter never waits on a screenshot.
 * This list is what makes "every transaction is provable" true anyway — each line can be proved
 * from right here, and leaves the list once it is.</p>
 */

const rows: MissingProof[] = [
  {
    kind: 'CustomerPayment',
    referenceId: 12,
    reference: 'RCP-2026-000012',
    entryDateUtc: '2026-09-29T07:00:00Z',
    party: 'Asif',
    method: 'JazzCash',
    amount: 5_000,
  },
  {
    kind: 'Expense',
    referenceId: 4,
    reference: 'Rent',
    entryDateUtc: '2026-09-28T07:00:00Z',
    party: null,
    method: 'BankTransfer',
    amount: 25_000,
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ProofMissingPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(proofApi.missing).mockResolvedValue(rows);
  vi.mocked(proofApi.attach).mockResolvedValue(undefined);
});

describe('Proof missing', () => {
  it('lists each transaction still owed a proof, in words', async () => {
    renderPage();

    const recovery = (await screen.findByText('RCP-2026-000012')).closest('tr')!;
    expect(within(recovery).getByText('Udhaar recovery')).toBeInTheDocument();
    expect(within(recovery).getByText('Asif')).toBeInTheDocument();
    expect(within(recovery).getByText('JazzCash')).toBeInTheDocument();
    expect(within(recovery).getByText(/5,000/)).toBeInTheDocument();

    const expense = screen.getByText('Rent').closest('tr')!;
    expect(within(expense).getByText('Expense')).toBeInTheDocument();
    expect(within(expense).getByText('Bank transfer')).toBeInTheDocument();
  });

  it('attaches a proof from the list, to the right transaction, and refreshes it', async () => {
    renderPage();

    const recovery = (await screen.findByText('RCP-2026-000012')).closest('tr')!;
    await userEvent.upload(
      within(recovery).getByLabelText(/attach proof/i),
      new File(['png'], 'proof.png', { type: 'image/png' }),
    );

    await waitFor(() =>
      expect(proofApi.attach).toHaveBeenCalledWith('customer-payment', 12, expect.any(File)),
    );
    await waitFor(() => expect(proofApi.missing).toHaveBeenCalledTimes(2));
  });

  it('says so when every transaction is proved', async () => {
    vi.mocked(proofApi.missing).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/every non-cash transaction has its proof/i)).toBeInTheDocument();
  });
});
