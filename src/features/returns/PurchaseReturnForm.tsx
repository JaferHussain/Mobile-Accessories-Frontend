import { useState, type FormEvent } from 'react';
import { formatPkr } from '@/lib/money';
import { ApiError } from '@/types/api';

export interface ReturnablePurchase {
  id: number;
  productName: string;
  quantity: number;
  returnedQty: number;
  unitCost: number;
}

export interface PurchaseReturnFormProps {
  purchase: ReturnablePurchase;
  onSubmit: (quantity: number, reason: string | null) => Promise<void>;
}

/**
 * Sends goods back to a supplier.
 *
 * One product per form, unlike a sale return's several lines — that is how a purchase is
 * recorded in this system (one product per purchase), so there is nothing to itemise here.
 * Capped at what is still returnable, the same rule a sale return follows (FR-026's purchase
 * counterpart), so the shopkeeper cannot enter a number the server will reject.
 */
export function PurchaseReturnForm({ purchase, onSubmit }: PurchaseReturnFormProps) {
  const returnable = Math.max(0, purchase.quantity - purchase.returnedQty);

  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function setCappedQuantity(value: number) {
    setQuantity(Math.max(0, Math.min(Number.isFinite(value) ? value : 0, returnable)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (quantity <= 0) {
      setFormError('Enter how many units are going back to the supplier.');
      return;
    }

    setIsSaving(true);

    try {
      await onSubmit(quantity, reason.trim() || null);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Could not record the return. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="return-form" onSubmit={handleSubmit} noValidate>
      <h2>Return {purchase.productName} to the supplier</h2>

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      <p className="modal__hint">
        Purchased {purchase.quantity}, already returned {purchase.returnedQty}.
      </p>

      <div className="field">
        <label htmlFor="purchaseReturnQuantity">Quantity</label>
        <input
          id="purchaseReturnQuantity"
          type="number"
          min="0"
          max={returnable}
          step="1"
          disabled={returnable === 0}
          value={String(quantity)}
          onChange={(event) => setCappedQuantity(Number(event.target.value))}
        />
        {returnable === 0 && <small className="field__hint">Fully returned</small>}
      </div>

      <div className="field">
        <label htmlFor="purchaseReturnReason">Reason</label>
        <input
          id="purchaseReturnReason"
          value={reason}
          placeholder="e.g. damaged in transit"
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <dl className="return-form__summary">
        <dt>Value returned</dt>
        <dd data-testid="return-total">{formatPkr(quantity * purchase.unitCost)}</dd>
      </dl>

      <div className="form-actions">
        <button type="submit" disabled={quantity <= 0 || isSaving}>
          {isSaving ? 'Saving…' : 'Record return'}
        </button>
      </div>
    </form>
  );
}
