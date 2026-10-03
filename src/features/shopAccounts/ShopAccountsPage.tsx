import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { ApiError } from '@/types/api';
import {
  SHOP_ACCOUNT_TYPES,
  shopAccountApi,
  type ShopAccount,
  type ShopAccountType,
} from './shopAccountApi';

const EMPTY = { name: '', accountType: '' as ShopAccountType | '', accountNumber: '', accountTitle: '' };

/**
 * The shop's own bank and wallet accounts, registered once.
 *
 * <p>After this, a non-cash expense or supplier payment picks the account it left from a list —
 * filtered to the accounts that could have carried it — instead of anyone typing a number again.
 * Nothing is deleted: an account no longer used is hidden, and past payments keep naming it.</p>
 */
export function ShopAccountsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<ShopAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accounts = useQuery({
    queryKey: ['shop-accounts', 'all'],
    queryFn: () => shopAccountApi.list(true),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['shop-accounts'] });

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name: form.name.trim(),
        accountType: form.accountType as ShopAccountType,
        // Blank is "not given", sent as null.
        accountNumber: form.accountNumber.trim() || null,
        accountTitle: form.accountTitle.trim() || null,
      };

      return editing ? shopAccountApi.update(editing.id, input) : shopAccountApi.create(input);
    },
    onSuccess: async () => {
      await refresh();
      setForm(EMPTY);
      setEditing(null);
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Could not save the account.'),
  });

  const toggle = useMutation({
    mutationFn: (account: ShopAccount) =>
      account.isActive
        ? shopAccountApi.retire(account.id)
        : shopAccountApi.reactivate(account.id).then(() => undefined),
    onSuccess: refresh,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('Give the account a name, e.g. "HBL Current".');
      return;
    }

    if (!form.accountType) {
      setError('Say whether this is a bank, JazzCash or EasyPaisa account.');
      return;
    }

    save.mutate();
  }

  return (
    <section>
      <header className="page-header">
        <h2>Shop accounts</h2>
      </header>

      <p className="page-intro">
        The shop&apos;s own bank and wallet accounts. Add each one once; after that, a payment made
        by transfer, JazzCash or EasyPaisa picks its account from a list.
      </p>

      <form className="card inline-form" onSubmit={submit} noValidate>
        <h3>{editing ? `Edit ${editing.name}` : 'Add an account'}</h3>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="field">
          <label htmlFor="accountName">Account name</label>
          <input
            id="accountName"
            placeholder="e.g. HBL Current"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="accountType">Type</label>
          <select
            id="accountType"
            value={form.accountType}
            onChange={(event) => setForm({ ...form, accountType: event.target.value as ShopAccountType | '' })}
          >
            <option value="">Choose…</option>
            {SHOP_ACCOUNT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="accountNumber">Account number</label>
          <input
            id="accountNumber"
            placeholder="IBAN, account or mobile number"
            value={form.accountNumber}
            onChange={(event) => setForm({ ...form, accountNumber: event.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="accountTitle">Account title</label>
          <input
            id="accountTitle"
            placeholder="Name on the account (optional)"
            value={form.accountTitle}
            onChange={(event) => setForm({ ...form, accountTitle: event.target.value })}
          />
        </div>

        <div className="form-actions">
          <button type="submit" disabled={save.isPending}>
            {editing ? 'Save changes' : 'Add account'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
                setError(null);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <QueryState
        isLoading={accounts.isPending}
        error={accounts.error}
        isEmpty={accounts.data?.length === 0}
        emptyMessage="No accounts yet. Add the shop's bank and wallet accounts above."
      >
        <table className="data-table">
          <caption className="visually-hidden">Shop accounts</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col">Number</th>
              <th scope="col">Title</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.data?.map((account) => (
              <tr key={account.id} className={account.isActive ? undefined : 'is-retired'}>
                <td>
                  {account.name}
                  {!account.isActive && <small className="field__hint"> (hidden)</small>}
                </td>
                <td>{account.accountType}</td>
                <td>{account.accountNumber ?? '—'}</td>
                <td>{account.accountTitle ?? '—'}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(account);
                      setError(null);
                      setForm({
                        name: account.name,
                        accountType: account.accountType,
                        accountNumber: account.accountNumber ?? '',
                        accountTitle: account.accountTitle ?? '',
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" onClick={() => toggle.mutate(account)}>
                    {account.isActive ? 'Hide' : 'Bring back'}
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
