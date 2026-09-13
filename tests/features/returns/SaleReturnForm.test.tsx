import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SaleReturnForm, type ReturnableLine } from '@/features/returns/SaleReturnForm';
import { ApiError } from '@/types/api';

/** T120 — the return form caps each line at what is still returnable (FR-026). */

const lines: ReturnableLine[] = [
  {
    invoiceItemId: 11,
    productName: 'Type-C Braided 2m',
    quantity: 3,
    returnedQty: 1,
    unitSalePrice: 1100,
  },
  {
    invoiceItemId: 12,
    productName: 'Earbuds Pro',
    quantity: 1,
    returnedQty: 1,
    unitSalePrice: 2500,
  },
];

function renderForm(
  onSubmit = vi.fn().mockResolvedValue(undefined),
  amountRemaining = 2200,
) {
  render(
    <SaleReturnForm
      invoiceNumber="INV-2026-000001"
      amountRemaining={amountRemaining}
      lines={lines}
      onSubmit={onSubmit}
    />,
  );

  return onSubmit;
}

const setQty = (product: string, value: string) =>
  fireEvent.change(screen.getByLabelText(`Return quantity for ${product}`), {
    target: { value },
  });

describe('SaleReturnForm', () => {
  it('names the invoice being returned against', () => {
    renderForm();

    expect(screen.getByRole('heading', { name: /INV-2026-000001/ })).toBeInTheDocument();
  });

  it('shows how many were sold and how many already came back', () => {
    renderForm();

    const row = screen.getByText('Type-C Braided 2m').closest('tr')!;

    expect(row).toHaveTextContent('3');
    expect(row).toHaveTextContent('1');
  });

  it('caps a line at what is still returnable', () => {
    renderForm();

    // 3 sold, 1 already returned -> at most 2 more.
    setQty('Type-C Braided 2m', '5');

    expect(screen.getByLabelText('Return quantity for Type-C Braided 2m')).toHaveValue(2);
  });

  it('disables a fully returned line', () => {
    renderForm();

    expect(screen.getByLabelText('Return quantity for Earbuds Pro')).toBeDisabled();
    expect(screen.getByText('Fully returned')).toBeInTheDocument();
  });

  it('refuses a negative quantity', () => {
    renderForm();

    setQty('Type-C Braided 2m', '-2');

    expect(screen.getByLabelText('Return quantity for Type-C Braided 2m')).toHaveValue(0);
  });

  it('totals the value being returned', () => {
    renderForm();

    setQty('Type-C Braided 2m', '2');

    expect(screen.getByTestId('return-total')).toHaveTextContent('Rs 2,200.00');
  });
});

describe('SaleReturnForm balance versus refund', () => {
  it('reduces the balance when the customer still owes', () => {
    renderForm(vi.fn(), 2200);

    setQty('Type-C Braided 2m', '2');

    expect(screen.getByTestId('reduces-balance')).toHaveTextContent('Rs 2,200.00');
    expect(screen.getByTestId('refund-due')).toHaveTextContent('Rs 0.00');
  });

  it('owes a refund when the sale was already paid', () => {
    renderForm(vi.fn(), 0);

    setQty('Type-C Braided 2m', '2');

    // FR-028: the money was handed over, so it must come back — not silently vanish.
    expect(screen.getByTestId('refund-due')).toHaveTextContent('Rs 2,200.00');
    expect(screen.getByRole('note')).toHaveTextContent(/owed back to the customer/i);
  });

  it('splits between balance and refund on a partly paid sale', () => {
    renderForm(vi.fn(), 500);

    setQty('Type-C Braided 2m', '2');

    expect(screen.getByTestId('reduces-balance')).toHaveTextContent('Rs 500.00');
    expect(screen.getByTestId('refund-due')).toHaveTextContent('Rs 1,700.00');
  });

  it('says nothing about a refund when none is owed', () => {
    renderForm(vi.fn(), 5000);

    setQty('Type-C Braided 2m', '1');

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('SaleReturnForm submission', () => {
  it('cannot be submitted with nothing selected', () => {
    renderForm();

    expect(screen.getByRole('button', { name: /record return/i })).toBeDisabled();
  });

  it('submits only the lines with a quantity', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    setQty('Type-C Braided 2m', '2');
    await user.click(screen.getByRole('button', { name: /record return/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([{ invoiceItemId: 11, quantity: 2 }], null),
    );
  });

  it('passes the reason along', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    setQty('Type-C Braided 2m', '1');
    await user.type(screen.getByLabelText('Reason'), 'Faulty charger');
    await user.click(screen.getByRole('button', { name: /record return/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        [{ invoiceItemId: 11, quantity: 1 }],
        'Faulty charger',
      ),
    );
  });

  it('shows the server message when the return is refused', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        new ApiError('RETURN_EXCEEDS_ORIGINAL', 'Cannot return 5: 3 were recorded.', 400),
      );

    renderForm(onSubmit);

    setQty('Type-C Braided 2m', '2');
    await user.click(screen.getByRole('button', { name: /record return/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot return 5/i);
  });
});
