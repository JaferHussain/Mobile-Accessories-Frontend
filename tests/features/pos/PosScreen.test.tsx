import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PosScreen } from '@/features/pos/PosScreen';
import type { Product } from '@/features/products/productApi';
import type { CreateInvoiceResult } from '@/features/pos/posApi';
import { ApiError } from '@/types/api';

/** T093 / T095 — the counter: cart totals, payment switching, and the customer requirement. */

const cable: Product = {
  id: 1,
  name: 'Type-C Braided 2m',
  categoryId: 1,
  category: 'Cables',
  salePrice: 1100,
  quantityOnHand: 10,
  isLowStock: false,
  isActive: true,
};

const earbuds: Product = {
  id: 2,
  name: 'Earbuds Pro',
  categoryId: 1,
  category: 'Audio',
  salePrice: 2500,
  quantityOnHand: 5,
  isLowStock: false,
  isActive: true,
};

const savedInvoice: CreateInvoiceResult = {
  invoiceId: 10,
  invoiceNumber: 'INV-2026-000010',
  subtotal: 2200,
  totalDiscount: 0,
  total: 2200,
  amountPaid: 2200,
  amountRemaining: 0,
  customerId: null,
  customerBalance: null,
};

function setup(overrides: Partial<Parameters<typeof PosScreen>[0]> = {}) {
  // Feature 005: a lookup now reports HOW it matched. A digits-only term is treated as a
  // scanned barcode and still goes straight into the cart; anything typed comes back as
  // candidates for the salesman to pick from.
  const onFindProduct = vi.fn(async (term: string) => {
    if (term === 'nothing') return { kind: 'matches' as const, products: [] };

    const product = term.includes('earbud') || term === '2' ? earbuds : cable;

    return /^\d+$/.test(term)
      ? { kind: 'barcode' as const, product }
      : { kind: 'matches' as const, products: [product] };
  });

  const onSave = vi.fn().mockResolvedValue(savedInvoice);
  const onCreateCustomer = vi.fn().mockResolvedValue({ id: 5, name: 'Bilal' });
  const onSearchCustomers = vi.fn().mockResolvedValue([
    { id: 5, name: 'Bilal Traders', mobileNumber: '03001234567', outstandingBalance: 0 },
  ]);

  // Wholesale is priced 100 below the counter price for every product in these tests.
  const onRepriceProduct = vi.fn(async (productId: number, saleType: string) => {
    const product = productId === earbuds.id ? earbuds : cable;

    return saleType === 'Wholesale' ? product.salePrice - 100 : product.salePrice;
  });

  render(
    <PosScreen
      onFindProduct={onFindProduct}
      onRepriceProduct={onRepriceProduct}
      onSave={onSave}
      onCreateCustomer={onCreateCustomer}
      onSearchCustomers={onSearchCustomers}
      canSellOnCredit
      {...overrides}
    />,
  );

  return { onFindProduct, onSave, onCreateCustomer, onSearchCustomers, onRepriceProduct };
}

/**
 * Completing a sale, which is now two deliberate steps: the counter hands over to the checkout
 * modal, and the modal is where who-is-paying-and-how is settled.
 */
async function completeSale(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /proceed to sale/i }));
  await user.click(await screen.findByRole('button', { name: /complete sale/i }));
}

async function addCable(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/scan or search/i), 'cable');
  await user.click(screen.getByRole('button', { name: 'Search' }));

  // One extra click, deliberately: a typed search offers candidates rather than taking the
  // first one (FR-012).
  const result = await screen.findByTestId(`pos-result-${cable.id}`);
  await user.click(within(result).getByRole('button', { name: 'Add' }));

  await screen.findByTestId(`cart-line-${cable.id}`);
}

