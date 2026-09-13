import { useState, type FormEvent } from 'react';
import { formatPkr } from '@/lib/money';
import { ApiError } from '@/types/api';

export interface OpeningBalanceFormProps {
  customer: { id: number; name: string; outstandingBalance: number };

  /**
   * The figure already on file, or null if this customer has never been through the paper
   * register. Null and 0 are different: a recorded zero makes the next save a correction.
   */
  openingBalance: number | null;

  onSubmit: (amount: number, reason: string | null) => Promise<void>;
  onCancel?: () => void;
}

/**
 * Records what a customer already owed before this software was in use (FR-065).
 *
 * The form's job beyond collecting a number is to make one thing unmistakable: saving a second
 * time **corrects** the figure rather than adding another debt. Whoever is typing is the person
 * who gets blamed if a customer's balance doubles, so the warning is shown before they save, not
 * as an error afterwards.
 */
export function OpeningBalanceForm({
  customer,
  openingBalance,
  onSubmit,
  onCancel,
}: OpeningBalanceFormProps) {
  const isCorrection = openingBalance !== null;

  const [amount, setAmount] = useState(String(openingBalance ?? ''));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const value = Number(amount);

    if (amount.trim() === '' || Number.isNaN(value)) {
      setError('Enter the amount this customer already owed.');
      return;
    }

    if (value < 0) {
      // The shop owing the customer is a different thing entirely (FR-069).
      setError('A carried-forward amount cannot be negative.');
      return;
    }

    // Mirrors the server rule so an obvious mistake costs no round trip; the server remains the
    // authority (FR-071).
    if (isCorrection && !reason.trim()) {
      setError('A reason is required when changing a carried-forward amount.');
      return;
    }

    setIsSaving(true);

    try {
      await onSubmit(value, reason.trim() || null);
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : 'Could not save that amount. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="panel panel--opening-balance" onSubmit={handleSubmit} noValidate>
      <h3>Amount brought forward — {customer.name}</h3>

      <p className="field__hint">
        What this customer already owed before this software, from the shop&apos;s paper register.
      </p>

      {isCorrection && (
        <p className="callout callout--warning">
          This customer already has {formatPkr(openingBalance)} brought forward. Saving{' '}
          <strong>corrects the existing figure</strong> — it does not add another debt.
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="field">
        <label htmlFor="openingBalanceAmount">Amount already owed</label>
        <input
          id="openingBalanceAmount"
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>

      {/* Only on a correction. A first recording is a statement of fact from the register and
          needs no justification. */}
      {isCorrection && (
        <div className="field">
          <label htmlFor="openingBalanceReason">Reason for the change</label>
          <input
            id="openingBalanceReason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Mistyped from the register"
          />
        </div>
      )}

      <div className="form-actions">
        <button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save amount'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
