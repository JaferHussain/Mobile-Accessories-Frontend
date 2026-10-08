import { useState, type FormEvent } from 'react';
import { ApiError } from '@/types/api';
import { PAYMENT_METHODS, type PaymentMethod } from '@/features/pos/posApi';
import { accountLabel, accountsFor, type ShopAccount } from '@/features/shopAccounts/shopAccountApi';
import { shopToday } from '@/lib/shopDay';

export interface ExpenseCategory {
  id: number;
  name: string;
  /** False once hidden — kept on old expenses, offered for no new ones. */
  isActive?: boolean;
}

export interface ExpenseFormValues {
  categoryId: number;
  amount: number;
  expenseDate: string;
  /** Cash (from the till) or one of the transfer methods. Cash is the till; anything else, the bank. */
  paymentMethod: PaymentMethod;
  /** Which shop account paid. Only for a transfer, and optional. */
  shopAccountId: number | null;
  /** The bank's or app's reference. Only for a transfer, and optional. */
  transactionId: string | null;
  note: string | null;
  /** The transfer screenshot, uploaded right after the expense is saved. */
  proofFile: File | null;
}

/** What saving came to — the expense always exists once this is returned. */
export type ExpenseSaveOutcome = 'saved' | 'proof-failed';

/** The one "Paid by" question: cash from the till, or one of the ways a transfer can go. */
const PAID_BY: ReadonlyArray<{ value: PaymentMethod; label: string }> = [
  { value: 'Cash', label: 'Cash (from the till)' },
  ...PAYMENT_METHODS.filter((method) => ['BankTransfer', 'JazzCash', 'EasyPaisa', 'Raast'].includes(method.value)),
];

export interface ExpenseFormProps {
  categories: ExpenseCategory[];
  /** The shop's own accounts. The form offers only those that could have carried the payment. */
  accounts?: ShopAccount[];
  onSubmit: (values: ExpenseFormValues) => Promise<ExpenseSaveOutcome | void>;
}

/** The shop's own day — the UTC date is still yesterday until 5 a.m. in the shop. */
const today = shopToday;

/**
 * Records an outgoing cost — rent, electricity, salaries (FR-029).
 *
 * <p>These feed straight into net profit for the period they fall in (FR-030), which is why the
 * date is a required field rather than defaulting silently to now.</p>
 *
 * <p><b>One question for how it was paid.</b> It replaced "Paid from: Till / Bank" followed by a
 * second "Paid by". Cash means the till; anything else means the bank, which is what day close
 * reads. For a transfer the account, reference and screenshot are asked right here — the owner
 * usually has the screenshot in hand, unlike the counter, which attaches afterwards.</p>
 */
