import { useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '@/types/api';
import { formatPkr, roundMoney } from '@/lib/money';
import type { Product } from '@/features/products/productApi';

export interface PurchaseFormValues {
  supplierId: number;
  productId: number;
  unitCost: number;
  quantity: number;
  /** What a walk-in pays. Required the first time a product is stocked. */
  newRetailPrice?: number;
  /** What a bulk buyer pays. Optional — a wholesale sale falls back to the retail price. */
  newWholesalePrice?: number;
}

export interface PurchaseFormProps {
  product: Product;
  suppliers: Array<{ id: number; name: string }>;
  onSubmit: (values: PurchaseFormValues) => Promise<void>;
}

/**
 * Records stock received from a supplier — and, with it, what the goods cost and what they sell
 * for.
 *
 * <p><b>This is where a product becomes sellable.</b> The Products screen creates a catalogue
 * entry with nothing on the shelf and no price; the first delivery supplies the cost, both
 * selling prices and the quantity, all in one transaction. So the prices are ordinary fields
 * here, not something tucked behind a "the cost changed" notice.</p>
 *
 * <p>On a repeat delivery they arrive prefilled with what the shop already charges: leave them
 * and nothing moves, change them and the new price applies to every unit on hand, including
 * stock bought earlier at a different cost (FR-011a, FR-011d).</p>
 */
export function PurchaseForm({ product, suppliers, onSubmit }: PurchaseFormProps) {
  const currentCost = product.costPrice ?? 0;

  const [supplierId, setSupplierId] = useState<number>(suppliers[0]?.id ?? 0);
  const [unitCost, setUnitCost] = useState<number>(currentCost);
  const [quantity, setQuantity] = useState<number>(1);
  // Has this product ever been stocked? A product with no selling price has never had a
  // delivery, and this is the one that has to state a price.
  const isFirstStocking = (product.salePrice ?? 0) <= 0;

  const [retailPrice, setRetailPrice] = useState<number>(product.salePrice ?? 0);
  const [wholesalePrice, setWholesalePrice] = useState<number>(product.wholesalePrice ?? 0);
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

    if (!Number.isFinite(retailPrice) || retailPrice < 0) {
      next.retailPrice = 'Retail price cannot be negative.';
    } else if (isFirstStocking && retailPrice <= 0) {
      // Mirrors the server. Stocking without pricing would put units on the shelf that the
      // counter quotes at zero.
      next.retailPrice = 'Set the retail price — it is what makes this product sellable.';
    }

    if (!Number.isFinite(wholesalePrice) || wholesalePrice < 0) {
      next.wholesalePrice = 'Wholesale price cannot be negative.';
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
        newRetailPrice: retailPrice,
        newWholesalePrice: wholesalePrice,
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

      {/* Always visible, never tucked behind a condition: on a first delivery these are what
          make the product sellable, and on a repeat one they are what the shop charges today. */}
      <fieldset className="purchase-form__prices">
        <legend>Selling prices</legend>

        {isFirstStocking && (
          <p className="field__hint">
            This product has no price yet. What you set here is what the counter will quote.
          </p>
        )}

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
          <small className="field__hint">
            What a bulk buyer pays. Leave at 0 if you do not sell this wholesale — a wholesale
            sale then uses the retail price.
          </small>
          {errors.wholesalePrice && <span className="field-error">{errors.wholesalePrice}</span>}
        </div>

        {!isFirstStocking && (
          <small className="field__hint">
            Changing a price here applies it to <strong>every unit on hand</strong>, including
            stock bought earlier.
          </small>
        )}
      </fieldset>

      {costChanged && !isFirstStocking && (
        <div className="purchase-form__notice" role="note">
          <p>
            The cost of <strong>all {product.quantityOnHand + quantity} units</strong> on hand will
            become {formatPkr(unitCost)}, including stock bought earlier at {formatPkr(currentCost)}.
          </p>
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
