import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BillLineForm } from '@/features/purchases/BillLineForm';
import type { Product } from '@/features/products/productApi';

/**
 * One product on a supplier's bill: what it cost, how many came, what it sells for. The rules the
 * old one-product purchase form carried live here now — the line total, the latest-cost warning,
 * and the price a first delivery must set.
 */

const stocked: Product = {
  id: 1,
  name: 'Type-C Cable',
  categoryId: 7,
  category: 'Cables',
  salePrice: 1100,
  retailPrice: 1100,
  wholesalePrice: 950,
  costPrice: 800,
  quantityOnHand: 10,
  isLowStock: false,
  isActive: true,
};

const neverStocked: Product = { ...stocked, id: 2, name: 'New Charger', salePrice: 0, retailPrice: 0, wholesalePrice: 0, costPrice: 0, quantityOnHand: 0 };

function renderLine(product: Product = stocked) {
  const onAdd = vi.fn();
  render(<BillLineForm product={product} onAdd={onAdd} onCancel={vi.fn()} />);
  return onAdd;
}

const set = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('a line on the bill', () => {
  it('shows its total as cost times quantity, to the paisa', () => {
    renderLine();
    set(/cost per unit/i, '12.35');
    set(/^quantity/i, '3');

    expect(screen.getByTestId('purchase-total')).toHaveTextContent('Rs 37.05');
  });

  it('starts at the cost and prices the shop already has', () => {
    renderLine();

    expect(screen.getByLabelText(/cost per unit/i)).toHaveValue(800);
    expect(screen.getByLabelText(/retail price/i)).toHaveValue(1100);
    expect(screen.getByLabelText(/wholesale price/i)).toHaveValue(950);
  });

  it('warns that a new cost applies to every unit on hand — and says nothing when it is unchanged', () => {
    renderLine();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    set(/cost per unit/i, '850');
    set(/^quantity/i, '5');

    expect(screen.getByRole('note')).toHaveTextContent(/all 15 units/i);
  });

  it('adds itself to the bill with what was entered', async () => {
    const user = userEvent.setup();
    const onAdd = renderLine();

    set(/^quantity/i, '4');
    await user.click(screen.getByRole('button', { name: /add to bill/i }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ product: stocked, quantity: 4, unitCost: 800, newRetailPrice: 1100, newWholesalePrice: 950 }),
    );
  });

  it.each([
    ['0', '1', /cost must be greater than zero/i],
    ['800', '0', /whole number greater than zero/i],
    ['800', '1.5', /whole number greater than zero/i],
  ])('refuses cost %s and quantity %s', async (cost, quantity, message) => {
    const user = userEvent.setup();
    const onAdd = renderLine();

    set(/cost per unit/i, cost);
    set(/^quantity/i, quantity);
    await user.click(screen.getByRole('button', { name: /add to bill/i }));

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe('a product stocked for the first time', () => {
  it('says it has no price yet, and will not join the bill without a retail price', async () => {
    const user = userEvent.setup();
    const onAdd = renderLine(neverStocked);

    expect(screen.getByText(/no price yet/i)).toBeInTheDocument();

    set(/cost per unit/i, '500');
    await user.click(screen.getByRole('button', { name: /add to bill/i }));
    expect(screen.getByText(/set the retail price/i)).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    set(/retail price/i, '750');
    await user.click(screen.getByRole('button', { name: /add to bill/i }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ newRetailPrice: 750 }));
  });
});
