import { useMemo, useState } from 'react';
import { formatPkr, roundMoney } from '@/lib/money';
import { ApiError } from '@/types/api';
import {
  FULLY_PAID_METHODS,
  paymentMethodsFor,
  type CustomerSummary,
  type PaymentMethod,
} from './posApi';

/**
 * The last step of a sale: who is buying, and how they are paying.
 *
 * These are the questions asked once, at the end — not while the cart is being built — so they
 * live here rather than cluttering the counter screen.
 *
 * <b>The existing-customer picker is the point of this component.</b> Before it, the counter
 * could only CREATE a customer, so selling to the same person twice on udhaar produced two
 * records with two balances, and the owner chasing a debt saw half of it. Searching first is
 * what stops that.
 */

export interface CheckoutDetails {
  customerId: number | null;
  paymentMethod: PaymentMethod;
  amountPaid: number;

  /**
   * Where a non-cash payment came from, and its reference. Null on a cash sale — the server
   * refuses a reference there, because money in the drawer came from no account.
   */
  paymentAccountNumber: string | null;
  paymentTransactionId: string | null;

  /**
   * The chosen customer's mobile number, so the receipt can offer to send them their bill
   * without a second lookup. Null for a walk-in, which is what tells the receipt to ask for one.
   */
  customerMobile: string | null;
}

export interface CheckoutModalProps {
  /** The bill being settled. The server recomputes it; this is what the customer is told. */
  total: number;
  canSellOnCredit: boolean;
  onSearchCustomers: (term: string) => Promise<CustomerSummary[]>;
  onCreateCustomer: (name: string, mobileNumber: string | null) => Promise<{ id: number; name: string }>;
  onConfirm: (details: CheckoutDetails) => Promise<void>;
  onCancel: () => void;
}

type CustomerMode = 'walkin' | 'existing' | 'new';

/** Methods that carry money from somewhere else, and so have an account behind them. */
const TRANSFER_METHODS: readonly PaymentMethod[] = [
  'BankTransfer',
  'JazzCash',
  'EasyPaisa',
  'Raast',
];

