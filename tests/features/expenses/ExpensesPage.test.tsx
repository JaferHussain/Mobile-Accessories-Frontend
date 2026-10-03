import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExpensesPage } from '@/features/expenses/ExpensesPage';
import { expenseApi } from '@/features/expenses/expenseApi';
import { proofApi } from '@/features/proofs/proofApi';
import { shopAccountApi } from '@/features/shopAccounts/shopAccountApi';

vi.mock('@/features/expenses/expenseApi', () => ({
  expenseApi: {
    categories: vi.fn(),
    addCategory: vi.fn(),
    renameCategory: vi.fn(),
    hideCategory: vi.fn(),
    showCategory: vi.fn(),
    search: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@/features/proofs/proofApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/proofs/proofApi')>();
  return { ...actual, proofApi: { ...actual.proofApi, attach: vi.fn(), view: vi.fn(), missing: vi.fn() } };
});

vi.mock('@/features/shopAccounts/shopAccountApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/shopAccounts/shopAccountApi')>();
  return { ...actual, shopAccountApi: { ...actual.shopAccountApi, list: vi.fn() } };
});

/**
 * The Expenses screen: the owner's own categories, and an expense saved with its account,
 * reference and screenshot in one go.
 */

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ExpensesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(expenseApi.categories).mockImplementation(async (includeInactive?: boolean) =>
    includeInactive
      ? [
          { id: 1, name: 'Rent', isActive: true },
          { id: 2, name: 'Old category', isActive: false },
        ]
      : [{ id: 1, name: 'Rent', isActive: true }],
  );
  vi.mocked(expenseApi.search).mockResolvedValue({ items: [], page: 1, pageSize: 50, totalItems: 0, totalPages: 1 });
  vi.mocked(expenseApi.create).mockResolvedValue({ id: 99 });
  vi.mocked(expenseApi.addCategory).mockResolvedValue({ id: 3 });
  vi.mocked(expenseApi.hideCategory).mockResolvedValue(undefined);
  vi.mocked(expenseApi.showCategory).mockResolvedValue(undefined);
  vi.mocked(expenseApi.renameCategory).mockResolvedValue(undefined);
  vi.mocked(shopAccountApi.list).mockResolvedValue([]);
  vi.mocked(proofApi.attach).mockResolvedValue(undefined);
});

async function fillTransfer() {
  fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '2500' } });
  await userEvent.selectOptions(screen.getByLabelText(/paid by/i), 'JazzCash');
  await userEvent.upload(screen.getByLabelText(/proof/i), new File(['png'], 't.png', { type: 'image/png' }));
  await userEvent.click(screen.getByRole('button', { name: /save expense/i }));
}

describe('saving an expense with its proof', () => {
  it('saves the expense, then attaches the screenshot to it', async () => {
    renderPage();
    await fillTransfer();

    await waitFor(() => expect(proofApi.attach).toHaveBeenCalledWith('expense', 99, expect.any(File)));
    expect(await screen.findByRole('status')).toHaveTextContent('Expense saved.');
  });

  it('keeps the expense when only the screenshot fails, and says so', async () => {
    vi.mocked(proofApi.attach).mockRejectedValue(new Error('offline'));
    renderPage();
    await fillTransfer();

    expect(await screen.findByRole('status')).toHaveTextContent(/proof could not be attached/i);
  });
});

describe('managing expense categories', () => {
  async function openPanel() {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /manage categories/i }));
    return screen.findByRole('dialog', { name: /expense categories/i });
  }

  it('lists every category, hidden ones marked', async () => {
    const panel = await openPanel();

    expect(await within(panel).findByText('Rent')).toBeInTheDocument();
    expect(within(panel).getByText(/hidden/i)).toBeInTheDocument();
  });

  it('adds a category', async () => {
    const panel = await openPanel();

    await userEvent.type(within(panel).getByLabelText(/new category/i), 'Tea & guests');
    await userEvent.click(within(panel).getByRole('button', { name: /add category/i }));

    await waitFor(() => expect(expenseApi.addCategory).toHaveBeenCalledWith('Tea & guests'));
  });

  it('renames, hides and brings back a category — never deletes one', async () => {
    const panel = await openPanel();

    const rent = (await within(panel).findByText('Rent')).closest('li')!;
    await userEvent.click(within(rent).getByRole('button', { name: /rename/i }));
    const box = within(panel).getByLabelText(/new name for rent/i);
    await userEvent.clear(box);
    await userEvent.type(box, 'Shop rent');
    await userEvent.click(within(panel).getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(expenseApi.renameCategory).toHaveBeenCalledWith(1, 'Shop rent'));

    const rentAgain = (await within(panel).findByText('Rent')).closest('li')!;
    await userEvent.click(within(rentAgain).getByRole('button', { name: /hide/i }));
    await waitFor(() => expect(expenseApi.hideCategory).toHaveBeenCalledWith(1));

    const old = within(panel).getByText('Old category').closest('li')!;
    await userEvent.click(within(old).getByRole('button', { name: /bring back/i }));
    await waitFor(() => expect(expenseApi.showCategory).toHaveBeenCalledWith(2));
  });
});
