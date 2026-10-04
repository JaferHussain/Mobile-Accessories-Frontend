import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckoutModal } from '@/features/pos/CheckoutModal';
import type { CustomerSummary } from '@/features/pos/posApi';

/**
 * The last step of a sale: who is buying, and how they are paying.
 *
 * Two kinds of customer, and only two: a walk-in, and a registered udhaar customer. Full udhaar is
 * for udhaar customers; a walk-in may pay part with a name and phone. The server decides it all
 * again — this keeps a choice that would be refused off the screen.
 */

const bilal: CustomerSummary = {
  id: 5,
  name: 'Bilal Traders',
  mobileNumber: '03001234567',
  outstandingBalance: 4200,
  creditAllowed: true,
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

const FULL_UDHAAR = /credit \(udhaar\)/i;
const PART_PAID = /part paid/i;

async function chooseBilal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: /udhaar customer/i }));
  await user.type(screen.getByLabelText(/find customer/i), 'bilal');
  await user.click(screen.getByRole('button', { name: /^find$/i }));
  const found = await screen.findByTestId(`customer-option-${bilal.id}`);
  await user.click(within(found).getByRole('button', { name: /select/i }));
}

describe('CheckoutModal customer', () => {
  it('is a walk-in by default, so a cash sale needs nothing typed', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCreateCustomer } = setup();

    await complete(user);

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ customerId: null, paymentMethod: 'Cash' })),
    );
    // A one-off buyer who paid in full is never stored.
    expect(onCreateCustomer).not.toHaveBeenCalled();
  });

  it('offers only the two kinds of customer — walk-in and udhaar customer', () => {
    setup();

    expect(screen.getByRole('radio', { name: /walk-in customer/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /udhaar customer/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /new customer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /existing customer/i })).not.toBeInTheDocument();
  });

  it('finds a registered udhaar customer and sells to that record', async () => {
    const user = userEvent.setup();
    const { onSearchCustomers, onConfirm } = setup();

    await chooseBilal(user);
    expect(onSearchCustomers).toHaveBeenCalledWith('bilal');
    await complete(user);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ customerId: bilal.id })));
  });

  it('shows what an udhaar customer already owes before adding to it', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('radio', { name: /udhaar customer/i }));
    await user.type(screen.getByLabelText(/find customer/i), 'bilal');
    await user.click(screen.getByRole('button', { name: /^find$/i }));

    expect(await screen.findByTestId(`customer-option-${bilal.id}`)).toHaveTextContent('Rs 4,200.00');
  });

  it('says where udhaar customers come from when nobody matches', async () => {
    const user = userEvent.setup();
    setup({ onSearchCustomers: vi.fn(async () => []) });

    await user.click(screen.getByRole('radio', { name: /udhaar customer/i }));
    await user.type(screen.getByLabelText(/find customer/i), 'nobody');
    await user.click(screen.getByRole('button', { name: /^find$/i }));

    expect(await screen.findByText(/no udhaar customer found/i)).toBeInTheDocument();
  });

  it('asks for the udhaar customer before selling to one', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await user.click(screen.getByRole('radio', { name: /udhaar customer/i }));
    await complete(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/select the udhaar customer/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('CheckoutModal payment', () => {
  it('treats cash as settling the bill in full', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await complete(user);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ amountPaid: 2200 })));
  });

  it('asks for the account and reference on a transfer, never on cash', async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.queryByLabelText(/account number/i)).not.toBeInTheDocument();

    await choosePayment(user, /jazzcash/i);

    expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/transaction/i)).toBeInTheDocument();
  });

  it('still settles the bill in full on a transfer', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await choosePayment(user, /bank transfer/i);
    await complete(user);

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'BankTransfer', amountPaid: 2200 })),
    );
  });

  it('offers Raast, which the schema has always accepted', () => {
    setup();

    expect(screen.getByRole('radio', { name: /raast/i })).toBeInTheDocument();
  });

  it('asks how much was paid only on a part payment, and shows what remains', async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.queryByLabelText(/paid now/i)).not.toBeInTheDocument();

    await choosePayment(user, PART_PAID);
    await user.clear(screen.getByLabelText(/paid now/i));
    await user.type(screen.getByLabelText(/paid now/i), '1500');

    expect(screen.getByTestId('checkout-remaining')).toHaveTextContent('Rs 700.00');
  });

  it('refuses a part payment that covers the whole bill', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await choosePayment(user, PART_PAID);
    await user.clear(screen.getByLabelText(/paid now/i));
    await user.type(screen.getByLabelText(/paid now/i), '2200');
    await complete(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/less than the total/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('refuses a part payment of nothing', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await choosePayment(user, PART_PAID);
    await complete(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/greater than zero/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('CheckoutModal full udhaar', () => {
  it('is not offered to a walk-in, and says who it is for', () => {
    setup();

    expect(screen.queryByRole('radio', { name: FULL_UDHAAR })).not.toBeInTheDocument();
    expect(screen.getByText(/full udhaar is for registered udhaar customers/i)).toBeInTheDocument();
  });

  it('appears once an udhaar customer is chosen, and pays nothing now', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await chooseBilal(user);
    await choosePayment(user, FULL_UDHAAR);
    await complete(user);

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: bilal.id, paymentMethod: 'Credit', amountPaid: 0 }),
      ),
    );
  });
});

