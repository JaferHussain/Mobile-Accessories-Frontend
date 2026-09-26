import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult } from '@/types/api';
import type { ExpenseCategory, ExpenseFormValues } from './ExpenseForm';

export interface Expense {
  id: number;
  categoryId: number;
  categoryName: string;
  amount: number;
  expenseDateUtc: string;
  /** Null only on rows recorded before this was asked for. Only Till leaves the cash drawer. */
  paymentSource?: 'Till' | 'Bank' | null;
  note?: string | null;
}

export const expenseApi = {
  categories(): Promise<ExpenseCategory[]> {
    return unwrap(api.get<ApiEnvelope<ExpenseCategory[]>>('/expense-categories'));
  },

  search(): Promise<PagedResult<Expense>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<Expense>>>('/expenses', { params: { pageSize: 50 } }),
    );
  },

  create(values: ExpenseFormValues): Promise<{ id: number }> {
    return unwrap(
      api.post<ApiEnvelope<{ id: number }>>('/expenses', {
        categoryId: values.categoryId,
        amount: values.amount,
        // The form gives a local date; send it as an instant the server can place in a period.
        expenseDate: new Date(`${values.expenseDate}T12:00:00`).toISOString(),
        paymentSource: values.paymentSource,
        note: values.note,
      }),
    );
  },

  remove(id: number): Promise<void> {
    return api.delete(`/expenses/${id}`).then(() => undefined);
  },
};
