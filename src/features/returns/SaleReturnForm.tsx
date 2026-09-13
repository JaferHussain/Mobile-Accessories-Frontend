import { useMemo, useState, type FormEvent } from 'react';
import { formatPkr, roundMoney } from '@/lib/money';
import { ApiError } from '@/types/api';

export interface ReturnableLine {
  invoiceItemId: number;
  productName: string;
  quantity: number;
  returnedQty: number;
  unitSalePrice: number;
}

export interface SaleReturnFormProps {
  invoiceNumber: string;
  /** What the customer still owes on this invoice, if anything. */
  amountRemaining: number;
  lines: ReturnableLine[];
  onSubmit: (items: Array<{ invoiceItemId: number; quantity: number }>, reason: string | null) => Promise<void>;
}

/**
 * Records goods coming back from a customer.
 *
 * Each line is capped at what is still returnable — the quantity sold less anything already
 * returned (FR-026) — so the shopkeeper cannot enter a number the server will reject.
 */
export function SaleReturnForm({
  invoiceNumber,
  amountRemaining,
  lines,
  onSubmit,
}: SaleReturnFormProps) {
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const returnable = (line: ReturnableLine) => Math.max(0, line.quantity - line.returnedQty);

  const totals = useMemo(() => {
    const total = lines.reduce((sum, line) => {
      const qty = quantities[line.invoiceItemId] ?? 0;
      return sum + line.unitSalePrice * qty;
    }, 0);

    const rounded = roundMoney(total);

    // Anything beyond what is still owed comes back to the customer as cash (FR-028).
    const reducesBalance = Math.min(rounded, amountRemaining);

    return {
      total: rounded,
      reducesBalance: roundMoney(reducesBalance),
      refundDue: roundMoney(rounded - reducesBalance),
    };
  }, [lines, quantities, amountRemaining]);

  const hasSelection = totals.total > 0;

  function setQuantity(line: ReturnableLine, value: number) {
    const capped = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, returnable(line)));

    setQuantities((current) => ({ ...current, [line.invoiceItemId]: capped }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const items = lines
      .map((line) => ({
        invoiceItemId: line.invoiceItemId,
        quantity: quantities[line.invoiceItemId] ?? 0,
      }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      setFormError('Select at least one item to return.');
      return;
    }

    setIsSaving(true);

    try {
      await onSubmit(items, reason.trim() || null);
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
      <h2>Return against {invoiceNumber}</h2>

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      <table className="return-form__lines">
        <caption className="visually-hidden">Items available to return</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Sold</th>
            <th scope="col">Already returned</th>
            <th scope="col">Return now</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const max = returnable(line);

            return (
              <tr key={line.invoiceItemId}>
                <td>{line.productName}</td>
                <td>{line.quantity}</td>
                <td>{line.returnedQty}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max={max}
                    step="1"
                    disabled={max === 0}
                    aria-label={`Return quantity for ${line.productName}`}
                    value={String(quantities[line.invoiceItemId] ?? 0)}
                    onChange={(event) => setQuantity(line, Number(event.target.value))}
                  />
                  {max === 0 && <small className="field__hint">Fully returned</small>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="field">
        <label htmlFor="returnReason">Reason</label>
        <input
          id="returnReason"
          value={reason}
          placeholder="e.g. faulty charger"
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <dl className="return-form__summary">
        <dt>Value returned</dt>
        <dd data-testid="return-total">{formatPkr(totals.total)}</dd>

        <dt>Reduces balance by</dt>
        <dd data-testid="reduces-balance">{formatPkr(totals.reducesBalance)}</dd>

        <dt>Refund owed to customer</dt>
        <dd data-testid="refund-due">{formatPkr(totals.refundDue)}</dd>
      </dl>

      {totals.refundDue > 0 && (
        <p className="return-form__notice" role="note">
          This sale was already paid, so {formatPkr(totals.refundDue)} is owed back to the customer.
        </p>
      )}

      <div className="form-actions">
        <button type="submit" disabled={!hasSelection || isSaving}>
          {isSaving ? 'Saving…' : 'Record return'}
        </button>
      </div>
    </form>
  );
}
