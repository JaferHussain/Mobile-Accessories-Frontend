import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PurchasesPage } from '@/features/purchases/PurchasesPage';
import { purchaseBillApi, type PurchaseBillSummary } from '@/features/purchases/purchaseBillApi';
import { productApi, type Product } from '@/features/products/productApi';
import { supplierApi } from '@/features/suppliers/supplierApi';
import { proofApi } from '@/features/proofs/proofApi';
import { shopToday } from '@/lib/shopDay';

vi.mock('@/features/products/productApi', () => ({
  productApi: { search: vi.fn(), create: vi.fn(), uploadImage: vi.fn() },
}));
vi.mock('@/features/suppliers/supplierApi', () => ({ supplierApi: { search: vi.fn() }, purchaseApi: { search: vi.fn() } }));
vi.mock('@/features/purchases/purchaseBillApi', () => ({
  purchaseBillApi: { list: vi.fn(), get: vi.fn(), record: vi.fn(), pay: vi.fn() },
}));
vi.mock('@/features/shopAccounts/shopAccountApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/shopAccounts/shopAccountApi')>();
  return { ...actual, shopAccountApi: { ...actual.shopAccountApi, list: vi.fn().mockResolvedValue([]) } };
});

/**
 * A supplier's bill, entered the way it arrives: every product, how and when it was paid, and the
 * bill's photo — saved at once, stock first and the payment after. Every rule is the server's too;
 * the screen asks for what is missing before anything is sent.
 */

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalItems: items.length, totalPages: 1 });

const product = (id: number, name: string): Product => ({
  id,
  name,
  categoryId: 7,
  category: 'Chargers',
  salePrice: 1500,
  retailPrice: 1500,
  wholesalePrice: 0,
  costPrice: 1000,
  quantityOnHand: 4,
  isLowStock: false,
  isActive: true,
});

const charger = product(11, 'Oppo Charger');
const cable = product(12, 'Type-C Cable');

const unpaidBill: PurchaseBillSummary = {
  id: 90,
  supplierId: 3,
  supplierName: 'Al-Rehman Traders',
  billNumber: 'AR-77',
  billDate: '2026-09-28',
  total: 5000,
  paid: 0,
  returned: 0,
  due: 5000,
  status: 'Unpaid',
  itemCount: 2,
  hasBillImage: false,
  note: null,
  recordedBy: 'Moiz',
};

const shot = (name: string) => new File(['jpeg'], name, { type: 'image/jpeg' });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PurchasesPage />
    </QueryClientProvider>,
  );
}

async function addLine(user: ReturnType<typeof userEvent.setup>, item: Product, quantity: string) {
  const search = await screen.findByLabelText(/which product did you buy|add another product/i);
  await user.clear(search);
  await user.type(search, item.name.slice(0, 4));
  await user.click(await screen.findByRole('button', { name: new RegExp(item.name) }));
  fireEvent.change(screen.getByLabelText(/^quantity/i), { target: { value: quantity } });
  await user.click(screen.getByRole('button', { name: /add to bill/i }));
}

/** Supplier, then two products: 2 chargers at 1,000 and 3 cables at 1,000 — a bill of Rs 5,000. */
async function fillBill(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText(/^supplier$/i), '3');
  await addLine(user, charger, '2');
  await addLine(user, cable, '3');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supplierApi.search).mockResolvedValue(page([{ id: 3, name: 'Al-Rehman Traders', payableBalance: 0, isActive: true }]) as never);
  vi.mocked(productApi.search).mockImplementation(async (params) =>
    page([charger, cable].filter((item) => item.name.toLowerCase().includes((params?.search ?? '').toLowerCase()))) as never,
  );
  vi.mocked(purchaseBillApi.list).mockResolvedValue([]);
  vi.mocked(purchaseBillApi.record).mockResolvedValue({
    billId: 90,
    total: 5000,
    paid: 5000,
    paymentId: 55,
    newSupplierPayable: 0,
    lines: [
      { purchaseId: 1, productId: 11, productName: 'Oppo Charger', quantity: 2, unitCost: 1000, total: 2000, newQuantityOnHand: 6, newCostPrice: 1000 },
      { purchaseId: 2, productId: 12, productName: 'Type-C Cable', quantity: 3, unitCost: 1000, total: 3000, newQuantityOnHand: 7, newCostPrice: 1000 },
    ],
  });
});

