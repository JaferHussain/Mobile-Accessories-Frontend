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
  const onFindProduct = vi.fn(async (term: string) => {
    if (term.includes('earbud') || term === '2') return earbuds;
    if (term === 'nothing') return null;
    return cable;
  });

  const onSave = vi.fn().mockResolvedValue(savedInvoice);
  const onCreateCustomer = vi.fn().mockResolvedValue({ id: 5, name: 'Bilal' });

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
      canSellOnCredit
      {...overrides}
    />,
  );

  return { onFindProduct, onSave, onCreateCustomer, onRepriceProduct };
}

async function addCable(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/scan or search/i), 'cable');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await screen.findByText('Type-C Braided 2m');
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
    await user.click(screen.getByRole('button', { name: 'Add' }));

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
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await screen.findByText('Earbuds Pro');
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

describe('PosScreen payment methods', () => {
  it('treats cash as fully paid', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);

    expect(screen.getByTestId('paid')).toHaveTextContent('Rs 1,100.00');
    expect(screen.getByTestId('remaining')).toHaveTextContent('Rs 0.00');
  });

  it('treats credit as nothing paid', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    await user.selectOptions(screen.getByLabelText('Payment'), 'Credit');

    expect(screen.getByTestId('paid')).toHaveTextContent('Rs 0.00');
    expect(screen.getByTestId('remaining')).toHaveTextContent('Rs 1,100.00');
  });

  it('asks how much was paid only for a partial payment', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    expect(screen.queryByLabelText(/amount paid now/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Payment'), 'Partial');
    expect(screen.getByLabelText(/amount paid now/i)).toBeInTheDocument();
  });

  it('computes the balance on a partial payment', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    setNumber('Price for Type-C Braided 2m', '3000');
    await user.selectOptions(screen.getByLabelText('Payment'), 'Partial');
    setNumber(/amount paid now/i, '1000');

    // spec US2 scenario 1.
    expect(screen.getByTestId('remaining')).toHaveTextContent('Rs 2,000.00');
  });

  it('does not let a partial payment exceed the total', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    await user.selectOptions(screen.getByLabelText('Payment'), 'Partial');
    setNumber(/amount paid now/i, '99999');

    expect(screen.getByTestId('paid')).toHaveTextContent('Rs 1,100.00');
    expect(screen.getByTestId('remaining')).toHaveTextContent('Rs 0.00');
  });

  it('switching from credit back to cash settles the bill again', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    await user.selectOptions(screen.getByLabelText('Payment'), 'Credit');
    await user.selectOptions(screen.getByLabelText('Payment'), 'Cash');

    expect(screen.getByTestId('remaining')).toHaveTextContent('Rs 0.00');
  });
});

