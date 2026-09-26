import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckoutModal } from '@/features/pos/CheckoutModal';
import type { CustomerSummary } from '@/features/pos/posApi';

/**
 * The last step of a sale: who is buying, and how they are paying.
 *
 * Everything money-related that used to sit on the counter screen lives here, because these are
 * the questions asked once, at the end — not while the cart is being built.
 */

const bilal: CustomerSummary = {
  id: 5,
  name: 'Bilal Traders',
  mobileNumber: '03001234567',
  outstandingBalance: 4200,
};

function setup(overrides: Partial<Parameters<typeof CheckoutModal>[0]> = {}) {
  const onSearchCustomers = vi.fn(async () => [bilal]);
  const onCreateCustomer = vi.fn(async (name: string) => ({ id: 9, name }));
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();

  render(
    <CheckoutModal
      total={2200}
      canSellOnCredit
      onSearchCustomers={onSearchCustomers}
      onCreateCustomer={onCreateCustomer}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );

  return { onSearchCustomers, onCreateCustomer, onConfirm, onCancel };
}

const complete = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /complete sale/i }));

const choosePayment = (user: ReturnType<typeof userEvent.setup>, label: RegExp) =>
  user.click(screen.getByRole('radio', { name: label }));

describe('CheckoutModal customer', () => {
  it('is a walk-in by default, so a cash sale needs nothing typed', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await complete(user);

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: null, paymentMethod: 'Cash' }),
      ),
    );
  });

  it('finds a customer already on file', async () => {
    const user = userEvent.setup();
    const { onSearchCustomers, onConfirm } = setup();

    await user.click(screen.getByRole('radio', { name: /existing customer/i }));
    await user.type(screen.getByLabelText(/find customer/i), 'bilal');
    await user.click(screen.getByRole('button', { name: /^find$/i }));

    expect(onSearchCustomers).toHaveBeenCalledWith('bilal');

    const found = await screen.findByTestId(`customer-option-${bilal.id}`);
    await user.click(within(found).getByRole('button', { name: /select/i }));
    await complete(user);

    // The whole point of the picker: the sale attaches to the EXISTING record rather than
    // creating a second "Bilal" with a second balance.
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ customerId: bilal.id })),
    );
  });

  it('shows what an existing customer already owes before adding to it', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('radio', { name: /existing customer/i }));
    await user.type(screen.getByLabelText(/find customer/i), 'bilal');
    await user.click(screen.getByRole('button', { name: /^find$/i }));

    expect(await screen.findByTestId(`customer-option-${bilal.id}`)).toHaveTextContent('Rs 4,200.00');
  });

  it('says so when nobody matches', async () => {
    const user = userEvent.setup();
    setup({ onSearchCustomers: vi.fn(async () => []) });

    await user.click(screen.getByRole('radio', { name: /existing customer/i }));
    await user.type(screen.getByLabelText(/find customer/i), 'nobody');
    await user.click(screen.getByRole('button', { name: /^find$/i }));

    expect(await screen.findByText(/no customer found/i)).toBeInTheDocument();
  });

  it('creates a new customer inline and sells to them', async () => {
    const user = userEvent.setup();
    const { onCreateCustomer, onConfirm } = setup();

    await user.click(screen.getByRole('radio', { name: /new customer/i }));
    await user.type(screen.getByLabelText(/^name/i), 'Ahmed');
    await user.type(screen.getByLabelText(/mobile/i), '03007654321');
    await complete(user);

    await waitFor(() => expect(onCreateCustomer).toHaveBeenCalledWith('Ahmed', '03007654321'));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ customerId: 9 })),
    );
  });

  it('requires a name on a new customer', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await user.click(screen.getByRole('radio', { name: /new customer/i }));
    await complete(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('CheckoutModal payment', () => {
  it('treats cash as settling the bill in full', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await complete(user);

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ amountPaid: 2200 })),
    );
  });

  it('asks for the account and reference on a transfer, never on cash', async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.queryByLabelText(/account number/i)).not.toBeInTheDocument();

    await choosePayment(user, /jazzcash/i);

    // The money arrived from somewhere; cash in the drawer did not.
    expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/transaction/i)).toBeInTheDocument();
  });

  it('still settles the bill in full on a transfer', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await choosePayment(user, /bank transfer/i);
    await complete(user);

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'BankTransfer', amountPaid: 2200 }),
      ),
    );
  });

  it('offers Raast, which the schema has always accepted', async () => {
    setup();

    expect(screen.getByRole('radio', { name: /raast/i })).toBeInTheDocument();
  });

  it('pays nothing on a full udhaar sale', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await choosePayment(user, /udhaar/i);
    await user.click(screen.getByRole('radio', { name: /existing customer/i }));
    await user.type(screen.getByLabelText(/find customer/i), 'bilal');
    await user.click(screen.getByRole('button', { name: /^find$/i }));

    const found = await screen.findByTestId(`customer-option-${bilal.id}`);
    await user.click(within(found).getByRole('button', { name: /select/i }));
    await complete(user);

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'Credit', amountPaid: 0 }),
      ),
    );
  });

  it('asks how much was paid only on a part payment, and shows what remains', async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.queryByLabelText(/paid now/i)).not.toBeInTheDocument();

    await choosePayment(user, /part paid/i);
    await user.clear(screen.getByLabelText(/paid now/i));
    await user.type(screen.getByLabelText(/paid now/i), '1500');

    expect(screen.getByTestId('checkout-remaining')).toHaveTextContent('Rs 700.00');
  });

  it('refuses a part payment that covers the whole bill', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await choosePayment(user, /part paid/i);
    await user.clear(screen.getByLabelText(/paid now/i));
    await user.type(screen.getByLabelText(/paid now/i), '2200');
    await complete(user);

    // Nothing is owed, so this is not a part payment — it is a cash sale mislabelled.
    expect(await screen.findByRole('alert')).toHaveTextContent(/less than the total/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('refuses a part payment of nothing', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await choosePayment(user, /part paid/i);
    await complete(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/greater than zero/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('CheckoutModal debt needs a customer', () => {
  it('refuses udhaar for a walk-in', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await choosePayment(user, /udhaar/i);
    await complete(user);

    // A debt nobody is named for cannot be collected.
    expect(await screen.findByRole('alert')).toHaveTextContent(/customer/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('refuses a part payment for a walk-in', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await choosePayment(user, /part paid/i);
    await user.clear(screen.getByLabelText(/paid now/i));
    await user.type(screen.getByLabelText(/paid now/i), '1000');
    await complete(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/customer/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('lets a cash walk-in through, because nothing is owed', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await complete(user);

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
  });
});

describe('CheckoutModal credit authority', () => {
  it('offers udhaar and part payment to the owner', () => {
    setup({ canSellOnCredit: true });

    expect(screen.getByRole('radio', { name: /udhaar/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /part paid/i })).toBeInTheDocument();
  });

  it('offers neither to a salesman, and says why', () => {
    setup({ canSellOnCredit: false });

    expect(screen.queryByRole('radio', { name: /udhaar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /part paid/i })).not.toBeInTheDocument();
    // Absence with no explanation reads as a broken screen. The server refuses it regardless.
    expect(screen.getByText(/only the owner can approve udhaar/i)).toBeInTheDocument();
  });
});

describe('CheckoutModal closing', () => {
  it('can be cancelled without selling anything', async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = setup();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('reports a refusal from the server instead of closing', async () => {
    const user = userEvent.setup();
    setup({ onConfirm: vi.fn().mockRejectedValue(new Error('Not enough stock.')) });

    await complete(user);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
