import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PosScreen } from '@/features/pos/PosScreen';
import type { Product } from '@/features/products/productApi';
import type { CreateInvoiceResult } from '@/features/pos/posApi';

/**
 * What the counter does the moment a sale is saved.
 *
 * <p>The salesman's next customer is usually already waiting. So the cart clears and the screen is
 * ready <b>instantly</b>, with no click in between — the previous design made them dismiss a panel
 * containing a picture picker before they could sell again, which read as the screen being
 * stuck.</p>
 *
 * <p>The exception is a non-cash sale, whose banner carries the payment-proof upload and the
 * sharing actions. An auto-dismissing banner would take an unfinished action away with it.</p>
 */

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

const saved: CreateInvoiceResult = {
  invoiceId: 10,
  invoiceNumber: 'INV-2026-000010',
  subtotal: 1100,
  totalDiscount: 0,
  total: 1100,
  amountPaid: 1100,
  amountRemaining: 0,
  customerId: null,
  customerBalance: null,
};

function setup(overrides: Partial<Parameters<typeof PosScreen>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(saved);

  render(
    <PosScreen
      onFindProduct={vi.fn(async () => ({ kind: 'matches' as const, products: [cable] }))}
      onRepriceProduct={vi.fn(async () => cable.salePrice)}
      onSave={onSave}
      onCreateCustomer={vi.fn()}
      onSearchCustomers={vi.fn(async () => [])}
      canSellOnCredit
      {...overrides}
    />,
  );

  return { onSave };
}

async function sell(user: ReturnType<typeof userEvent.setup>, method?: RegExp) {
  await user.type(screen.getByLabelText(/scan or search/i), 'cable');
  await user.click(screen.getByRole('button', { name: 'Search' }));

  const result = await screen.findByTestId(`pos-result-${cable.id}`);
  await user.click(within(result).getByRole('button', { name: 'Add' }));

  await user.click(screen.getByRole('button', { name: /proceed to sale/i }));

  if (method) {
    await user.click(await screen.findByRole('radio', { name: method }));
  }

  await user.click(await screen.findByRole('button', { name: /complete sale/i }));
  await screen.findByText(/saved INV-2026-000010/i);
}

describe('the counter after a cash sale', () => {
  it('is ready for the next customer immediately, with no click', async () => {
    const user = userEvent.setup();
    setup();

    await sell(user);

    // No dismissing, no picture picker in the way. The cart is empty and the search is waiting.
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/scan or search/i)).toHaveValue('');
  });

  it('confirms the sale by name, so it is not silent', async () => {
    const user = userEvent.setup();
    setup();

    await sell(user);

    expect(screen.getByRole('status')).toHaveTextContent(/INV-2026-000010/);
  });

  it('lets the confirmation fade by itself', async () => {
    const user = userEvent.setup();
    // Long enough to be seen: `sell` waits for the "Saved" text by polling every 50 ms, so a
    // confirmation that lived only 50 ms could come and go between two looks and fail at random.
    setup({ confirmationVisibleMs: 400 });

    await sell(user);
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Cash is counted into the drawer: there is nothing left to do with this sale, so the
    // confirmation has no reason to stay.
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('can be sold again straight away', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await sell(user);
    await sell(user);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });
});

describe('the counter after a non-cash sale', () => {
  it('keeps the banner, because there is still something to do with it', async () => {
    const user = userEvent.setup();
    // The same short fade a cash sale would get — a non-cash banner must ignore it entirely.
    setup({ onUploadPaymentProof: vi.fn(), confirmationVisibleMs: 50 });

    await sell(user, /bank transfer/i);

    await new Promise((resolve) => setTimeout(resolve, 150));

    // The proof upload and the sharing actions live here; taking them away on a timer would
    // remove an unfinished job from under the salesman.
    expect(screen.getByText(/saved INV-2026-000010/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/payment proof/i)).toBeInTheDocument();
  });

  it('still clears the cart, so the next sale is not blocked', async () => {
    const user = userEvent.setup();
    setup({ onUploadPaymentProof: vi.fn() });

    await sell(user, /bank transfer/i);

    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it('can be dismissed when the salesman is done with it', async () => {
    const user = userEvent.setup();
    setup({ onUploadPaymentProof: vi.fn() });

    await sell(user, /bank transfer/i);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText(/saved INV-2026-000010/i)).not.toBeInTheDocument();
  });

  it('dismissing it leaves a sale already in progress alone', async () => {
    const user = userEvent.setup();
    setup({ onUploadPaymentProof: vi.fn() });

    await sell(user, /bank transfer/i);

    // Start the next sale while the previous banner is still up.
    await user.type(screen.getByLabelText(/scan or search/i), 'cable');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const result = await screen.findByTestId(`pos-result-${cable.id}`);
    await user.click(within(result).getByRole('button', { name: 'Add' }));

    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.getByTestId(`cart-line-${cable.id}`)).toBeInTheDocument();
  });
});

describe('sharing from the counter', () => {
  it('offers the bill to the customer on the spot', async () => {
    const user = userEvent.setup();
    setup({
      onFetchDocument: vi.fn(),
      onCreateShareLink: vi.fn(),
      onUploadPaymentProof: vi.fn(),
    });

    await sell(user, /bank transfer/i);

    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^share$/i }));
    expect(screen.getByRole('button', { name: /whatsapp/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sms/i })).toBeInTheDocument();
  });

  it('treats a walk-in as a walk-in, offering a number to send to', async () => {
    const user = userEvent.setup();
    setup({
      onFetchDocument: vi.fn(),
      onCreateShareLink: vi.fn(),
      onUploadPaymentProof: vi.fn(),
    });

    await sell(user, /bank transfer/i);

    // This sale had no customer, so there is no record to read a number from.
    await user.click(screen.getByRole('button', { name: /^share$/i }));
    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument();
  });
});
