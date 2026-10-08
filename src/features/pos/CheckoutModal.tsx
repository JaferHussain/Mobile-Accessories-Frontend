import { useEffect, useMemo, useState } from 'react';
import { formatPkr, roundMoney } from '@/lib/money';
import { ApiError } from '@/types/api';
import { FULLY_PAID_METHODS, PAYMENT_METHODS, type CustomerSummary, type PaymentMethod } from './posApi';

/**
 * The last step of a sale: who is buying, and how they are paying.
 *
 * <p>The shop has two kinds of customer, and only two: a <b>walk-in</b>, and a registered
 * <b>udhaar customer</b> — registered by the owner with name, phone and ID card. There is no "new
 * customer" here on purpose: nobody gets credit at the counter without being registered first.</p>
 *
 * <ul>
 *   <li>Full udhaar appears only once an udhaar customer is chosen.</li>
 *   <li>A walk-in may pay part — the owner's call — but the counter takes a name and phone for that
 *   bill, because a debt with no name can never be collected.</li>
 * </ul>
 *
 * <p>The server decides all of this again from its own totals; the screen only keeps a choice that
 * would be refused off it, and says why.</p>
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
   * The customer's mobile number, so the receipt can offer to send them their bill without a
   * second lookup. Null for a walk-in who paid in full, which tells the receipt to ask for one.
   */
  customerMobile: string | null;
}

export interface CheckoutModalProps {
  /** The bill being settled. The server recomputes it; this is what the customer is told. */
  total: number;
  /** The owner: may give udhaar and take part payments. */
  canSellOnCredit: boolean;
  /**
   * A field salesman: may give udhaar and take part payments — but only from one of the owner's
   * udhaar customers. The server refuses anything else regardless.
   */
  udhaarCustomersOnly?: boolean;
  /**
   * The counter shopkeeper: may take a part payment — from an udhaar customer, or a walk-in whose
   * name and phone are taken — but never put the whole bill on udhaar.
   */
  canTakePartPayment?: boolean;
  /** Finds registered udhaar customers — nobody else is offered here. */
  onSearchCustomers: (term: string) => Promise<CustomerSummary[]>;
  /** Records the name and phone of a walk-in paying part, so the rest can be collected. */
  onCreateCustomer: (name: string, mobileNumber: string | null) => Promise<{ id: number; name: string }>;
  onConfirm: (details: CheckoutDetails) => Promise<void>;
  onCancel: () => void;
}

type CustomerMode = 'walkin' | 'udhaar';

/** Methods that carry money from somewhere else, and so have an account behind them. */
const TRANSFER_METHODS: readonly PaymentMethod[] = ['BankTransfer', 'JazzCash', 'EasyPaisa', 'Raast'];