describe('CheckoutModal walk-in part payment', () => {
  it('takes a name and phone, records them, and sells to that record', async () => {
    const user = userEvent.setup();
    const { onCreateCustomer, onConfirm } = setup();

    await choosePayment(user, PART_PAID);
    await user.clear(screen.getByLabelText(/paid now/i));
    await user.type(screen.getByLabelText(/paid now/i), '1000');
    await user.type(screen.getByLabelText(/customer name/i), 'Asif');
    await user.type(screen.getByLabelText(/phone number/i), '03211234567');
    await complete(user);

    await waitFor(() => expect(onCreateCustomer).toHaveBeenCalledWith('Asif', '03211234567'));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 9, paymentMethod: 'Partial', amountPaid: 1000, customerMobile: '03211234567' }),
      ),
    );
  });

  it('refuses it without a phone number — the rest could never be collected', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCreateCustomer } = setup();

    await choosePayment(user, PART_PAID);
    await user.clear(screen.getByLabelText(/paid now/i));
    await user.type(screen.getByLabelText(/paid now/i), '1000');
    await user.type(screen.getByLabelText(/customer name/i), 'Asif');
    await complete(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/phone number/i);
    expect(onCreateCustomer).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('CheckoutModal credit authority', () => {
  it('offers staff with no say over credit neither udhaar nor part payment, and says why', () => {
    setup({ canSellOnCredit: false });

    expect(screen.queryByRole('radio', { name: FULL_UDHAAR })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: PART_PAID })).not.toBeInTheDocument();
    expect(screen.getByText(/only the owner can approve udhaar/i)).toBeInTheDocument();
  });
});

describe('CheckoutModal — the shopkeeper at the counter', () => {
  it('may take a part payment from a walk-in, with their name and phone', async () => {
    const user = userEvent.setup();
    const { onCreateCustomer, onConfirm } = setup({ canSellOnCredit: false, canTakePartPayment: true });

    await choosePayment(user, PART_PAID);
    await user.clear(screen.getByLabelText(/paid now/i));
    await user.type(screen.getByLabelText(/paid now/i), '1000');
    await user.type(screen.getByLabelText(/customer name/i), 'Asif');
    await user.type(screen.getByLabelText(/phone number/i), '03211234567');
    await complete(user);

    await waitFor(() => expect(onCreateCustomer).toHaveBeenCalledWith('Asif', '03211234567'));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'Partial', amountPaid: 1000 })),
    );
  });

  it('may take a part payment from an udhaar customer — but never the whole bill on udhaar', async () => {
    const user = userEvent.setup();
    setup({ canSellOnCredit: false, canTakePartPayment: true });

    await chooseBilal(user);

    expect(screen.getByRole('radio', { name: PART_PAID })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: FULL_UDHAAR })).not.toBeInTheDocument();
    expect(screen.getByText(/only the owner can put the whole bill on udhaar/i)).toBeInTheDocument();
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
