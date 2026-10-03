import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckoutModal } from '@/features/pos/CheckoutModal';
import type { CustomerSummary } from '@/features/pos/posApi';

/**
 * The field salesman at checkout: udhaar only to the owner's udhaar customers.
 *
 * <p>The server refuses anything else regardless — this is so the salesman is never offered a
 * choice that would only be refused, and knows why when it is not there.</p>
 */

const udhaarShop: CustomerSummary = { id: 5, name: 'Rehman Mobiles', outstandingBalance: 4200, creditAllowed: true };
const newShop: CustomerSummary = { id: 6, name: 'City Phones', outstandingBalance: 0, creditAllowed: false };

function setup() {
  const onConfirm = vi.fn().mockResolvedValue(undefined);

  render(
    <CheckoutModal
      total={2000}
      canSellOnCredit={false}
      udhaarCustomersOnly
      onSearchCustomers={vi.fn(async () => [udhaarShop, newShop])}
      onCreateCustomer={vi.fn()}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  );

  return { onConfirm };
}

async function pick(user: ReturnType<typeof userEvent.setup>, customer: CustomerSummary) {
  await user.click(screen.getByRole('radio', { name: /existing customer/i }));
  await user.type(screen.getByLabelText(/find customer/i), 'shop');
  await user.click(screen.getByRole('button', { name: /^find$/i }));
  const option = await screen.findByTestId(`customer-option-${customer.id}`);
  await user.click(within(option).getByRole('button', { name: /select/i }));
}

describe('a field salesman at checkout', () => {
  it('is not offered udhaar for a walk-in, and is told why', () => {
    setup();

    expect(screen.queryByRole('radio', { name: /udhaar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only for the owner.s udhaar customers/i)).toBeInTheDocument();
  });

  it('is offered udhaar once one of the owner’s udhaar customers is chosen', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await pick(user, udhaarShop);
    await user.click(screen.getByRole('radio', { name: /udhaar/i }));
    await user.click(screen.getByRole('button', { name: /complete sale/i }));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ customerId: 5, paymentMethod: 'Credit', amountPaid: 0 })),
    );
  });

  it('is not offered udhaar for a customer the owner has not marked', async () => {
    const user = userEvent.setup();
    setup();

    await pick(user, newShop);

    expect(screen.queryByRole('radio', { name: /udhaar/i })).not.toBeInTheDocument();
  });

  it('marks the owner’s udhaar customers in the list', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('radio', { name: /existing customer/i }));
    await user.type(screen.getByLabelText(/find customer/i), 'shop');
    await user.click(screen.getByRole('button', { name: /^find$/i }));

    expect(within(await screen.findByTestId('customer-option-5')).getByText(/udhaar customer/i)).toBeInTheDocument();
    expect(within(screen.getByTestId('customer-option-6')).queryByText(/udhaar customer/i)).not.toBeInTheDocument();
  });
});
