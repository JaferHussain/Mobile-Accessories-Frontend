import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReturnsPage } from '@/features/returns/ReturnsPage';
import { returnApi } from '@/features/returns/returnApi';
import { purchaseApi, supplierApi } from '@/features/suppliers/supplierApi';
import { AuthProvider } from '@/features/auth/AuthContext';
import type { AuthUser } from '@/types/api';

/**
 * The Returns module — the front door to two backend endpoints (sale-returns,
 * purchase-returns) that already existed but had nothing wired to them.
 *
 * Customer returns and supplier returns are kept as two tabs rather than one form: they look up
 * different things (an invoice vs. a purchase), have different shapes (several lines vs. one
 * product) and different authority (Staff may take a customer return; only the owner may return
 * to a supplier, because that route exposes cost and payables).
 */

vi.mock('@/features/returns/returnApi', () => ({
  returnApi: {
    getInvoice: vi.fn(),
    findReturnableLines: vi.fn(),
    recordSaleReturn: vi.fn(),
    recordPurchaseReturn: vi.fn(),
    listSaleReturns: vi.fn(),
    listPurchaseReturns: vi.fn(),
  },
}));

vi.mock('@/features/suppliers/supplierApi', () => ({
  purchaseApi: { search: vi.fn() },
  supplierApi: { search: vi.fn() },
}));

const admin: AuthUser = { id: 1, username: 'admin', fullName: 'Owner', role: 'Admin' };
const staff: AuthUser = { id: 2, username: 'salesman', fullName: 'Salesman', role: 'Staff' };

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 100,
  totalItems: items.length,
  totalPages: 1,
});

function renderPage(user: AuthUser = admin) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <AuthProvider initialUser={user}>
      <QueryClientProvider client={client}>
        <ReturnsPage />
      </QueryClientProvider>
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(returnApi.listSaleReturns).mockResolvedValue(page([]));
  vi.mocked(returnApi.listPurchaseReturns).mockResolvedValue(page([]));
  vi.mocked(supplierApi.search).mockResolvedValue(
    page([{ id: 3, name: 'Al-Rehman Traders', payableBalance: 0, isActive: true }]) as never,
  );
});

