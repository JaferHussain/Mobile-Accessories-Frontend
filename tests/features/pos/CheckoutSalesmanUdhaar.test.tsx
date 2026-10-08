import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckoutModal } from '@/features/pos/CheckoutModal';
import type { CustomerSummary } from '@/features/pos/posApi';

/**
 * The field salesman at checkout: udhaar and part payment only to the owner's udhaar customers.
 *
 * <p>The server refuses anything else regardless — this is so the salesman is never offered a
 * choice that would only be refused, and knows why when it is not there.</p>
 */

const udhaarShop: CustomerSummary = { id: 5, name: 'Rehman Mobiles', outstandingBalance: 4200, creditAllowed: true };

function setup() {
  const onConfirm = vi.fn().mockResolvedValue(undefined);

  render(
    <CheckoutModal
      total={2000}
      canSellOnCredit={false}
      udhaarCustomersOnly
      onSearchCustomers={vi.fn(async () => [udhaarShop])}
      onCreateCustomer={vi.fn()}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  );

  return { onConfirm };
}

describe('a field salesman at checkout', () => {
  it('is offered neither udhaar nor part payment for a walk-in, and is told why', () => {
    setup();

    expect(screen.queryByRole('radio', { name: /credit \(udhaar\)/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /part paid/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only for the owner.s udhaar customers/i)).toBeInTheDocument();
  });

  it('is offered udhaar once one of the owner’s udhaar customers is chosen', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await user.click(screen.getByRole('radio', { name: /udhaar customer/i }));
    await user.type(screen.getByLabelText(/find customer/i), 'rehman');
    await user.click(screen.getByRole('button', { name: /^find$/i }));
    await user.click(within(await screen.findByTestId('customer-option-5')).getByRole('button', { name: /select/i }));

    await user.click(screen.getByRole('radio', { name: /credit \(udhaar\)/i }));
    await user.click(screen.getByRole('button', { name: /complete sale/i }));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ customerId: 5, paymentMethod: 'Credit', amountPaid: 0 })),
    );
  });
});