afterEach(() => vi.restoreAllMocks());

describe('building a bill', () => {
  it('lists each product added, and keeps the bill total', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillBill(user);

    const items = screen.getByRole('table', { name: /items on this bill/i });
    expect(within(items).getByText('Oppo Charger')).toBeInTheDocument();
    expect(within(items).getByText('Type-C Cable')).toBeInTheDocument();
    expect(screen.getByTestId('bill-items')).toHaveTextContent('2');
    expect(screen.getByTestId('bill-total')).toHaveTextContent('Rs 5,000.00');
  });

  it('lets a line be taken off again', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillBill(user);
    await user.click(screen.getByRole('button', { name: /remove oppo charger/i }));

    expect(screen.getByTestId('bill-total')).toHaveTextContent('Rs 3,000.00');
  });

  it('asks how the bill is paid before saving — nothing is chosen for you', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillBill(user);
    await user.click(screen.getByRole('button', { name: /save bill/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/how this bill is paid/i);
    expect(purchaseBillApi.record).not.toHaveBeenCalled();
  });
});

describe('paying the whole bill at once', () => {
  it('saves the stock and the payment together, dated, then attaches the bill and the screenshot', async () => {
    const user = userEvent.setup();
    const attach = vi.spyOn(proofApi, 'attach').mockResolvedValue(undefined);
    renderPage();

    await fillBill(user);
    await user.click(screen.getByRole('radio', { name: /pay in full now/i }));
    expect(screen.getByTestId('bill-paying')).toHaveTextContent('Rs 5,000.00');
    expect(screen.getByTestId('bill-owing')).toHaveTextContent('Rs 0.00');

    await user.selectOptions(screen.getByLabelText(/paid by/i), 'JazzCash');
    const billPhoto = shot('bill.jpg');
    const paymentShot = shot('paid.jpg');
    await user.upload(screen.getByLabelText(/supplier's bill \(photo\)/i), billPhoto);
    await user.upload(screen.getByLabelText(/payment screenshot/i), paymentShot);
    await user.click(screen.getByRole('button', { name: /save bill/i }));

    await waitFor(() =>
      expect(purchaseBillApi.record).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 3,
          billDate: shopToday(),
          lines: [
            expect.objectContaining({ productId: 11, quantity: 2, unitCost: 1000 }),
            expect.objectContaining({ productId: 12, quantity: 3, unitCost: 1000 }),
          ],
          payment: expect.objectContaining({ amount: 5000, paymentMethod: 'JazzCash', paidOn: shopToday() }),
        }),
      ),
    );
    await waitFor(() => expect(attach).toHaveBeenCalledWith('purchase-bill', 90, billPhoto));
    expect(attach).toHaveBeenCalledWith('supplier-payment', 55, paymentShot);

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/Oppo Charger \(stock now 6\)/);
    expect(status).toHaveTextContent(/paid rs 5,000\.00/i);
    expect(status).toHaveTextContent(/bill photo attached/i);
    expect(status).toHaveTextContent(/screenshot attached/i);
  });

  it('never asks for a payment screenshot when the supplier was paid in cash', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillBill(user);
    await user.click(screen.getByRole('radio', { name: /pay in full now/i }));
    await user.selectOptions(screen.getByLabelText(/paid by/i), 'Cash');

    expect(screen.queryByLabelText(/payment screenshot/i)).not.toBeInTheDocument();
    // The bill's own photo is about the goods, so it is always offered.
    expect(screen.getByLabelText(/supplier's bill \(photo\)/i)).toBeInTheDocument();
  });

  it('never lets the payment be dated before the bill', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillBill(user);
    fireEvent.change(screen.getByLabelText(/bill date/i), { target: { value: '2026-09-20' } });
    await user.click(screen.getByRole('radio', { name: /pay in full now/i }));

    expect(screen.getByLabelText(/date paid/i)).toHaveAttribute('min', '2026-09-20');
    expect(screen.getByLabelText(/date paid/i)).toHaveAttribute('max', shopToday());
  });
});