describe('customer returns', () => {
  it('finds a returnable sale by product name, invoice number, or mobile number in one box', async () => {
    vi.mocked(returnApi.findReturnableLines).mockResolvedValue([
      {
        invoiceId: 77,
        invoiceNumber: 'INV-0077',
        invoiceItemId: 1,
        productName: 'Type-C Cable',
        quantitySold: 2,
        quantityReturned: 0,
        quantityAvailable: 2,
        unitSalePrice: 1000,
        refundPerUnit: 1000,
        discountPerUnit: 0,
        maxRefund: 2000,
        amountRemaining: 0,
      },
    ]);

    renderPage();

    await userEvent.type(screen.getByLabelText(/search/i), '77');
    await userEvent.click(screen.getByRole('button', { name: /find/i }));

    expect(returnApi.findReturnableLines).toHaveBeenCalledWith('77');
    await userEvent.click(await screen.findByRole('button', { name: /type-c cable/i }));

    expect(await screen.findByText('Return against INV-0077')).toBeInTheDocument();
    expect(screen.getByText('Type-C Cable')).toBeInTheDocument();
  });

  it('shows each result at what it is worth back, after the invoice discount', async () => {
    vi.mocked(returnApi.findReturnableLines).mockResolvedValue([
      {
        invoiceId: 88,
        invoiceNumber: 'INV-0088',
        invoiceItemId: 9,
        productName: 'Charger 18W QC3.0',
        quantitySold: 1,
        quantityReturned: 0,
        quantityAvailable: 1,
        unitSalePrice: 600,
        refundPerUnit: 590,
        discountPerUnit: 10,
        maxRefund: 590,
        amountRemaining: 590,
      },
    ]);

    renderPage();

    await userEvent.type(screen.getByLabelText(/search/i), 'ch');
    await userEvent.click(screen.getByRole('button', { name: /find/i }));

    // The amount is on the result itself, before the return is even opened — and it is the 590
    // the customer paid, not the 600 the line was billed at.
    const result = await screen.findByRole('button', { name: /charger 18w/i });

    expect(result).toHaveTextContent(/Rs 590\.00 each/);
    expect(result).toHaveTextContent(/Rs 10\.00 discount/);

    await userEvent.click(result);

    expect(await screen.findByTestId('line-amount-9')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    vi.mocked(returnApi.findReturnableLines).mockResolvedValue([]);

    renderPage();

    await userEvent.type(screen.getByLabelText(/search/i), '03001234567');
    await userEvent.click(screen.getByRole('button', { name: /find/i }));

    expect(await screen.findByText(/no returnable sale found/i)).toBeInTheDocument();
  });

  it('refuses a search under 2 letters, without calling the server', async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText(/search/i), 'a');
    await userEvent.click(screen.getByRole('button', { name: /find/i }));

    expect(await screen.findByText(/at least 2 letters/i)).toBeInTheDocument();
    expect(returnApi.findReturnableLines).not.toHaveBeenCalled();
  });

  it('is available to a salesman', async () => {
    renderPage(staff);

    expect(screen.getByRole('tab', { name: /customer/i })).toBeInTheDocument();
  });

  it('shows the general list of returns already recorded, with stock and money detail', async () => {
    vi.mocked(returnApi.listSaleReturns).mockResolvedValue(
      page([
        {
          returnId: 1,
          returnNumber: 'SR-2026-0001',
          returnDateUtc: new Date().toISOString(),
          invoiceId: 77,
          invoiceNumber: 'INV-0077',
          productName: 'Type-C Cable',
          quantity: 1,
          billedTotal: 1000,
          discountTotal: 0,
          lineTotal: 1000,
          refundDue: 1000,
          reason: 'Wrong colour',
        },
      ]),
    );

    renderPage();

    const row = (await screen.findByText('Type-C Cable')).closest('tr')!;

    expect(within(row).getByText('1')).toBeInTheDocument();
    expect(within(row).getAllByText(/1,000/).length).toBeGreaterThan(0);
    expect(within(row).getByText('INV-0077')).toBeInTheDocument();
  });

  it('finds a sale by product name and returns it, naming the exact product and new stock', async () => {
    vi.mocked(returnApi.findReturnableLines).mockResolvedValue([
      {
        invoiceId: 77,
        invoiceNumber: 'INV-0077',
        invoiceItemId: 5,
        productName: 'Oppo Charger',
        quantitySold: 1,
        quantityReturned: 0,
        quantityAvailable: 1,
        unitSalePrice: 1500,
        refundPerUnit: 1500,
        discountPerUnit: 0,
        maxRefund: 1500,
        amountRemaining: 0,
      },
    ]);
    vi.mocked(returnApi.recordSaleReturn).mockResolvedValue({
      returnId: 1,
      returnNumber: 'SRT-2026-0001',
      totalBilled: 1500,
      totalDiscount: 0,
      totalReturned: 1500,
      refundDue: 1500,
      customerBalance: null,
      items: [{ productName: 'Oppo Charger', newQuantityOnHand: 12 }],
    });

    renderPage();

    await userEvent.type(screen.getByLabelText(/search/i), 'oppo charger');
    await userEvent.click(screen.getByRole('button', { name: /find/i }));

    await userEvent.click(await screen.findByRole('button', { name: /oppo charger/i }));

    // The exact sale line, ready to return — no invoice number was ever typed.
    expect(await screen.findByText('Return against INV-0077')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/return quantity for oppo charger/i), '1');
    await userEvent.click(screen.getByRole('button', { name: /record return/i }));

    // The popup names the exact product and confirms the stock it left behind.
    expect(await screen.findByText(/oppo charger/i)).toBeInTheDocument();
    expect(screen.getByText(/stock.*12/i)).toBeInTheDocument();
  });
});

