import { useState, type FormEvent } from 'react';
import { ApiError } from '@/types/api';

export interface QuickCreateCustomerProps {
  onCreate: (name: string, mobileNumber: string | null) => Promise<void>;
  onCancel: () => void;
}

/**
 * Inline customer creation during a sale (FR-017).
 *
 * A sale that leaves money owed needs someone to owe it. Rather than making the shopkeeper
 * abandon the cart and go to the customers screen, this captures the two fields that matter and
 * returns them to the counter.
 */
export function QuickCreateCustomer({ onCreate, onCancel }: QuickCreateCustomerProps) {
  const [name, setName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setNameError('Customer name is required.');
      return;
    }

    setNameError(null);
    setIsSaving(true);

    try {
      await onCreate(name.trim(), mobileNumber.trim() || null);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Could not save the customer. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="quick-customer-title">
      <form className="modal__panel" onSubmit={handleSubmit} noValidate>
        <h3 id="quick-customer-title">New customer</h3>
        <p className="modal__hint">
          This sale leaves a balance owing, so it needs a customer on file.
        </p>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <div className="field">
          <label htmlFor="customerName">Name</label>
          <input
            id="customerName"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError !== null}
          />
          {nameError && <span className="field-error">{nameError}</span>}
        </div>

        <div className="field">
          <label htmlFor="customerMobile">Mobile number</label>
          <input
            id="customerMobile"
            inputMode="tel"
            value={mobileNumber}
            onChange={(event) => setMobileNumber(event.target.value)}
          />
          <small className="field__hint">Needed to send the receipt on WhatsApp.</small>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save customer'}
          </button>
          <button type="button" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