export function ExpenseForm({ categories, accounts = [], onSubmit }: ExpenseFormProps) {
  const [categoryId, setCategoryId] = useState<number>(categories[0]?.id ?? 0);
  const [amount, setAmount] = useState<number>(0);
  const [expenseDate, setExpenseDate] = useState<string>(today());

  // Starts unanswered on purpose. Defaulting to cash would quietly drop every transfer into the
  // drawer calculation, which is the one figure this question exists to keep honest.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [shopAccountId, setShopAccountId] = useState<number | ''>('');
  const [transactionId, setTransactionId] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [outcome, setOutcome] = useState<ExpenseSaveOutcome | null>(null);
  // Bumped after a save, so the file input (which cannot be cleared by value) starts afresh.
  const [formKey, setFormKey] = useState(0);

  const isTransfer = paymentMethod !== '' && paymentMethod !== 'Cash';
  const offeredAccounts = accountsFor(accounts, paymentMethod);

  function choosePaidBy(method: PaymentMethod | '') {
    setPaymentMethod(method);
    // An account chosen for one method may not carry another.
    setShopAccountId('');
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!categoryId) {
      next.categoryId = 'Choose a category.';
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      next.amount = 'Amount must be greater than zero.';
    }

    if (!expenseDate) {
      next.expenseDate = 'A date is required.';
    }

    if (!paymentMethod) {
      next.paymentMethod = 'Say how this was paid — cash from the till, bank transfer, JazzCash, EasyPaisa or Raast.';
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setOutcome(null);

    if (!validate()) {
      return;
    }

    setIsSaving(true);

    try {
      const result = await onSubmit({
        categoryId,
        amount,
        expenseDate,
        paymentMethod: paymentMethod as PaymentMethod,
        shopAccountId: isTransfer && shopAccountId !== '' ? shopAccountId : null,
        transactionId: isTransfer ? transactionId.trim() || null : null,
        note: note.trim() || null,
        proofFile: isTransfer ? proofFile : null,
      });

      setOutcome(result ?? 'saved');
      setAmount(0);
      setNote('');
      // Cleared with the amount: the next expense is a separate question, and a remembered
      // answer here would be one the owner stops reading.
      setPaymentMethod('');
      setShopAccountId('');
      setTransactionId('');
      setProofFile(null);
      setFormKey((key) => key + 1);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Could not save the expense. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="expense-form" onSubmit={handleSubmit} noValidate>
      <h2>Record expense</h2>

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      {outcome && (
        <p className="form-success" role="status">
          {outcome === 'saved'
            ? 'Expense saved.'
            : 'Expense saved, but the proof could not be attached — attach it from the list below.'}
        </p>
      )}

      <div className="field">
        <label htmlFor="expenseCategory">Category</label>
        <select
          id="expenseCategory"
          value={categoryId}
          onChange={(event) => setCategoryId(Number(event.target.value))}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {errors.categoryId && <span className="field-error">{errors.categoryId}</span>}
      </div>

      <div className="field">
        <label htmlFor="expenseAmount">Amount</label>
        <input
          id="expenseAmount"
          type="number"
          min="0"
          step="0.01"
          value={String(amount)}
          onChange={(event) => setAmount(Number(event.target.value))}
          aria-invalid={errors.amount !== undefined}
        />
        {errors.amount && <span className="field-error">{errors.amount}</span>}
      </div>

      <div className="field">
        <label htmlFor="expenseDate">Date</label>
        <input
          id="expenseDate"
          type="date"
          value={expenseDate}
          onChange={(event) => setExpenseDate(event.target.value)}
          aria-invalid={errors.expenseDate !== undefined}
        />
        {errors.expenseDate && <span className="field-error">{errors.expenseDate}</span>}
      </div>

      <div className="field">
        <label htmlFor="expensePaidBy">Paid by</label>
        <select
          id="expensePaidBy"
          value={paymentMethod}
          onChange={(event) => choosePaidBy(event.target.value as PaymentMethod | '')}
          aria-invalid={errors.paymentMethod !== undefined}
        >
          {/* No pre-selected answer: the blank is what makes the owner decide. */}
          <option value="">Choose…</option>
          {PAID_BY.map((method) => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </select>
        {errors.paymentMethod && <span className="field-error">{errors.paymentMethod}</span>}
        <small className="field__hint">Only cash is taken out of the drawer at day close.</small>
      </div>

      {isTransfer && (
        <fieldset className="expense-form__transfer" key={formKey}>
          <legend>Transfer details</legend>

          <div className="field">
            <label htmlFor="expenseAccount">From account</label>
            <select
              id="expenseAccount"
              value={shopAccountId}
              onChange={(event) => setShopAccountId(event.target.value ? Number(event.target.value) : '')}
            >
              <option value="">Not recorded</option>
              {offeredAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountLabel(account)}
                </option>
              ))}
            </select>
            {offeredAccounts.length === 0 && (
              <small className="field__hint">No matching account yet — add one under Settings → Shop accounts.</small>
            )}
          </div>

          <div className="field">
            <label htmlFor="expenseTransactionId">Transaction ID</label>
            <input
              id="expenseTransactionId"
              maxLength={50}
              placeholder="From the bank or app (optional)"
              value={transactionId}
              onChange={(event) => setTransactionId(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="expenseProof">Proof (optional)</label>
            <input
              id="expenseProof"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
            />
          </div>
        </fieldset>
      )}

      <div className="field">
        <label htmlFor="expenseNote">Note</label>
        <input id="expenseNote" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>

      <div className="form-actions">
        <button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save expense'}
        </button>
      </div>
    </form>
  );
}