describe('paying part, or later', () => {
  it('pays part now and shows what is left owing', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillBill(user);
    await user.click(screen.getByRole('radio', { name: /pay part now/i }));
    fireEvent.change(screen.getByLabelText(/amount paid/i), { target: { value: '2000' } });

    expect(screen.getByTestId('bill-owing')).toHaveTextContent('Rs 3,000.00');
  });

  it('refuses a part payment that covers the whole bill', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillBill(user);
    await user.click(screen.getByRole('radio', { name: /pay part now/i }));
    fireEvent.change(screen.getByLabelText(/amount paid/i), { target: { value: '5000' } });
    await user.selectOptions(screen.getByLabelText(/paid by/i), 'Cash');
    await user.click(screen.getByRole('button', { name: /save bill/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/less than the bill/i);
    expect(purchaseBillApi.record).not.toHaveBeenCalled();
  });

  it('saves a bill to pay later with no payment at all', async () => {
    const user = userEvent.setup();
    vi.mocked(purchaseBillApi.record).mockResolvedValue({
      billId: 91, total: 5000, paid: 0, paymentId: null, newSupplierPayable: 5000, lines: [],
    });
    renderPage();

    await fillBill(user);
    await user.click(screen.getByRole('radio', { name: /pay later/i }));
    await user.click(screen.getByRole('button', { name: /save bill/i }));

    await waitFor(() => expect(purchaseBillApi.record).toHaveBeenCalledWith(expect.objectContaining({ payment: null })));
    expect(await screen.findByRole('status')).toHaveTextContent(/whole rs 5,000\.00 is owed to the supplier/i);
  });
});

describe('the bills list', () => {
  it('shows what each bill came to, what was paid and what is owed', async () => {
    vi.mocked(purchaseBillApi.list).mockResolvedValue([unpaidBill, { ...unpaidBill, id: 91, billNumber: 'AR-78', paid: 5000, due: 0, status: 'Paid' }]);
    renderPage();

    const unpaid = await screen.findByTestId('bill-90');
    expect(unpaid).toHaveTextContent('AR-77');
    expect(within(unpaid).getByText('Unpaid')).toBeInTheDocument();
    expect(within(unpaid).getByRole('button', { name: /^pay$/i })).toBeInTheDocument();

    const paid = screen.getByTestId('bill-91');
    expect(within(paid).getByText('Paid')).toBeInTheDocument();
    expect(within(paid).queryByRole('button', { name: /^pay$/i })).not.toBeInTheDocument();
  });

  it('pays a bill later, dated, with its screenshot', async () => {
    const user = userEvent.setup();
    const attach = vi.spyOn(proofApi, 'attach').mockResolvedValue(undefined);
    vi.mocked(purchaseBillApi.list).mockResolvedValue([unpaidBill]);
    vi.mocked(purchaseBillApi.pay).mockResolvedValue({ paymentId: 77, due: 0, newSupplierPayable: 0 });
    renderPage();

    await user.click(within(await screen.findByTestId('bill-90')).getByRole('button', { name: /^pay$/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/amount/i)).toHaveValue(5000);
    expect(within(dialog).getByLabelText(/date paid/i)).toHaveAttribute('min', '2026-09-28');

    await user.selectOptions(within(dialog).getByLabelText(/paid by/i), 'BankTransfer');
    const proof = shot('transfer.jpg');
    await user.upload(within(dialog).getByLabelText(/screenshot/i), proof);
    await user.click(within(dialog).getByRole('button', { name: /record payment/i }));

    await waitFor(() =>
      expect(purchaseBillApi.pay).toHaveBeenCalledWith(90, expect.objectContaining({ amount: 5000, paymentMethod: 'BankTransfer', paidOn: shopToday() })),
    );
    await waitFor(() => expect(attach).toHaveBeenCalledWith('supplier-payment', 77, proof));
    expect(await screen.findByRole('status')).toHaveTextContent(/the bill is paid/i);
  });
});