export function CheckoutModal({
  total,
  canSellOnCredit,
  udhaarCustomersOnly = false,
  canTakePartPayment = false,
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

  // A walk-in paying part: who owes the rest, and how to reach them.
  const [walkInName, setWalkInName] = useState('');
  const [walkInMobile, setWalkInMobile] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [accountNumber, setAccountNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [paidNow, setPaidNow] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const udhaarChosen = customerMode === 'udhaar' && selected !== null;

  // WHO may leave money owing — the owner; a field salesman for an udhaar customer; the counter
  // shopkeeper as a part payment only — and TO WHOM: full udhaar needs an udhaar customer, a part
  // payment an udhaar customer or a walk-in whose name and phone are taken.
  const mayGiveCredit = canSellOnCredit || (udhaarCustomersOnly && udhaarChosen);
  const creditOffered = mayGiveCredit && udhaarChosen;
  const partialOffered =
    (mayGiveCredit && (udhaarChosen || (customerMode === 'walkin' && canSellOnCredit))) ||
    (canTakePartPayment && (udhaarChosen || customerMode === 'walkin'));

  const methods = PAYMENT_METHODS.filter(
    (method) =>
      (method.value !== 'Credit' || creditOffered) && (method.value !== 'Partial' || partialOffered),
  );

  // Choosing a different customer can close a method again — never leave it selected behind the screen.
  useEffect(() => {
    if ((paymentMethod === 'Credit' && !creditOffered) || (paymentMethod === 'Partial' && !partialOffered)) {
      setPaymentMethod('Cash');
    }
  }, [paymentMethod, creditOffered, partialOffered]);

  const isTransfer = TRANSFER_METHODS.includes(paymentMethod);
  const isPartial = paymentMethod === 'Partial';
  const walkInOwes = customerMode === 'walkin' && isPartial;

  // Derived, never typed twice: a cash-type method settles the bill, udhaar pays nothing, and a
  // part payment is whatever the shopkeeper entered.
  const amountPaid = useMemo(() => {
    if (FULLY_PAID_METHODS.includes(paymentMethod)) {
      return roundMoney(total);
    }

    return isPartial ? roundMoney(paidNow) : 0;
  }, [paymentMethod, isPartial, paidNow, total]);

  const remaining = roundMoney(total - amountPaid);

  function hint(): string | null {
    if (canTakePartPayment && !canSellOnCredit) {
      return 'Only the owner can put the whole bill on udhaar. You can take part of it now — with the customer’s name and phone.';
    }

    if (!canSellOnCredit && !udhaarCustomersOnly) {
      return 'Only the owner can approve udhaar.';
    }

    if (customerMode === 'walkin') {
      return udhaarCustomersOnly
        ? "Udhaar is only for the owner's udhaar customers — choose one under Udhaar customer."
        : 'Full udhaar is for registered udhaar customers. A walk-in can pay part, with a name and phone.';
    }

    return selected ? null : 'Find the udhaar customer to offer udhaar.';
  }

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

  function validate(): string | null {
    if (customerMode === 'udhaar' && !selected) {
      return 'Find and select the udhaar customer, or choose walk-in.';
    }

    if (isPartial) {
      if (amountPaid <= 0) {
        return 'The amount paid now must be greater than zero.';
      }

      if (amountPaid >= total) {
        return 'A part payment must be less than the total. Choose a full payment method instead.';
      }
    }

    if (walkInOwes && (!walkInName.trim() || !walkInMobile.trim())) {
      return 'Take the customer’s name and phone number — the rest is collected from them.';
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
      // Only a walk-in who leaves money owing is recorded — a one-off buyer who paid in full is
      // not a relationship, and is never stored.
      const customerId =
        customerMode === 'udhaar'
          ? (selected?.id ?? null)
          : walkInOwes
            ? (await onCreateCustomer(walkInName.trim(), walkInMobile.trim())).id
            : null;

      await onConfirm({
        customerId,
        customerMobile:
          customerMode === 'udhaar' ? (selected?.mobileNumber ?? null) : walkInOwes ? walkInMobile.trim() : null,
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

  const note = hint();

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

          <div className="segmented" role="presentation">
            {(
              [
                ['walkin', 'Walk-in customer'],
                ['udhaar', 'Udhaar customer'],
              ] as const
            ).map(([mode, label]) => (
              <label key={mode} className={`segmented__option${customerMode === mode ? ' is-active' : ''}`}>
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
          </div>

          {customerMode === 'udhaar' && (
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

              {results?.length === 0 && (
                <p className="field__hint">
                  No udhaar customer found. The owner registers udhaar customers under Customers &amp; bills.
                </p>
              )}

              {results && results.length > 0 && (
                <ul className="pick-list">
                  {results.map((found) => (
                    <li key={found.id} data-testid={`customer-option-${found.id}`}>
                      <span>{found.name}</span>
                      <span className="pick-list__meta">
                        {found.mobileNumber ?? 'no number'}
                        {/* What they already owe, before this sale adds to it. */}
                        {found.outstandingBalance > 0 && ` · owes ${formatPkr(found.outstandingBalance)}`}
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
        </fieldset>

        <fieldset className="checkout__payment">
          <legend>Payment</legend>

          {methods.map((method) => (
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

          {note && <small className="field__hint">{note}</small>}

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
                  Optional — the sale is saved either way, and the screenshot can be attached afterwards.
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

          {walkInOwes && (
            <div className="checkout__walkin-debt">
              <p className="field__hint">The rest is owed — who is it owed by?</p>

              <div className="field">
                <label htmlFor="walkInName">Customer name</label>
                <input id="walkInName" value={walkInName} onChange={(event) => setWalkInName(event.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="walkInMobile">Phone number</label>
                <input
                  id="walkInMobile"
                  inputMode="tel"
                  value={walkInMobile}
                  onChange={(event) => setWalkInMobile(event.target.value)}
                />
                <small className="field__hint">Needed to remind them, and to send the receipt.</small>
              </div>
            </div>
          )}
        </fieldset>

        <dl className="checkout__summary">
          <dt>Paying now</dt>
          <dd data-testid="checkout-paid">{formatPkr(amountPaid)}</dd>

          <dt>Remaining</dt>
          <dd data-testid="checkout-remaining" className={remaining > 0 ? 'checkout__owing' : undefined}>
            {formatPkr(remaining)}
          </dd>
        </dl>

        <div className="form-actions">
          <button type="button" className="button--primary" disabled={isSaving} onClick={() => void handleConfirm()}>
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
