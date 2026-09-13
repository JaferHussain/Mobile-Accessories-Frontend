import { useState, type FormEvent } from 'react';
import { ApiError, ErrorCodes } from '@/types/api';
import { formatPkr } from '@/lib/money';
import { PAYMENT_METHODS, type PaymentMethod } from '@/features/pos/posApi';

export interface ReceivePaymentModalProps {
  customerName: string;
  outstandingBalance: number;
  onReceive: (
    amount: number,
    method: PaymentMethod,
    note: string | null,
    confirmOverpayment: boolean,
  ) => Promise<void>;
  onCancel: () => void;
}

/**
 * Records money handed over against an outstanding balance (FR-021).
 *
 * Taking more than is owed is possible but never accidental: the server refuses it, and this
 * form turns that refusal into an explicit confirmation the shopkeeper has to make (FR-022).
 */
export function ReceivePaymentModal({
  customerName,
  outstandingBalance,
  onReceive,
  onCancel,
}: ReceivePaymentModalProps) {
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsOverpaymentConfirmation, setNeedsOverpaymentConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const exceedsBalance = amount > outstandingBalance;

  async function submit(confirmOverpayment: boolean) {
    setFormError(null);

    if (!Number.isFinite(amount) || amount <= 0) {
      setAmountError('Payment amount must be greater than zero.');
      return;
    }

    setAmountError(null);
    setIsSaving(true);

    try {
      await onReceive(amount, method, note.trim() || null, confirmOverpayment);
    } catch (error) {
      if (error instanceof ApiError && error.code === ErrorCodes.OverpaymentNotConfirmed) {
        setNeedsOverpaymentConfirmation(true);
        setFormError(error.message);
      } else {
        setFormError(
          error instanceof ApiError ? error.message : 'Could not record the payment. Please try again.',
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(false);
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="receive-payment-title">
      <form className="modal__panel" onSubmit={handleSubmit} noValidate>
        <h3 id="receive-payment-title">Receive payment</h3>
        <p className="modal__hint">
          {customerName} owes {formatPkr(outstandingBalance)}.
        </p>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <div className="field">
          <label htmlFor="paymentAmount">Amount received</label>
          <input
            id="paymentAmount"
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={String(amount)}
            onChange={(event) => {
              setAmount(Number(event.target.value));
              setNeedsOverpaymentConfirmation(false);
            }}
            aria-invalid={amountError !== null}
          />
          {amountError && <span className="field-error">{amountError}</span>}
          {exceedsBalance && !amountError && (
            <small className="field__hint">
              This is more than {customerName} owes. You will be asked to confirm.
            </small>
          )}
        </div>

        <div className="field">
          <label htmlFor="paymentMethodModal">Method</label>
          <select
            id="paymentMethodModal"
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.filter((m) => m.value !== 'Credit' && m.value !== 'Partial').map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="paymentNote">Note</label>
          <input id="paymentNote" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>

        <div className="form-actions">
          {needsOverpaymentConfirmation ? (
            <button type="button" disabled={isSaving} onClick={() => void submit(true)}>
              Yes, accept the extra
            </button>
          ) : (
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Record payment'}
            </button>
          )}

          <button type="button" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
