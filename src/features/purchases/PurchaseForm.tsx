import { useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '@/types/api';
import { formatPkr, roundMoney } from '@/lib/money';
import type { Product } from '@/features/products/productApi';

export interface PurchaseFormValues {
  supplierId: number;
  productId: number;
  unitCost: number;
  quantity: number;
  newSalePrice?: number;
}

export interface PurchaseFormProps {
  product: Product;
  suppliers: Array<{ id: number; name: string }>;
  onSubmit: (values: PurchaseFormValues) => Promise<void>;
}

/**
 * Records stock received from a supplier.
 *
 * The form makes the shop's costing rule visible rather than surprising: when the entered cost
 * differs from the product's current cost, it says plainly that the new cost will apply to every
 * unit on hand, and offers to update the sale price at the same time (FR-011a, FR-011d).
 */
export function PurchaseForm({ product, suppliers, onSubmit }: PurchaseFormProps) {
  const currentCost = product.costPrice ?? 0;

  const [supplierId, setSupplierId] = useState<number>(suppliers[0]?.id ?? 0);
  const [unitCost, setUnitCost] = useState<number>(currentCost);
  const [quantity, setQuantity] = useState<number>(1);
  const [repriceEnabled, setRepriceEnabled] = useState(false);
  const [newSalePrice, setNewSalePrice] = useState<number>(product.salePrice);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = useMemo(() => roundMoney(unitCost * quantity), [unitCost, quantity]);

  const costChanged = roundMoney(unitCost) !== roundMoney(currentCost);

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!supplierId) {
      next.supplierId = 'Choose a supplier.';
    }

    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      next.unitCost = 'Purchase cost must be greater than zero.';
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      next.quantity = 'Quantity must be a whole number greater than zero.';
    }

    if (repriceEnabled && (!Number.isFinite(newSalePrice) || newSalePrice < 0)) {
      next.newSalePrice = 'Sale price cannot be negative.';
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        supplierId,
        productId: product.id,
        unitCost,
        quantity,
        ...(repriceEnabled ? { newSalePrice } : {}),
      });
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Could not record the purchase. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="purchase-form" onSubmit={handleSubmit} noValidate>
      <h2>Record purchase — {product.name}</h2>

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      <div className="field">
        <label htmlFor="supplierId">Supplier</label>
        <select
          id="supplierId"
          value={supplierId}
          onChange={(event) => setSupplierId(Number(event.target.value))}
        >
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        {errors.supplierId && <span className="field-error">{errors.supplierId}</span>}
      </div>

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

      <p className="purchase-form__total" data-testid="purchase-total">
        Total: {formatPkr(total)}
      </p>

      {costChanged && (
        <div className="purchase-form__notice" role="note">
          <p>
            The cost of <strong>all {product.quantityOnHand + quantity} units</strong> on hand will
            become {formatPkr(unitCost)}, including stock bought earlier at {formatPkr(currentCost)}.
          </p>

          <label htmlFor="repriceEnabled">
            <input
              id="repriceEnabled"
              type="checkbox"
              checked={repriceEnabled}
              onChange={(event) => setRepriceEnabled(event.target.checked)}
            />
            Also update the sale price
          </label>

          {repriceEnabled && (
            <div className="field">
              <label htmlFor="newSalePrice">New sale price</label>
              <input
                id="newSalePrice"
                type="number"
                step="0.01"
                min="0"
                value={String(newSalePrice)}
                onChange={(event) => setNewSalePrice(Number(event.target.value))}
                aria-invalid={errors.newSalePrice !== undefined}
              />
              <small className="field__hint">
                Applies to every remaining unit, including older stock.
              </small>
              {errors.newSalePrice && <span className="field-error">{errors.newSalePrice}</span>}
            </div>
          )}
        </div>
      )}

      <div className="form-actions">
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Record purchase'}
        </button>
      </div>
    </form>
  );
}