const setNumber = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('PosScreen cart', () => {
  it('starts empty', () => {
    setup();

    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it('adds a product by search', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);

    expect(screen.getByText('Type-C Braided 2m')).toBeInTheDocument();
    expect(screen.getByTestId('total')).toHaveTextContent('Rs 1,100.00');
  });

  it('adds a product when the scanner presses Enter', async () => {
    const user = userEvent.setup();
    const { onFindProduct } = setup();

    const input = screen.getByLabelText(/scan or search/i);
    await user.type(input, '8901234567890{Enter}');

    // The sale type travels with every lookup so the price quoted is the one being charged.
    await waitFor(() =>
      expect(onFindProduct).toHaveBeenCalledWith('8901234567890', 'Retail'),
    );
    expect(await screen.findByText('Type-C Braided 2m')).toBeInTheDocument();
  });

  it('increments the quantity when the same product is scanned twice', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    await addCable(user);

    // The server refuses two lines for one product, so a repeat scan must merge.
    expect(screen.getAllByText('Type-C Braided 2m')).toHaveLength(1);
    expect(screen.getByLabelText('Quantity for Type-C Braided 2m')).toHaveValue(2);
    expect(screen.getByTestId('total')).toHaveTextContent('Rs 2,200.00');
  });

  it('reports a barcode that matches nothing', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/scan or search/i), 'nothing');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no product found/i);
  });

  it('recalculates when the quantity changes', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    setNumber('Quantity for Type-C Braided 2m', '2');

    // spec US1 scenario 1: 2 units at 1,100 -> 2,200.
    expect(screen.getByTestId('total')).toHaveTextContent('Rs 2,200.00');
  });

  it('removes a line', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    await user.click(screen.getByRole('button', { name: /remove type-c/i }));

    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it('handles several different products', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    await user.type(screen.getByLabelText(/scan or search/i), 'earbud');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    const result = await screen.findByTestId(`pos-result-${earbuds.id}`);
    await user.click(within(result).getByRole('button', { name: 'Add' }));

    await screen.findByTestId(`cart-line-${earbuds.id}`);
    expect(screen.getByTestId('total')).toHaveTextContent('Rs 3,600.00');
  });
});

describe('PosScreen discounts', () => {
  it('applies a line discount', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    setNumber('Discount for Type-C Braided 2m', '100');

    expect(screen.getByTestId('total')).toHaveTextContent('Rs 1,000.00');
  });

  it('applies line and whole-bill discounts together', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    setNumber('Quantity for Type-C Braided 2m', '2');
    setNumber('Price for Type-C Braided 2m', '2500');
    setNumber('Discount for Type-C Braided 2m', '100');
    setNumber(/whole-bill discount/i, '400');

    // spec US1 scenario 2: 5,000 cart, 100 line, 400 order -> 4,500.
    expect(screen.getByTestId('subtotal')).toHaveTextContent('Rs 4,900.00');
    expect(screen.getByTestId('discount')).toHaveTextContent('Rs 500.00');
    expect(screen.getByTestId('total')).toHaveTextContent('Rs 4,500.00');
  });

  it('warns when a discount exceeds the line', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    setNumber('Discount for Type-C Braided 2m', '5000');

    expect(await screen.findByRole('alert')).toHaveTextContent(/exceeds the line value/i);
  });

  it('warns when the bill discount exceeds the subtotal', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    setNumber(/whole-bill discount/i, '99999');

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot exceed the cart subtotal/i);
  });
});

describe('PosScreen saving', () => {
  it('saves a cash sale through the checkout', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await addCable(user);
    await completeSale(user);

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        customerId: null,
        orderDiscount: 0,
        amountPaid: cable.salePrice,
        paymentMethod: 'Cash',
        paymentAccountNumber: null,
        paymentTransactionId: null,
        saleType: 'Retail',
        items: [
          {
            productId: cable.id,
            quantity: 1,
            unitSalePrice: cable.salePrice,
            lineDiscount: 0,
          },
        ],
      }),
    );
  });

  it('sends the whole-bill discount with the sale', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await addCable(user);
    fireEvent.change(screen.getByLabelText(/whole-bill discount/i), { target: { value: '100' } });
    await completeSale(user);

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ orderDiscount: 100 })),
    );
  });

  it('confirms the saved sale and clears the cart', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    await completeSale(user);

    expect(await screen.findByText(/saved INV-2026-000010/i)).toBeInTheDocument();
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it('keeps the cart when the server refuses the sale', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValue(new ApiError('INSUFFICIENT_STOCK', 'Only 2 left in stock.', 409));

    setup({ onSave });

    await addCable(user);
    await completeSale(user);

    // The refusal is shown where it can be acted on, and nothing is lost.
    expect(await screen.findByRole('alert')).toHaveTextContent(/only 2 left/i);
    expect(screen.getByTestId(`cart-line-${cable.id}`)).toBeInTheDocument();
  });

  it('cannot be sold with an empty cart', () => {
    setup();

    expect(screen.getByRole('button', { name: /proceed to sale/i })).toBeDisabled();
  });
});

