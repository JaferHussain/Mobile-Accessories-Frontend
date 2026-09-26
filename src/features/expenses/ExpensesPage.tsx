import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExpenseForm } from './ExpenseForm';
import { expenseApi } from './expenseApi';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';

export function ExpensesPage() {
  const queryClient = useQueryClient();

  const categories = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => expenseApi.categories(),
  });

  const expenses = useQuery({ queryKey: ['expenses'], queryFn: () => expenseApi.search() });

  const create = useMutation({
    mutationFn: expenseApi.create,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        // Expenses change net profit, so the dashboard is now stale.
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });

  const remove = useMutation({
    mutationFn: expenseApi.remove,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });

  return (
    <section>
      <header className="page-header">
        <h2>Expenses</h2>
      </header>

      <QueryState isLoading={categories.isPending} error={categories.error}>
        <ExpenseForm
          categories={categories.data ?? []}
          onSubmit={async (values) => {
            await create.mutateAsync(values);
          }}
        />
      </QueryState>

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
              <th scope="col">Paid from</th>
              <th scope="col">Note</th>
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
                {/* Dashes on rows recorded before this was asked for. Those are excluded from
                    the day's drawer count rather than guessed at. */}
                <td>{expense.paymentSource === 'Till' ? 'Till (cash)' : (expense.paymentSource ?? '—')}</td>
                <td>{expense.note ?? '—'}</td>
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
