import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PurchaseBillsList } from '@/features/purchases/PurchaseBillsList';
import { purchaseBillApi, type PurchaseBillDetail, type PurchaseBillSummary } from '@/features/purchases/purchaseBillApi';

vi.mock('@/features/purchases/purchaseBillApi', () => ({
  purchaseBillApi: { list: vi.fn(), get: vi.fn(), pay: vi.fn() },
}));
vi.mock('@/features/shopAccounts/shopAccountApi', () => ({
  shopAccountApi: { list: vi.fn().mockResolvedValue([]) },
  accountsFor: () => [],
  accountLabel: () => '',
}));

/**
 * "Details" on a recent bill opens it in a popup: who and when, the money at a glance with how much
 * is paid, then the items, payments and the bill's photo on tabs — and Pay from inside it.
 */

const summary: PurchaseBillSummary = {
  id: 41,
  supplierId: 3,
  supplierName: 'Al-Rehman Traders',
  billNumber: 'SUP-4471',
  billDate: '2026-10-02',
  total: 2000,
  paid: 500,
  returned: 0,
  due: 1500,
  status: 'PartPaid',
  itemCount: 2,
  hasBillImage: false,
  note: 'Second box arrives Friday',
  recordedBy: 'Shop Owner',
};

const detail: PurchaseBillDetail = {
  ...summary,
  lines: [
    { purchaseId: 1, productId: 10, productName: 'Oppo Charger 18W', quantity: 10, unitCost: 100, total: 1000, returnedQty: 2 },
    { purchaseId: 2, productId: 11, productName: 'Type-C Cable', quantity: 5, unitCost: 200, total: 1000, returnedQty: 0 },
  ],
  payments: [{ id: 7, amount: 500, paymentMethod: 'Cash', paidOn: '2026-10-03', note: 'Advance', hasProof: false }],
};

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <PurchaseBillsList />
    </QueryClientProvider>,
  );
}

async function openDetails() {
  const user = userEvent.setup();
  renderList();

  await user.click(await screen.findByRole('button', { name: 'Details' }));

  return { user, dialog: await screen.findByRole('dialog', { name: 'Al-Rehman Traders' }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(purchaseBillApi.list).mockResolvedValue([summary]);
  vi.mocked(purchaseBillApi.get).mockResolvedValue(detail);
});

describe('a bill opened from Recent bills', () => {
  it('opens in a popup with who, when and the money at a glance', async () => {
    const { dialog } = await openDetails();

    expect(within(dialog).getByText(/Bill SUP-4471 · 2 Oct 2026 · recorded by Shop Owner/)).toBeInTheDocument();
    expect(within(dialog).getByText('Part paid')).toBeInTheDocument();
    expect(within(dialog).getByTestId('bill-dialog-due')).toHaveTextContent(/1,500/);
    expect(within(dialog).getByRole('meter', { name: /share of the bill paid/i })).toHaveAttribute('aria-valuenow', '25');
    expect(within(dialog).getByText('Second box arrives Friday')).toBeInTheDocument();
  });

  it('shows the items first, with what was sent back, and the bill total', async () => {
    const { dialog } = await openDetails();

    expect(await within(dialog).findByText('Oppo Charger 18W')).toBeInTheDocument();
    expect(within(dialog).getByText('2 sent back')).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Items (2)' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to the payments, and to the bill photo', async () => {
    const { user, dialog } = await openDetails();

    await user.click(await within(dialog).findByRole('tab', { name: 'Payments (1)' }));
    expect(within(dialog).getByText(/3 Oct 2026 · Cash · Advance/)).toBeInTheDocument();
    expect(within(dialog).queryByText('Oppo Charger 18W')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: 'Bill photo' }));
    expect(within(dialog).getByText(/no photo of the supplier’s bill yet/i)).toBeInTheDocument();
  });

  it('closes with Escape, with the close button, and with a click outside', async () => {
    const { user } = await openDetails();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));
    await user.click(await screen.findByRole('button', { name: /close bill details/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(dialog.parentElement!);
    expect(screen.queryByRole('dialog', { name: 'Al-Rehman Traders' })).not.toBeInTheDocument();
  });

  it('pays what is owed from inside the popup', async () => {
    const { user, dialog } = await openDetails();

    await user.click(within(dialog).getByRole('button', { name: /pay rs\s?1,500/i }));

    expect(await screen.findByRole('dialog', { name: /pay al-rehman traders/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Al-Rehman Traders' })).not.toBeInTheDocument();
  });
});
