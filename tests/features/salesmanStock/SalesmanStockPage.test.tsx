import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SalesmanStockPage } from '@/features/salesmanStock/SalesmanStockPage';
import { salesmanStockApi, type SalesmanStockStatement } from '@/features/salesmanStock/salesmanStockApi';
import { productApi, type Product } from '@/features/products/productApi';

vi.mock('@/features/salesmanStock/salesmanStockApi', () => ({
  salesmanStockApi: { statement: vi.fn(), mine: vi.fn(), issue: vi.fn(), returnToShop: vi.fn() },
}));
vi.mock('@/features/products/productApi', () => ({ productApi: { search: vi.fn() } }));

/**
 * The stock a field salesman carries. The owner issues goods to him and takes them back; every
 * unit in and out of his bag is listed. Every figure is the server's.
 */

const statement: SalesmanStockStatement = {
  userId: 7,
  fullName: 'Ali',
  job: 'FieldSales',
  totalUnits: 5,
  items: [
    { productId: 11, productName: 'Oppo Charger', quantity: 3 },
    { productId: 12, productName: 'Type-C Cable', quantity: 2 },
  ],
  movements: [
    {
      id: 1,
      productId: 11,
      productName: 'Oppo Charger',
      reason: 'Issued',
      changeQty: 4,
      resultingQty: 4,
      referenceId: null,
      reference: null,
      note: 'Morning round',
      recordedBy: 'Moiz',
      createdAtUtc: '2026-09-30T04:00:00Z',
    },
    {
      id: 2,
      productId: 11,
      productName: 'Oppo Charger',
      reason: 'Sold',
      changeQty: -1,
      resultingQty: 3,
      referenceId: 55,
      reference: 'INV-2026-000601',
      note: null,
      recordedBy: 'Ali',
      createdAtUtc: '2026-09-30T06:00:00Z',
    },
  ],
};

const handsfree = { id: 13, name: 'Handsfree', quantityOnHand: 20, salePrice: 300 } as Product;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/salesman-stock/7']}>
        <Routes>
          <Route path="/salesman-stock/:userId" element={<SalesmanStockPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(salesmanStockApi.statement).mockResolvedValue(statement);
  vi.mocked(productApi.search).mockResolvedValue({ items: [handsfree], page: 1, pageSize: 8, totalItems: 1, totalPages: 1 });
});

describe('the stock with a salesman', () => {
  it('shows what he is carrying', async () => {
    renderPage();

    expect(await screen.findByTestId('total-units')).toHaveTextContent('5');
    const table = screen.getByRole('table', { name: /stock with him/i });
    expect(within(table).getByText('Oppo Charger')).toBeInTheDocument();
    expect(within(table).getByText('Type-C Cable')).toBeInTheDocument();
  });

  it('lists every unit in and out of his bag, in words', async () => {
    renderPage();

    const table = await screen.findByRole('table', { name: /stock movements/i });
    expect(within(table).getByText(/issued/i)).toBeInTheDocument();
    expect(within(table).getByText('INV-2026-000601')).toBeInTheDocument();
  });

  it('issues goods to him: find a product, choose how many, issue', async () => {
    const user = userEvent.setup();
    vi.mocked(salesmanStockApi.issue).mockResolvedValue(statement);
    renderPage();

    await screen.findByTestId('total-units');
    await user.type(screen.getByLabelText(/find product/i), 'handsfree');
    await user.click(screen.getByRole('button', { name: /^find$/i }));
    await user.click(within(await screen.findByTestId('issue-result-13')).getByRole('button', { name: /add/i }));

    const quantity = screen.getByLabelText(/how many handsfree/i);
    await user.clear(quantity);
    await user.type(quantity, '5');
    await user.type(screen.getByLabelText(/^note$/i), 'Morning round');
    await user.click(screen.getByRole('button', { name: /issue to ali/i }));

    await waitFor(() =>
      expect(salesmanStockApi.issue).toHaveBeenCalledWith(7, [{ productId: 13, quantity: 5 }], 'Morning round'),
    );
  });

  it('takes back what he brings to the shop — only the lines given a quantity', async () => {
    const user = userEvent.setup();
    vi.mocked(salesmanStockApi.returnToShop).mockResolvedValue(statement);
    renderPage();

    await user.type(await screen.findByLabelText(/bring back oppo charger/i), '2');
    await user.click(screen.getByRole('button', { name: /take back into the shop/i }));

    await waitFor(() => expect(salesmanStockApi.returnToShop).toHaveBeenCalledWith(7, [{ productId: 11, quantity: 2 }], null));
  });

  it('shows the server’s refusal in words', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('@/types/api');
    vi.mocked(salesmanStockApi.returnToShop).mockRejectedValue(
      new ApiError('BUSINESS_RULE_VIOLATION', "He is carrying 3 of 'Oppo Charger' — 9 cannot come back.", 422),
    );
    renderPage();

    await user.type(await screen.findByLabelText(/bring back oppo charger/i), '9');
    await user.click(screen.getByRole('button', { name: /take back into the shop/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot come back/i);
  });
});