describe('PosScreen saving', () => {
  it('saves a cash sale', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await addCable(user);
    await user.click(screen.getByRole('button', { name: /save sale/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          amountPaid: 1100,
          paymentMethod: 'Cash',
          customerId: null,
          items: [expect.objectContaining({ productId: 1, quantity: 1, unitSalePrice: 1100 })],
        }),
      ),
    );
  });

  it('confirms the saved sale and clears the cart', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    await user.click(screen.getByRole('button', { name: /save sale/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('INV-2026-000010');
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it('shows the server message when the sale is refused', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(
        new ApiError('INSUFFICIENT_STOCK', 'Not enough stock for Type-C Braided 2m.', 400),
      );

    const user = userEvent.setup();
    setup({ onSave });

    await addCable(user);
    await user.click(screen.getByRole('button', { name: /save sale/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not enough stock/i);
    // The cart survives so the shopkeeper can fix the quantity.
    expect(screen.getByText('Type-C Braided 2m')).toBeInTheDocument();
  });

  it('cannot be saved with an empty cart', () => {
    setup();

    expect(screen.getByRole('button', { name: /save sale/i })).toBeDisabled();
  });
});

describe('PosScreen customer requirement', () => {
  it('asks for a customer when the sale leaves a balance', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await addCable(user);
    await user.selectOptions(screen.getByLabelText('Payment'), 'Credit');
    await user.click(screen.getByRole('button', { name: /save sale/i }));

    // FR-017: a sale that is not fully paid needs someone to owe it.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/leaves a balance owing/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not ask for a customer on a fully paid sale', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    await user.click(screen.getByRole('button', { name: /save sale/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates the customer inline and then saves the sale', async () => {
    const user = userEvent.setup();
    const { onSave, onCreateCustomer } = setup();

    await addCable(user);
    await user.selectOptions(screen.getByLabelText('Payment'), 'Credit');
    await user.click(screen.getByRole('button', { name: /save sale/i }));

    await user.type(await screen.findByLabelText('Name'), 'Bilal');
    await user.type(screen.getByLabelText(/mobile number/i), '03001234567');
    await user.click(screen.getByRole('button', { name: /save customer/i }));

    await waitFor(() => expect(onCreateCustomer).toHaveBeenCalledWith('Bilal', '03001234567'));
    expect(await screen.findByText(/customer: bilal/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save sale/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ customerId: 5, amountPaid: 0 })),
    );
  });

  it('requires a name in the quick-create form', async () => {
    const user = userEvent.setup();
    const { onCreateCustomer } = setup();

    await addCable(user);
    await user.selectOptions(screen.getByLabelText('Payment'), 'Credit');
    await user.click(screen.getByRole('button', { name: /save sale/i }));

    await user.click(await screen.findByRole('button', { name: /save customer/i }));

    expect(await screen.findByText('Customer name is required.')).toBeInTheDocument();
    expect(onCreateCustomer).not.toHaveBeenCalled();
  });

  it('can be cancelled', async () => {
    const user = userEvent.setup();
    setup();

    await addCable(user);
    await user.selectOptions(screen.getByLabelText('Payment'), 'Credit');
    await user.click(screen.getByRole('button', { name: /save sale/i }));

    await user.click(await screen.findByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Type-C Braided 2m')).toBeInTheDocument();
  });
});

describe('PosScreen sale type', () => {
  it('defaults to a retail sale', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await addCable(user);

    expect(screen.getByRole('radio', { name: 'Retail' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: /save sale/i }));

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
    await user.click(screen.getByRole('button', { name: /save sale/i }));

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

    await user.click(screen.getByRole('button', { name: /save sale/i }));

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

    await user.click(screen.getByRole('button', { name: /save sale/i }));

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

    await user.click(screen.getByRole('button', { name: /save sale/i }));

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
  it('offers credit and part payment to the owner', async () => {
    const user = userEvent.setup();
    setup({ canSellOnCredit: true });

    await addCable(user);

    const payment = screen.getByLabelText('Payment');

    expect(within(payment).getByRole('option', { name: /credit \(udhaar\)/i })).toBeInTheDocument();
    expect(within(payment).getByRole('option', { name: /part paid/i })).toBeInTheDocument();
  });

  it('offers neither to a salesman', async () => {
    const user = userEvent.setup();
    setup({ canSellOnCredit: false });

    await addCable(user);

    const payment = screen.getByLabelText('Payment');

    // FR-056: the salesman finds out the rule before scanning a cart, not after.
    expect(within(payment).queryByRole('option', { name: /credit \(udhaar\)/i })).not.toBeInTheDocument();
    expect(within(payment).queryByRole('option', { name: /part paid/i })).not.toBeInTheDocument();
  });

  it('tells the salesman why the options are missing', async () => {
    const user = userEvent.setup();
    setup({ canSellOnCredit: false });

    await addCable(user);

    // Absence with no explanation reads as a broken screen.
    expect(screen.getByText(/only the owner can approve udhaar/i)).toBeInTheDocument();
  });

  it('does not nag the owner with that note', async () => {
    const user = userEvent.setup();
    setup({ canSellOnCredit: true });

    await addCable(user);

    expect(screen.queryByText(/only the owner can approve udhaar/i)).not.toBeInTheDocument();
  });

  it('always sends the full total as paid for a salesman', async () => {
    const user = userEvent.setup();
    const { onSave } = setup({ canSellOnCredit: false });

    await addCable(user);
    await user.click(screen.getByRole('button', { name: /save sale/i }));

    // Nothing on screen lets a salesman compose a sale that leaves money outstanding.
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ amountPaid: cable.salePrice }),
      ),
    );
  });
});
