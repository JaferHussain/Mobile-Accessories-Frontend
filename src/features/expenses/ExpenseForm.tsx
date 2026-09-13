import { useState, type FormEvent } from 'react';
import { ApiError } from '@/types/api';

export interface ExpenseCategory {
  id: number;
  name: string;
}

export interface ExpenseFormValues {
  categoryId: number;
  amount: number;
  expenseDate: string;
  note: string | null;
}

export interface ExpenseFormProps {
  categories: ExpenseCategory[];
  onSubmit: (values: ExpenseFormValues) => Promise<void>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records an outgoing cost — rent, electricity, salaries (FR-029).
 *
 * These feed straight into net profit for the period they fall in (FR-030), which is why the
 * date is a required field rather than defaulting silently to now.
 */
export function ExpenseForm({ categories, onSubmit }: ExpenseFormProps) {
  const [categoryId, setCategoryId] = useState<number>(categories[0]?.id ?? 0);
  const [amount, setAmount] = useState<number>(0);
  const [expenseDate, setExpenseDate] = useState<string>(today());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

    setErrors(next);

    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSaved(false);

    if (!validate()) {
      return;
    }

    setIsSaving(true);

    try {
      await onSubmit({
        categoryId,
        amount,
        expenseDate,
        note: note.trim() || null,
      });

      setSaved(true);
      setAmount(0);
      setNote('');
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

      {saved && (
        <p className="form-success" role="status">
          Expense saved.
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
