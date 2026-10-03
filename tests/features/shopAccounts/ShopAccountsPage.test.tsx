import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShopAccountsPage } from '@/features/shopAccounts/ShopAccountsPage';
import { shopAccountApi, type ShopAccount } from '@/features/shopAccounts/shopAccountApi';

vi.mock('@/features/shopAccounts/shopAccountApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/shopAccounts/shopAccountApi')>();

  return {
    ...actual,
    shopAccountApi: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      retire: vi.fn(),
      reactivate: vi.fn(),
    },
  };
});

/**
 * The shop's own accounts, registered once. After this, every non-cash expense or supplier
 * payment picks its account from a list instead of anyone typing a number again.
 */

const hbl: ShopAccount = {
  id: 1,
  name: 'HBL Current',
  accountType: 'Bank',
  accountNumber: '0123-4567-8989',
  accountTitle: 'Moiz Mobile & Corporation',
  isActive: true,
};

const oldJazz: ShopAccount = {
  id: 2,
  name: 'Old JazzCash',
  accountType: 'JazzCash',
  accountNumber: '0300 1111111',
  accountTitle: null,
  isActive: false,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ShopAccountsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(shopAccountApi.list).mockResolvedValue([hbl, oldJazz]);
  vi.mocked(shopAccountApi.create).mockResolvedValue({ ...hbl, id: 3 });
  vi.mocked(shopAccountApi.update).mockResolvedValue(hbl);
  vi.mocked(shopAccountApi.retire).mockResolvedValue(undefined);
  vi.mocked(shopAccountApi.reactivate).mockResolvedValue(oldJazz);
});

describe('Shop accounts', () => {
  it('lists every account with its kind and number, hidden ones marked', async () => {
    renderPage();

    const row = (await screen.findByText('HBL Current')).closest('tr')!;
    expect(within(row).getByText('Bank')).toBeInTheDocument();
    expect(within(row).getByText('0123-4567-8989')).toBeInTheDocument();

    const hidden = screen.getByText('Old JazzCash').closest('tr')!;
    expect(within(hidden).getByText(/hidden/i)).toBeInTheDocument();
    expect(shopAccountApi.list).toHaveBeenCalledWith(true);
  });

  it('adds an account', async () => {
    renderPage();
    await screen.findByText('HBL Current');

    await userEvent.type(screen.getByLabelText(/account name/i), 'JazzCash Shop');
    await userEvent.selectOptions(screen.getByLabelText(/^type$/i), 'JazzCash');
    await userEvent.type(screen.getByLabelText(/account number/i), '0300 7194095');
    await userEvent.click(screen.getByRole('button', { name: /add account/i }));

    await waitFor(() =>
      expect(shopAccountApi.create).toHaveBeenCalledWith({
        name: 'JazzCash Shop',
        accountType: 'JazzCash',
        accountNumber: '0300 7194095',
        accountTitle: null,
      }),
    );
  });

  it('asks what kind of account it is, with nothing chosen in advance', async () => {
    renderPage();
    await screen.findByText('HBL Current');

    await userEvent.type(screen.getByLabelText(/account name/i), 'Meezan');
    await userEvent.click(screen.getByRole('button', { name: /add account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/bank, jazzcash or easypaisa/i);
    expect(shopAccountApi.create).not.toHaveBeenCalled();
  });

  it('hides an account that is no longer used, and brings one back', async () => {
    renderPage();

    const row = (await screen.findByText('HBL Current')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /hide/i }));
    await waitFor(() => expect(shopAccountApi.retire).toHaveBeenCalledWith(1));

    const hidden = screen.getByText('Old JazzCash').closest('tr')!;
    await userEvent.click(within(hidden).getByRole('button', { name: /bring back/i }));
    await waitFor(() => expect(shopAccountApi.reactivate).toHaveBeenCalledWith(2));
  });

  it('edits an account in the same form', async () => {
    renderPage();

    const row = (await screen.findByText('HBL Current')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /edit/i }));

    expect(screen.getByLabelText(/account name/i)).toHaveValue('HBL Current');

    await userEvent.clear(screen.getByLabelText(/account number/i));
    await userEvent.type(screen.getByLabelText(/account number/i), '9989');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(shopAccountApi.update).toHaveBeenCalledWith(1, expect.objectContaining({ accountNumber: '9989' })),
    );
  });
});