export function CheckoutModal({
  total,
  canSellOnCredit,
  onSearchCustomers,
  onCreateCustomer,
  onConfirm,
  onCancel,
}: CheckoutModalProps) {
  const [customerMode, setCustomerMode] = useState<CustomerMode>('walkin');
  const [selected, setSelected] = useState<CustomerSummary | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<CustomerSummary[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [newName, setNewName] = useState('');
  const [newMobile, setNewMobile] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [accountNumber, setAccountNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [paidNow, setPaidNow] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isTransfer = TRANSFER_METHODS.includes(paymentMethod);
  const isPartial = paymentMethod === 'Partial';
  const isCredit = paymentMethod === 'Credit';

  // Derived, never typed twice: a cash-type method settles the bill, udhaar pays nothing, and a
  // part payment is whatever the shopkeeper entered.
  const amountPaid = useMemo(() => {
    if (FULLY_PAID_METHODS.includes(paymentMethod)) {
      return roundMoney(total);
    }

    return isPartial ? roundMoney(paidNow) : 0;
  }, [paymentMethod, isPartial, paidNow, total]);

  const remaining = roundMoney(total - amountPaid);

  async function search() {
    const term = searchTerm.trim();

    if (term.length < 2) {
      setError('Type at least 2 letters to find a customer.');
      return;
    }

    setError(null);
    setIsSearching(true);

    try {
      setResults(await onSearchCustomers(term));
    } catch {
      setResults([]);
      setError('Could not search for that customer. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }

  /** Resolves who this sale belongs to, creating the record only if that is what was asked. */
  async function resolveCustomerId(): Promise<number | null> {
    if (customerMode === 'existing') {
      return selected?.id ?? null;
    }

    if (customerMode === 'new') {
      const created = await onCreateCustomer(newName.trim(), newMobile.trim() || null);

      return created.id;
    }

    return null;
  }

  function validate(): string | null {
    if (customerMode === 'new' && !newName.trim()) {
      return 'A new customer needs a name.';
    }

    if (customerMode === 'existing' && !selected) {
      return 'Find and select the customer, or choose walk-in.';
    }

    if (isPartial) {
      if (amountPaid <= 0) {
        return 'The amount paid now must be greater than zero.';
      }

      if (amountPaid >= total) {
        return 'A part payment must be less than the total. Choose a full payment method instead.';
      }
    }

    // A debt has to be owed by somebody. This mirrors the server, which refuses a sale that
    // leaves money outstanding with no customer attached (FR-017).
    if ((isCredit || isPartial) && customerMode === 'walkin') {
      return 'Udhaar and part payment must be attached to a customer — select or add one.';
    }

    return null;
  }

  async function handleConfirm() {
    const problem = validate();

    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const customerId = await resolveCustomerId();

      await onConfirm({
        customerId,
        customerMobile:
          customerMode === 'existing'
            ? (selected?.mobileNumber ?? null)
            : customerMode === 'new'
              ? newMobile.trim() || null
              : null,
        paymentMethod,
        amountPaid,
        // Only a transfer carries these. Sending them on a cash sale would be refused (422),
        // and blanks are sent as null so "not given" is one value rather than two.
        paymentAccountNumber: isTransfer ? accountNumber.trim() || null : null,
        paymentTransactionId: isTransfer ? transactionId.trim() || null : null,
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : 'Could not complete the sale. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <div className="modal__panel checkout">
        <h3 id="checkout-title">Complete sale</h3>

        <dl className="checkout__total">
          <dt>Total</dt>
          <dd data-testid="checkout-total">{formatPkr(total)}</dd>
        </dl>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <fieldset className="checkout__customer">
          <legend>Customer</legend>

          {(
            [
              ['walkin', 'Walk-in customer'],
              ['existing', 'Existing customer'],
              ['new', 'New customer'],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className="radio">
              <input
                type="radio"
                name="customerMode"
                checked={customerMode === mode}
                onChange={() => {
                  setCustomerMode(mode);
                  setError(null);
                }}
              />
              {label}
            </label>
          ))}

          {customerMode === 'existing' && (
            <div className="checkout__customer-search">
              <div className="field">
                <label htmlFor="customerSearch">Find customer</label>
                <input
                  id="customerSearch"
                  value={searchTerm}
                  placeholder="Name or mobile number"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void search();
                    }
                  }}
                />
              </div>

              <button type="button" disabled={isSearching} onClick={() => void search()}>
                {isSearching ? 'Searching…' : 'Find'}
              </button>

              {results?.length === 0 && <p className="field__hint">No customer found.</p>}

              {results && results.length > 0 && (
                <ul className="pick-list">
                  {results.map((found) => (
                    <li key={found.id} data-testid={`customer-option-${found.id}`}>
                      <span>{found.name}</span>
                      <span className="pick-list__meta">
                        {found.mobileNumber ?? 'no number'}
                        {/* What they already owe, before this sale adds to it. */}
                        {found.outstandingBalance > 0 &&
                          ` · owes ${formatPkr(found.outstandingBalance)}`}
                      </span>
                      <button type="button" onClick={() => setSelected(found)}>
                        {selected?.id === found.id ? 'Selected' : 'Select'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {selected && <p className="checkout__chosen">Selling to {selected.name}.</p>}
            </div>
          )}

          {customerMode === 'new' && (
            <>
              <div className="field">
                <label htmlFor="newCustomerName">Name</label>
                <input
                  id="newCustomerName"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="newCustomerMobile">Mobile number</label>
                <input
                  id="newCustomerMobile"
                  inputMode="tel"
                  value={newMobile}
                  onChange={(event) => setNewMobile(event.target.value)}
                />
                <small className="field__hint">Needed to send the receipt on WhatsApp.</small>
              </div>
            </>
          )}
        </fieldset>

        <fieldset className="checkout__payment">
          <legend>Payment</legend>

          {paymentMethodsFor(canSellOnCredit).map((method) => (
            <label key={method.value} className="radio">
              <input
                type="radio"
                name="checkoutPayment"
                checked={paymentMethod === method.value}
                onChange={() => {
                  setPaymentMethod(method.value);
                  setError(null);
                }}
              />
              {method.label}
            </label>
          ))}

          {!canSellOnCredit && (
            <small className="field__hint">Only the owner can approve udhaar.</small>
          )}

          {/* The money came from somewhere else, so there is something to record. Cash in the
              drawer has no account behind it and is never asked for one. */}
          {isTransfer && (
            <>
              <div className="field">
                <label htmlFor="paymentAccount">Account number</label>
                <input
                  id="paymentAccount"
                  value={accountNumber}
                  placeholder="The account the money came from"
                  onChange={(event) => setAccountNumber(event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="paymentTransaction">Transaction ID</label>
                <input
                  id="paymentTransaction"
                  value={transactionId}
                  onChange={(event) => setTransactionId(event.target.value)}
                />
                <small className="field__hint">
                  Optional — the sale is saved either way, and the screenshot can be attached
                  afterwards.
                </small>
              </div>
            </>
          )}

          {isPartial && (
            <div className="field">
              <label htmlFor="paidNow">Paid now</label>
              <input
                id="paidNow"
                type="number"
                min="0"
                step="0.01"
                value={String(paidNow)}
                onChange={(event) => setPaidNow(Number(event.target.value))}
              />
            </div>
          )}
        </fieldset>

        <dl className="checkout__summary">
          <dt>Paying now</dt>
          <dd data-testid="checkout-paid">{formatPkr(amountPaid)}</dd>

          <dt>Remaining</dt>
          <dd data-testid="checkout-remaining">{formatPkr(remaining)}</dd>
        </dl>

        <div className="form-actions">
          <button type="button" disabled={isSaving} onClick={() => void handleConfirm()}>
            {isSaving ? 'Saving…' : 'Complete sale'}
          </button>
          <button type="button" disabled={isSaving} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
