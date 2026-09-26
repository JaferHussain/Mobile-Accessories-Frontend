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

/** Never stocked: no price, nothing on the shelf. What the Products screen now produces. */
const brandNew: Product = {
  ...product,
  id: 8,
  name: 'New Charger',
  salePrice: 0,
  costPrice: 0,
  quantityOnHand: 0,
};

const suppliers = [
  { id: 1, name: 'Ali Traders' },
  { id: 2, name: 'Bilal Distributors' },
];

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined), item: Product = product) {
  render(<PurchaseForm product={item} suppliers={suppliers} onSubmit={onSubmit} />);
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

  it('always offers both selling prices, prefilled from the product', () => {
    renderForm();

    // They used to hide behind an "also update the sale price" tick that only appeared once the
    // cost changed. Stocking is where a price is set now, so they are ordinary fields.
    expect(screen.getByLabelText('Retail price')).toHaveValue(1100);
    expect(screen.getByLabelText('Wholesale price')).toHaveValue(0);
  });

  it('warns that a price change reaches stock already on the shelf', () => {
    renderForm();

    expect(screen.getByText(/every unit on hand/i)).toBeInTheDocument();
  });
});

describe('PurchaseForm stocking a product for the first time', () => {
  it('says the product has no price yet', () => {
    renderForm(vi.fn(), brandNew);

    expect(screen.getByText(/no price yet/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Retail price')).toHaveValue(0);
  });

  it('refuses to stock it without a retail price', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(vi.fn().mockResolvedValue(undefined), brandNew);

    setNumber('Cost per unit', '800');
    setNumber('Quantity', '10');
    await user.click(screen.getByRole('button', { name: /record purchase/i }));

    // Stocking without pricing would put units on the shelf the counter quotes at zero. The
    // server refuses this too; the form catches it before the round trip.
    expect(await screen.findByText(/makes this product sellable/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts it once a retail price is given', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(vi.fn().mockResolvedValue(undefined), brandNew);

    setNumber('Cost per unit', '800');
    setNumber('Quantity', '10');
    setNumber('Retail price', '1100');
    await user.click(screen.getByRole('button', { name: /record purchase/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ unitCost: 800, quantity: 10, newRetailPrice: 1100 }),
      ),
    );
  });
});

describe('PurchaseForm submission', () => {
  it('submits supplier, product, cost, quantity and both prices', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    setNumber('Cost per unit', '850');
    setNumber('Quantity', '10');
    await user.click(screen.getByRole('button', { name: /record purchase/i }));

    // The prices go with every purchase, prefilled — leaving them alone sends what the shop
    // already charges, which the server treats as "no change".
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        supplierId: 1,
        productId: 7,
        unitCost: 850,
        quantity: 10,
        newRetailPrice: 1100,
        newWholesalePrice: 0,
      }),
    );
  });

  it('carries a changed selling price', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    setNumber('Cost per unit', '850');
    setNumber('Retail price', '1200');
    setNumber('Wholesale price', '1000');
    await user.click(screen.getByRole('button', { name: /record purchase/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ newRetailPrice: 1200, newWholesalePrice: 1000 }),
      ),
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
