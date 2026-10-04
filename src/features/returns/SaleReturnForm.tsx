import { useMemo, useState, type FormEvent } from 'react';
import { formatPkr, roundMoney } from '@/lib/money';
import { ApiError } from '@/types/api';
import { PAYMENT_METHODS, type PaymentMethod } from '@/features/pos/posApi';
import { ProofFileField } from '@/features/proofs/ProofFileField';
import { needsProof } from '@/features/proofs/proofApi';

export interface ReturnableLine {
  invoiceItemId: number;
  productName: string;
  quantitySold: number;
  quantityReturned: number;
  quantityAvailable: number;
  /** What was billed per unit, before any discount — shown for context only. */
  unitSalePrice: number;
  /**
   * What one unit is worth back: the billed price less this line's share of the invoice's
   * discount. Every figure on this form is built from THIS, because it is what the server
   * refunds — pricing the form at unitSalePrice is what produced "returning 600 exceeds the
   * invoice's remaining value of 590" on a sale the customer only ever paid 590 for.
   */
  refundPerUnit: number;
  /** Billed price less refund price. Zero on an undiscounted sale, and then hidden. */
  discountPerUnit: number;
}

export interface SaleReturnFormProps {
  invoiceNumber: string;
  /** What the customer still owes on this invoice, if anything. */
  amountRemaining: number;
  lines: ReturnableLine[];
  /**
   * `refundMethod` is null when nothing is refunded — the return only reduces what the customer
   * owes. Whenever money goes back it is required: day close subtracts only cash refunds.
   */
  onSubmit: (
    items: Array<{ invoiceItemId: number; quantity: number }>,
    reason: string | null,
    refundMethod: PaymentMethod | null,
    /** A transfer refund's screenshot, chosen as the return is recorded. Null when none was. */
    proofFile: File | null,
  ) => Promise<void>;
}

/** The real ways to hand money back. Credit and Partial describe an unpaid sale. */
const REFUND_METHODS = PAYMENT_METHODS.filter(
  (method) => method.value !== 'Credit' && method.value !== 'Partial',
);

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
  // Starts unanswered: assuming Cash showed every JazzCash refund as the drawer running over.
  const [refundMethod, setRefundMethod] = useState<PaymentMethod | ''>('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const returnable = (line: ReturnableLine) => Math.max(0, line.quantityAvailable);

  const totals = useMemo(() => {
    const total = lines.reduce((sum, line) => {
      const qty = quantities[line.invoiceItemId] ?? 0;
      return sum + line.refundPerUnit * qty;
    }, 0);

    // What the goods were listed at, and the adjustment between that and the refund. Both are
    // shown: the shopkeeper tells the customer "600 item, 25 discount, so 575 back".
    const billed = lines.reduce((sum, line) => {
      const qty = quantities[line.invoiceItemId] ?? 0;
      return sum + line.unitSalePrice * qty;
    }, 0);

    const rounded = roundMoney(total);

    // Anything beyond what is still owed comes back to the customer as cash (FR-028).
    const reducesBalance = Math.min(rounded, amountRemaining);

    return {
      billed: roundMoney(billed),
      discount: roundMoney(billed - total),
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

    const refunds = totals.refundDue > 0;

    if (refunds && refundMethod === '') {
      setFormError('Say how the refund was handed back — cash, bank transfer, JazzCash…');
      return;
    }

    setIsSaving(true);

    try {
      await onSubmit(
        items,
        reason.trim() || null,
        refunds ? (refundMethod as PaymentMethod) : null,
        refunds && needsProof(refundMethod) ? proofFile : null,
      );
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
            <th scope="col">Price</th>
            <th scope="col">Discount</th>
            <th scope="col">Refund per unit</th>
            <th scope="col">Return now</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const max = returnable(line);
            const qty = quantities[line.invoiceItemId] ?? 0;

            return (
              <tr key={line.invoiceItemId}>
                <td>{line.productName}</td>
                <td>{line.quantitySold}</td>
                <td>{line.quantityReturned}</td>
                {/* Price, discount and refund each get their own column: the shopkeeper reads
                    the adjustment off the row and explains it, rather than wondering why the
                    refund differs from the price on the receipt. */}
                <td className="numeric">{formatPkr(line.unitSalePrice)}</td>
                <td className="numeric" data-testid={`line-discount-${line.invoiceItemId}`}>
                  {line.discountPerUnit > 0 ? `− ${formatPkr(line.discountPerUnit)}` : '—'}
                </td>
                <td className="numeric">
                  <strong>{formatPkr(line.refundPerUnit)}</strong>
                </td>
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
                <td className="numeric" data-testid={`line-amount-${line.invoiceItemId}`}>
                  {formatPkr(roundMoney(line.refundPerUnit * qty))}
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
        {/* The whole adjustment, spelled out: listed at 600, 25 discount, 575 back. This IS the
            conversation at the counter, so it is stated rather than left to be inferred. */}
        <dt>Item value</dt>
        <dd data-testid="billed-total">{formatPkr(totals.billed)}</dd>

        {totals.discount > 0 && (
          <>
            <dt>Discount given on the sale</dt>
            <dd data-testid="discount-total">− {formatPkr(totals.discount)}</dd>
          </>
        )}

        <dt>Value returned</dt>
        <dd data-testid="return-total">{formatPkr(totals.total)}</dd>

        <dt>Reduces balance by</dt>
        <dd data-testid="reduces-balance">{formatPkr(totals.reducesBalance)}</dd>

        <dt>Refund owed to customer</dt>
        <dd data-testid="refund-due">{formatPkr(totals.refundDue)}</dd>
      </dl>

      {/* What to say to the customer, in words, before the money moves. */}
      {totals.discount > 0 && (
        <p className="return-form__notice" role="note" data-testid="discount-note">
          Tell the customer: this item is {formatPkr(totals.billed)}, but a{' '}
          {formatPkr(totals.discount)} discount was given on the sale — so{' '}
          {formatPkr(totals.total)} is adjusted, not {formatPkr(totals.billed)}.
        </p>
      )}

      {totals.refundDue > 0 && (
        <>
          <p className="return-form__notice" role="note">
            This sale was already paid, so {formatPkr(totals.refundDue)} is owed back to the customer.
          </p>

          <div className="field">
            <label htmlFor="refundMethod">Refunded by</label>
            <select
              id="refundMethod"
              value={refundMethod}
              onChange={(event) => setRefundMethod(event.target.value as PaymentMethod | '')}
            >
              <option value="" disabled>
                Choose how it was handed back
              </option>
              {REFUND_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
            <small className="field__hint">
              Only a cash refund is taken out of the drawer at day close. A transfer refund can
              carry its screenshot as proof.
            </small>
          </div>

          <ProofFileField id="refundProof" method={refundMethod} onFile={setProofFile} />
        </>
      )}

      <div className="form-actions">
        <button type="submit" disabled={!hasSelection || isSaving}>
          {isSaving ? 'Saving…' : 'Record return'}
        </button>
      </div>
    </form>
  );
}