describe('supplier returns', () => {
  it('offers only the owner this tab', async () => {
    renderPage(staff);

    expect(screen.queryByRole('tab', { name: /supplier/i })).not.toBeInTheDocument();
  });

  it('picks a purchase from the recent list and shows the return form', async () => {
    vi.mocked(purchaseApi.search).mockResolvedValue(
      page([
        {
          id: 501,
          supplierId: 3,
          productId: 9,
          productName: 'Wireless Earbuds',
          purchaseDateUtc: new Date().toISOString(),
          unitCost: 800,
          quantity: 20,
          total: 16000,
          returnedQty: 0,
        },
      ]) as never,
    );

    renderPage(admin);

    await userEvent.click(screen.getByRole('tab', { name: /supplier/i }));
    await userEvent.click(await screen.findByRole('button', { name: /return wireless earbuds/i }));

    expect(await screen.findByLabelText(/quantity/i)).toBeInTheDocument();
  });

  it('scopes both the purchase list and the return history to the chosen supplier', async () => {
    renderPage(admin);

    await userEvent.click(screen.getByRole('tab', { name: /supplier/i }));
    await userEvent.selectOptions(
      await screen.findByLabelText(/supplier/i),
      '3',
    );

    await waitFor(() => expect(purchaseApi.search).toHaveBeenLastCalledWith(3, undefined));
    await waitFor(() => expect(returnApi.listPurchaseReturns).toHaveBeenLastCalledWith(3));
  });

  it("shows a supplier's own return history alongside the purchase list", async () => {
    vi.mocked(returnApi.listPurchaseReturns).mockResolvedValue(
      page([
        {
          returnId: 9,
          returnNumber: 'PR-2026-0001',
          returnDateUtc: new Date().toISOString(),
          supplierId: 3,
          supplierName: 'Al-Rehman Traders',
          productName: 'Wireless Charger',
          quantity: 2,
          total: 1600,
          reason: 'Damaged in transit',
        },
      ]),
    );

    renderPage(admin);
    await userEvent.click(screen.getByRole('tab', { name: /supplier/i }));

    expect(await screen.findByText('Wireless Charger')).toBeInTheDocument();
    expect(screen.getByText(/1,600/)).toBeInTheDocument();
  });

  it('offers a Return item button next to the supplier dropdown', async () => {
    renderPage(admin);
    await userEvent.click(screen.getByRole('tab', { name: /supplier/i }));

    expect(await screen.findByLabelText(/supplier/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /return item/i })).toBeInTheDocument();
  });

  it('finds a purchase by product name and returns it, naming the exact product and new stock', async () => {
    vi.mocked(purchaseApi.search).mockResolvedValue(
      page([
        {
          id: 501,
          supplierId: 3,
          productId: 9,
          productName: 'Oppo Charger',
          purchaseDateUtc: new Date().toISOString(),
          unitCost: 800,
          quantity: 10,
          total: 8000,
          returnedQty: 0,
        },
      ]) as never,
    );
    vi.mocked(returnApi.recordPurchaseReturn).mockResolvedValue({
      returnId: 2,
      returnNumber: 'PRT-2026-0001',
      productName: 'Oppo Charger',
      totalReturned: 800,
      newQuantityOnHand: 9,
      newSupplierPayable: 7200,
    });

    renderPage(admin);
    await userEvent.click(screen.getByRole('tab', { name: /supplier/i }));

    await userEvent.click(await screen.findByRole('button', { name: /return item/i }));
    await userEvent.type(screen.getByLabelText(/product name/i), 'oppo');

    await userEvent.click(await screen.findByRole('button', { name: /oppo charger/i }));

    // Picked by product name, not by scrolling the purchase table — the form for the exact
    // purchase it belongs to opens directly.
    expect(await screen.findByText(/return oppo charger/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/quantity/i), '1');
    await userEvent.click(screen.getByRole('button', { name: /record return/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/oppo charger/i);
    expect(screen.getByRole('status')).toHaveTextContent(/stock now 9/i);
  });
});
