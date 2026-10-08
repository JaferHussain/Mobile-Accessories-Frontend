import { useMemo, useState, type FormEvent } from 'react';
import { formatPkr, roundMoney } from '@/lib/money';
import type { Product } from '@/features/products/productApi';

/** One product on the bill being built. */
export interface BillLineValues {
  product: Product;
  unitCost: number;
  quantity: number;
  /** What a walk-in pays. Required the first time a product is stocked. */
  newRetailPrice: number;
  /** What a bulk buyer pays. 0: a wholesale sale uses the retail price. */
  newWholesalePrice: number;
}

export interface BillLineFormProps {
  product: Product;
  /** A line already on the bill, being changed. */
  initial?: BillLineValues;
  onAdd: (line: BillLineValues) => void;
  onCancel: () => void;
}

/**
 * One product on a supplier's bill — what it cost, how many came, and what it sells for.
 *
 * <p><b>This is where a product becomes sellable.</b> A catalogue entry has nothing on the shelf
 * and no price; its first delivery supplies the cost, both selling prices and the quantity. On a
 * repeat delivery the prices arrive prefilled with what the shop already charges: leave them and
 * nothing moves, change them and the new price applies to every unit on hand (FR-011a, FR-011d).</p>
 *
 * <p>Nothing is saved here — the line joins the bill, and the whole bill is saved at once.</p>
 */
export function BillLineForm({ product, initial, onAdd, onCancel }: BillLineFormProps) {
  const currentCost = product.costPrice ?? 0;
  // A product with no selling price has never had a delivery, and this one has to state a price.
  const isFirstStocking = (product.retailPrice ?? product.salePrice ?? 0) <= 0;

  const [unitCost, setUnitCost] = useState<number>(initial?.unitCost ?? currentCost);
  const [quantity, setQuantity] = useState<number>(initial?.quantity ?? 1);
  const [retailPrice, setRetailPrice] = useState<number>(initial?.newRetailPrice ?? product.retailPrice ?? product.salePrice ?? 0);
  const [wholesalePrice, setWholesalePrice] = useState<number>(initial?.newWholesalePrice ?? product.wholesalePrice ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const total = useMemo(() => roundMoney(unitCost * quantity), [unitCost, quantity]);
  const costChanged = roundMoney(unitCost) !== roundMoney(currentCost);

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      next.unitCost = 'Purchase cost must be greater than zero.';
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      next.quantity = 'Quantity must be a whole number greater than zero.';
    }

    if (!Number.isFinite(retailPrice) || retailPrice < 0) {
      next.retailPrice = 'Retail price cannot be negative.';
    } else if (isFirstStocking && retailPrice <= 0) {
      // Mirrors the server: stocking without pricing would put units on the shelf at zero.
      next.retailPrice = 'Set the retail price — it is what makes this product sellable.';
    }

    if (!Number.isFinite(wholesalePrice) || wholesalePrice < 0) {
      next.wholesalePrice = 'Wholesale price cannot be negative.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (validate()) {
      onAdd({ product, unitCost, quantity, newRetailPrice: retailPrice, newWholesalePrice: wholesalePrice });
    }
  }

  return (
    <form className="purchase-form bill-line-form" onSubmit={handleSubmit} noValidate>
      <h4>{product.name}</h4>

      <div className="bill-line-form__grid">
        <div className="field">
          <label htmlFor="unitCost">Cost per unit</label>
          <input
            id="unitCost"
            type="number"
            step="0.01"
            min="0"
            value={String(unitCost)}
            onChange={(event) => setUnitCost(Number(event.target.value))}
            aria-invalid={errors.unitCost !== undefined}
          />
          {errors.unitCost && <span className="field-error">{errors.unitCost}</span>}
        </div>

        <div className="field">
          <label htmlFor="quantity">Quantity</label>
          <input
            id="quantity"
            type="number"
            step="1"
            min="1"
            value={String(quantity)}
            onChange={(event) => setQuantity(Number(event.target.value))}
            aria-invalid={errors.quantity !== undefined}
          />
          {errors.quantity && <span className="field-error">{errors.quantity}</span>}
        </div>

        <div className="field">
          <label htmlFor="retailPrice">Retail price</label>
          <input
            id="retailPrice"
            type="number"
            step="0.01"
            min="0"
            value={String(retailPrice)}
            onChange={(event) => setRetailPrice(Number(event.target.value))}
            aria-invalid={errors.retailPrice !== undefined}
          />
          <small className="field__hint">What a walk-in customer pays.</small>
          {errors.retailPrice && <span className="field-error">{errors.retailPrice}</span>}
        </div>

        <div className="field">
          <label htmlFor="wholesalePrice">Wholesale price</label>
          <input
            id="wholesalePrice"
            type="number"
            step="0.01"
            min="0"
            value={String(wholesalePrice)}
            onChange={(event) => setWholesalePrice(Number(event.target.value))}
            aria-invalid={errors.wholesalePrice !== undefined}
          />
          <small className="field__hint">Leave at 0 if not sold wholesale — a wholesale sale then uses the retail price.</small>
          {errors.wholesalePrice && <span className="field-error">{errors.wholesalePrice}</span>}
        </div>
      </div>

      <p className="purchase-form__total" data-testid="purchase-total">
        Line total: {formatPkr(total)}
      </p>

      {isFirstStocking ? (
        <p className="field__hint">This product has no price yet. What you set here is what the counter will quote.</p>
      ) : (
        <small className="field__hint">
          Changing a price here applies it to <strong>every unit on hand</strong>, including stock bought earlier.
        </small>
      )}

      {costChanged && !isFirstStocking && (
        <div className="purchase-form__notice" role="note">
          <p>
            The cost of <strong>all {product.quantityOnHand + quantity} units</strong> on hand will become{' '}
            {formatPkr(unitCost)}, including stock bought earlier at {formatPkr(currentCost)}.
          </p>
        </div>
      )}

      <div className="form-actions">
        <button type="submit" className="button--primary">
          {initial ? 'Update line' : 'Add to bill'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
