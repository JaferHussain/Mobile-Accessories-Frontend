import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseReturnForm } from '@/features/returns/PurchaseReturnForm';
import { ApiError } from '@/types/api';

/**
 * Sending goods back to a supplier — one product per purchase, unlike a sale return's several
 * lines, because that is how a purchase is recorded (FR-006 in the purchases module).
 */

const purchase = {
  id: 501,
  productName: 'Type-C Braided 2m',
  quantity: 20,
  returnedQty: 5,
  unitCost: 800,
};

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(<PurchaseReturnForm purchase={purchase} onSubmit={onSubmit} />);

  return onSubmit;
}

describe('PurchaseReturnForm', () => {
  it('caps the quantity at what is still returnable', async () => {
    renderForm();

    const input = screen.getByLabelText(/quantity/i);

    expect(input).toHaveAttribute('max', '15');
  });

  it('shows the value at stake as the quantity changes', async () => {
    renderForm();

    await userEvent.clear(screen.getByLabelText(/quantity/i));
    await userEvent.type(screen.getByLabelText(/quantity/i), '5');

    expect(screen.getByTestId('return-total')).toHaveTextContent('4,000');
  });

  it('sends the quantity and reason on submit', async () => {
    const onSubmit = renderForm();

    await userEvent.clear(screen.getByLabelText(/quantity/i));
    await userEvent.type(screen.getByLabelText(/quantity/i), '3');
    await userEvent.type(screen.getByLabelText(/reason/i), 'Damaged in transit');
    await userEvent.click(screen.getByRole('button', { name: /record return/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(3, 'Damaged in transit'));
  });

  it('refuses to submit a quantity of zero', async () => {
    const onSubmit = renderForm();

    await userEvent.clear(screen.getByLabelText(/quantity/i));
    await userEvent.click(screen.getByRole('button', { name: /record return/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reports a server error without crashing', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError('NOT_FOUND', 'Purchase not found.', 404));
    renderForm(onSubmit);

    await userEvent.clear(screen.getByLabelText(/quantity/i));
    await userEvent.type(screen.getByLabelText(/quantity/i), '1');
    await userEvent.click(screen.getByRole('button', { name: /record return/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Purchase not found.');
  });

  it('is fully disabled once everything has already been returned', () => {
    render(
      <PurchaseReturnForm
        purchase={{ ...purchase, returnedQty: 20 }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/quantity/i)).toBeDisabled();
    expect(screen.getByText(/fully returned/i)).toBeInTheDocument();
  });
});