describe('PosScreen sale type', () => {
  it('defaults to a retail sale', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await addCable(user);

    expect(screen.getByRole('radio', { name: 'Retail' })).toBeChecked();

    await completeSale(user);

    // The counter is the normal case, so an untouched toggle must not misfile the sale.
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ saleType: 'Retail' })),
    );
  });

  it('records a wholesale sale when the salesman says so', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await addCable(user);
    await user.click(screen.getByRole('radio', { name: 'Wholesale' }));
    await completeSale(user);

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ saleType: 'Wholesale' })),
    );
  });

  it('quotes the price for the sale type being made', async () => {
    const user = userEvent.setup();
    const { onFindProduct } = setup();

    await user.click(screen.getByRole('radio', { name: 'Wholesale' }));
    await addCable(user);

    // The lookup carries the sale type, so the server returns the wholesale price directly
    // rather than the client holding a price list.
    expect(onFindProduct).toHaveBeenCalledWith('cable', 'Wholesale');
  });

  it('re-prices what is already in the cart when the type changes', async () => {
    const user = userEvent.setup();
    const { onRepriceProduct, onSave } = setup();

    await addCable(user);
    await user.click(screen.getByRole('radio', { name: 'Wholesale' }));

    await waitFor(() => expect(onRepriceProduct).toHaveBeenCalledWith(cable.id, 'Wholesale'));

    await completeSale(user);

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          saleType: 'Wholesale',
          items: [expect.objectContaining({ unitSalePrice: cable.salePrice - 100 })],
        }),
      ),
    );
  });

  it('switching back to retail restores the counter price', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await addCable(user);
    await user.click(screen.getByRole('radio', { name: 'Wholesale' }));
    await user.click(screen.getByRole('radio', { name: 'Retail' }));

    await completeSale(user);

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          saleType: 'Retail',
          items: [expect.objectContaining({ unitSalePrice: cable.salePrice })],
        }),
      ),
    );
  });

  it('keeps a line at its current price if it cannot be re-read', async () => {
    const user = userEvent.setup();
    const onRepriceProduct = vi.fn().mockRejectedValue(new Error('offline'));
    const { onSave } = setup({ onRepriceProduct });

    await addCable(user);
    await user.click(screen.getByRole('radio', { name: 'Wholesale' }));

    await completeSale(user);

    // Falling back to zero would sell the goods for nothing. The old price is the safe answer.
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [expect.objectContaining({ unitSalePrice: cable.salePrice })],
        }),
      ),
    );
  });
});

describe('PosScreen credit controls', () => {
  it('always sends the full total as paid for a salesman', async () => {
    const user = userEvent.setup();
    const { onSave } = setup({ canSellOnCredit: false });

    await addCable(user);
    await completeSale(user);

    // Nothing offered to a salesman composes a sale that leaves money outstanding. The server
    // refuses it regardless of what arrives (FR-051).
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ amountPaid: cable.salePrice }),
      ),
    );
  });
});

/**
 * After a sale is saved, the counter must be ready for the next customer.
 *
 * The screen once emptied the cart on success, which disabled the Save button and left a green
 * banner sitting above it — a success message over a dead control, which read as frozen. Then it
 * gained an explicit "New sale" button, which fixed the dead end but put a click (and a picture
 * picker) between the salesman and their next customer. It now resets instantly, and only a
 * non-cash sale keeps a banner, because that one still has something to do.
 *
 * The fading and the persisting are asserted in PosReceipt.test.tsx; what matters here is that
 * the counter is usable again with no intervention at all.
 */
describe('PosScreen after a sale is saved', () => {
  async function sellAndSave(user: ReturnType<typeof userEvent.setup>) {
    await addCable(user);
    await completeSale(user);
    await screen.findByText(/saved INV-2026-000010/i);
  }

  it('clears the cart and the money from the sale just saved', async () => {
    const user = userEvent.setup();
    setup();

    await sellAndSave(user);

    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
    expect(screen.getByTestId('total')).toHaveTextContent('Rs 0.00');
  });

  it('is ready to sell again with no click in between', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await sellAndSave(user);

    // No dismissing, no "New sale" — straight into the next customer.
    await addCable(user);
    await completeSale(user);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });

  it('explains why Save is unavailable rather than looking broken', async () => {
    const user = userEvent.setup();
    setup();

    await sellAndSave(user);

    // A disabled button with no reason beside it is what made this screen feel stuck.
    expect(screen.getByRole('button', { name: /proceed to sale/i })).toBeDisabled();
    expect(screen.getByTestId('save-hint')).toHaveTextContent(/scan or search/i);
  });
});
