import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult } from '@/types/api';
import type { ExpenseCategory, ExpenseFormValues } from './ExpenseForm';
import type { PaymentMethod } from '@/features/pos/posApi';

export interface Expense {
  id: number;
  categoryId: number;
  categoryName: string;
  amount: number;
  expenseDateUtc: string;
  /** Null only on rows recorded before this was asked for. Only Till leaves the cash drawer. */
  paymentSource?: 'Till' | 'Bank' | null;
  /** For a Bank expense, which way it went. Null for Till and older Bank rows. */
  paymentMethod?: PaymentMethod | null;
  hasProof?: boolean;
  /** The shop account it was paid from, when one was named. */
  shopAccountName?: string | null;
  /** The bank's or app's reference, when one was given. */
  transactionId?: string | null;
  note?: string | null;
}

export const expenseApi = {
  /** Active categories for the form, or every one — hidden too — for Manage categories. */
  categories(includeInactive = false): Promise<ExpenseCategory[]> {
    return unwrap(
      api.get<ApiEnvelope<ExpenseCategory[]>>('/expense-categories', { params: { includeInactive } }),
    );
  },

  addCategory(name: string): Promise<{ id: number }> {
    return unwrap(api.post<ApiEnvelope<{ id: number }>>('/expense-categories', { name }));
  },

  renameCategory(id: number, name: string): Promise<void> {
    return unwrap(api.put<ApiEnvelope<unknown>>(`/expense-categories/${id}`, { name })).then(() => undefined);
  },

  /** Hides it from the form. Never deleted: past expenses keep their label. */
  hideCategory(id: number): Promise<void> {
    return api.delete(`/expense-categories/${id}`).then(() => undefined);
  },

  showCategory(id: number): Promise<void> {
    return unwrap(api.post<ApiEnvelope<unknown>>(`/expense-categories/${id}/reactivate`, {})).then(() => undefined);
  },

  search(): Promise<PagedResult<Expense>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<Expense>>>('/expenses', { params: { pageSize: 50 } }),
    );
  },

  /** Saves the expense. The proof, if any, is attached by the caller once the id exists. */
  create(values: ExpenseFormValues): Promise<{ id: number }> {
    return unwrap(
      api.post<ApiEnvelope<{ id: number }>>('/expenses', {
        categoryId: values.categoryId,
        amount: values.amount,
        // The form gives a local date; send it as an instant the server can place in a period.
        expenseDate: new Date(`${values.expenseDate}T12:00:00`).toISOString(),
        paymentMethod: values.paymentMethod,
        shopAccountId: values.shopAccountId,
        transactionId: values.transactionId,
        note: values.note,
      }),
    );
  },

  remove(id: number): Promise<void> {
    return api.delete(`/expenses/${id}`).then(() => undefined);
  },
};
