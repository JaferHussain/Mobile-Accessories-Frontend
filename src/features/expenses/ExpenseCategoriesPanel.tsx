import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/types/api';
import { expenseApi } from './expenseApi';
import type { ExpenseCategory } from './ExpenseForm';

/**
 * The owner's own expense categories: add, rename, hide, bring back.
 *
 * <p>Nothing is deleted. A hidden category stops being offered on the form, and every expense
 * filed under it keeps its label — the same rule product categories and brands follow.</p>
 */
export function ExpenseCategoriesPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<ExpenseCategory | null>(null);
  const [renameTo, setRenameTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const all = useQuery({
    queryKey: ['expense-categories', 'all'],
    queryFn: () => expenseApi.categories(true),
  });

  // Both lists: this panel's, and the form's dropdown.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
  const report = (caught: unknown) =>
    setError(caught instanceof ApiError ? caught.message : 'Could not save the category.');

  const add = useMutation({
    mutationFn: (name: string) => expenseApi.addCategory(name),
    onSuccess: async () => {
      setNewName('');
      await refresh();
    },
    onError: report,
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => expenseApi.renameCategory(id, name),
    onSuccess: async () => {
      setRenaming(null);
      await refresh();
    },
    onError: report,
  });

  const toggle = useMutation({
    mutationFn: (category: ExpenseCategory) =>
      category.isActive === false ? expenseApi.showCategory(category.id) : expenseApi.hideCategory(category.id),
    onSuccess: refresh,
    onError: report,
  });

  function submitNew(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (newName.trim()) {
      add.mutate(newName.trim());
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="expense-categories-title">
      <div className="modal__panel">
        <h3 id="expense-categories-title">Expense categories</h3>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <form className="inline-form" onSubmit={submitNew} noValidate>
          <div className="field">
            <label htmlFor="newExpenseCategory">New category</label>
            <input
              id="newExpenseCategory"
              placeholder="e.g. Tea & guests"
              maxLength={80}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>
          <button type="submit" disabled={add.isPending || !newName.trim()}>
            Add category
          </button>
        </form>

        <ul className="category-list">
          {all.data?.map((category) => (
            <li key={category.id} className={category.isActive === false ? 'is-retired' : undefined}>
              {renaming?.id === category.id ? (
                <>
                  <input
                    aria-label={`New name for ${category.name}`}
                    value={renameTo}
                    maxLength={80}
                    onChange={(event) => setRenameTo(event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!renameTo.trim()}
                    onClick={() => rename.mutate({ id: category.id, name: renameTo.trim() })}
                  >
                    Save
                  </button>
                  <button type="button" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span>
                    {category.name}
                    {category.isActive === false && <small className="field__hint"> (hidden)</small>}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRenaming(category);
                      setRenameTo(category.name);
                      setError(null);
                    }}
                  >
                    Rename
                  </button>
                  <button type="button" onClick={() => toggle.mutate(category)}>
                    {category.isActive === false ? 'Bring back' : 'Hide'}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
