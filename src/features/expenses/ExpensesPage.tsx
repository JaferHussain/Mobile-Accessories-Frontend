import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExpenseForm, type ExpenseFormValues, type ExpenseSaveOutcome } from './ExpenseForm';
import { ExpenseCategoriesPanel } from './ExpenseCategoriesPanel';
import { expenseApi, type Expense } from './expenseApi';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { PAYMENT_METHODS } from '@/features/pos/posApi';
import { ProofAttachment } from '@/features/proofs/ProofAttachment';
import { proofApi } from '@/features/proofs/proofApi';
import { shopAccountApi } from '@/features/shopAccounts/shopAccountApi';

function methodLabel(method: string | null | undefined): string | null {
  return method ? (PAYMENT_METHODS.find((option) => option.value === method)?.label ?? method) : null;
}

/** "Cash (till)", or "JazzCash · JazzCash Shop · TXN 5521" — how an expense was paid, in words. */
function paidBy(expense: Expense): string {
  if (expense.paymentSource === 'Till') {
    return 'Cash (till)';
  }

  if (expense.paymentSource !== 'Bank') {
    // Recorded before the question was asked; excluded from the drawer count, not guessed at.
    return '—';
  }

  return [methodLabel(expense.paymentMethod) ?? 'Bank', expense.shopAccountName, expense.transactionId]
    .filter(Boolean)
    .join(' · ');
}

export function ExpensesPage() {
  const queryClient = useQueryClient();
  const [managingCategories, setManagingCategories] = useState(false);

  const categories = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => expenseApi.categories(),
  });

  // For the "From account" dropdown. The form still works with none registered.
  const accounts = useQuery({
    queryKey: ['shop-accounts', 'active'],
    queryFn: () => shopAccountApi.list(),
  });

  const expenses = useQuery({ queryKey: ['expenses'], queryFn: () => expenseApi.search() });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['expenses'] }),
      // Expenses change net profit, so the dashboard is now stale.
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['proofs', 'missing'] }),
    ]);

  /**
   * Saves the expense, then its screenshot. Two steps because the proof is addressed to an
   * expense id that does not exist until the first has succeeded — and a failed upload must never
   * read as a failed expense: the expense exists, and the proof can be attached from the list.
   */
  async function save(values: ExpenseFormValues): Promise<ExpenseSaveOutcome> {
    const { id } = await expenseApi.create(values);
    let outcome: ExpenseSaveOutcome = 'saved';

    if (values.proofFile) {
      try {
        await proofApi.attach('expense', id, values.proofFile);
      } catch {
        outcome = 'proof-failed';
      }
    }

    await refresh();

    return outcome;
  }

  const remove = useMutation({
    mutationFn: expenseApi.remove,
    onSuccess: refresh,
  });

  return (
    <section>
      <header className="page-header">
        <h2>Expenses</h2>
        <button type="button" onClick={() => setManagingCategories(true)}>
          Manage categories
        </button>
      </header>

      <QueryState isLoading={categories.isPending} error={categories.error}>
        <ExpenseForm categories={categories.data ?? []} accounts={accounts.data ?? []} onSubmit={save} />
      </QueryState>

      {managingCategories && <ExpenseCategoriesPanel onClose={() => setManagingCategories(false)} />}

      <h3>Recent expenses</h3>

      <QueryState
        isLoading={expenses.isPending}
        error={expenses.error}
        isEmpty={expenses.data?.items.length === 0}
        emptyMessage="No expenses recorded yet."
      >
        <table className="data-table">
          <caption className="visually-hidden">Recent expenses</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Category</th>
              <th scope="col">Amount</th>
              <th scope="col">Paid by</th>
              <th scope="col">Note</th>
              <th scope="col">Proof</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {expenses.data?.items.map((expense) => (
              <tr key={expense.id}>
                <td>
                  {new Date(expense.expenseDateUtc).toLocaleDateString('en-PK', {
                    timeZone: 'Asia/Karachi',
                  })}
                </td>
                <td>{expense.categoryName}</td>
                <td className="numeric">{formatPkr(expense.amount)}</td>
                <td>{paidBy(expense)}</td>
                <td>{expense.note ?? '—'}</td>
                <td>
                  {/* A bank expense carries its screenshot; money from the till was cash. */}
                  {expense.paymentSource === 'Bank' ? (
                    <ProofAttachment
                      kind="expense"
                      id={expense.id}
                      hasProof={expense.hasProof ?? false}
                      onAttached={() => void refresh()}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Remove this expense? Net profit will change.')) {
                        remove.mutate(expense.id);
                      }
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
    </section>
  );
}
