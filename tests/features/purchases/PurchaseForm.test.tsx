import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseForm } from '@/features/purchases/PurchaseForm';
import type { Product } from '@/features/products/productApi';
import { ApiError } from '@/types/api';

/** T073 — purchase total, and making the latest-cost rule visible before it is applied. */

const product: Product = {
  id: 7,
  name: 'Type-C Braided 2m',
  categoryId: 1,
  category: 'Cables',
  salePrice: 1100,
  quantityOnHand: 5,
  isLowStock: false,
  isActive: true,
  costPrice: 800,
  minStockThreshold: 3,
};

const suppliers = [
  { id: 1, name: 'Ali Traders' },
  { id: 2, name: 'Bilal Distributors' },
];

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(<PurchaseForm product={product} suppliers={suppliers} onSubmit={onSubmit} />);
  return onSubmit;
}

const setNumber = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('PurchaseForm totals', () => {
  it('shows the total as cost times quantity', () => {
    renderForm();

    setNumber('Cost per unit', '850');
    setNumber('Quantity', '10');

    expect(screen.getByTestId('purchase-total')).toHaveTextContent('Rs 8,500.00');
  });

  it('recalculates when the quantity changes', () => {
    renderForm();

    setNumber('Cost per unit', '800');
    setNumber('Quantity', '3');
    expect(screen.getByTestId('purchase-total')).toHaveTextContent('Rs 2,400.00');

    setNumber('Quantity', '4');
    expect(screen.getByTestId('purchase-total')).toHaveTextContent('Rs 3,200.00');
  });

  it('keeps paisa precision', () => {
    renderForm();

    setNumber('Cost per unit', '0.1');
    setNumber('Quantity', '3');

    expect(screen.getByTestId('purchase-total')).toHaveTextContent('Rs 0.30');
  });
});

describe('PurchaseForm cost rule visibility', () => {
  it('says nothing extra when the cost is unchanged', () => {
    renderForm();

    // Opens at the current cost of 800.
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('warns that a new cost applies to all stock on hand', () => {
    renderForm();

    setNumber('Cost per unit', '850');
    setNumber('Quantity', '10');

    const notice = screen.getByRole('note');

    // 5 on hand + 10 incoming = 15 units, all costed at 850 (FR-011a).
    expect(notice).toHaveTextContent('all 15 units');
    expect(notice).toHaveTextContent('Rs 850.00');
    expect(notice).toHaveTextContent('Rs 800.00');
  });

  it('warns on a cost decrease too', () => {
    renderForm();

    setNumber('Cost per unit', '780');

    expect(screen.getByRole('note')).toHaveTextContent('Rs 780.00');
  });

  it('offers to update the sale price only once the cost has changed', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.queryByLabelText(/also update the sale price/i)).not.toBeInTheDocument();

    setNumber('Cost per unit', '850');

    const toggle = screen.getByLabelText(/also update the sale price/i);
    await user.click(toggle);

    expect(screen.getByLabelText('New sale price')).toBeInTheDocument();
    expect(screen.getByText(/applies to every remaining unit/i)).toBeInTheDocument();
  });
});

describe('PurchaseForm submission', () => {
  it('submits supplier, product, cost and quantity', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    setNumber('Cost per unit', '850');
    setNumber('Quantity', '10');
    await user.click(screen.getByRole('button', { name: /record purchase/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        supplierId: 1,
        productId: 7,
        unitCost: 850,
        quantity: 10,
      }),
    );
  });

  it('includes the new sale price only when repricing was chosen', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    setNumber('Cost per unit', '850');
    await user.click(screen.getByLabelText(/also update the sale price/i));
    setNumber('New sale price', '1200');
    await user.click(screen.getByRole('button', { name: /record purchase/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ newSalePrice: 1200 })),
    );
  });

  it('rejects a zero cost', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    setNumber('Cost per unit', '0');
    await user.click(screen.getByRole('button', { name: /record purchase/i }));

    expect(await screen.findByText(/cost must be greater than zero/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a zero quantity', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    setNumber('Quantity', '0');
    await user.click(screen.getByRole('button', { name: /record purchase/i }));

    expect(await screen.findByText(/quantity must be a whole number/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a fractional quantity', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    setNumber('Quantity', '2.5');
    await user.click(screen.getByRole('button', { name: /record purchase/i }));

    expect(await screen.findByText(/whole number/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the server message when the purchase is refused', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError('NOT_FOUND', "Supplier '1' was not found.", 404));

    render(<PurchaseForm product={product} suppliers={suppliers} onSubmit={onSubmit} />);

    setNumber('Cost per unit', '850');
    await user.click(screen.getByRole('button', { name: /record purchase/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/was not found/i);
  });

  it('lets the shopkeeper choose a different supplier', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await user.selectOptions(screen.getByLabelText('Supplier'), '2');
    setNumber('Cost per unit', '850');
    await user.click(screen.getByRole('button', { name: /record purchase/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ supplierId: 2 })),
    );
  });
});
