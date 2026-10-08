import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { ApiError } from '@/types/api';
import { IdCardViewer } from './IdCardViewer';
import { UdhaarRegistrationForm, type UdhaarRegistrationValues } from './UdhaarRegistrationForm';
import { udhaarApi, type UdhaarCustomer } from './udhaarApi';

/**
 * The owner's udhaar customers — the only people the shop sells to on full udhaar. Each is
 * registered with name, phone and both sides of the ID card. Those marked before cards were asked
 * for stay eligible and are flagged "ID card missing" until completed. Owner only.
 */
export function UdhaarCustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [completing, setCompleting] = useState<UdhaarCustomer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['udhaar-customers', search],
    queryFn: () => udhaarApi.list(search.trim() || undefined),
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['udhaar-customers'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
    ]);

  const remove = useMutation({
    mutationFn: (customer: UdhaarCustomer) => udhaarApi.remove(customer.id),
    onSuccess: async (customer) => {
      setNotice(`${customer.name} is no longer an udhaar customer. What they owe stays as it is.`);
      await refresh();
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Could not take the udhaar mark away.'),
  });

  async function registerNew(values: UdhaarRegistrationValues) {
    const created = await udhaarApi.register({
      name: values.name,
      mobileNumber: values.mobileNumber,
      idCardFront: values.idCardFront!,
      idCardBack: values.idCardBack!,
    });
    setIsRegistering(false);
    setNotice(`${created.name} is registered — they can now be sold to on udhaar.`);
    await refresh();
  }

  async function complete(values: UdhaarRegistrationValues) {
    if (!completing) {
      return;
    }

    await udhaarApi.registerExisting(completing.id, {
      mobileNumber: values.mobileNumber,
      idCardFront: values.idCardFront,
      idCardBack: values.idCardBack,
    });
    setNotice(`${completing.name}'s ID card is complete.`);
    setCompleting(null);
    await refresh();
  }

  const rows = list.data ?? [];
  const missing = rows.filter((row) => row.idCardMissing).length;

  return (
    <section>
      <header className="page-header">
        <h2>Udhaar customers</h2>
        {!isRegistering && !completing && (
          <button type="button" className="button--primary" onClick={() => setIsRegistering(true)}>
            Register udhaar customer
          </button>
        )}
      </header>

      <p className="page-intro">
        The only customers who can be sold to on full udhaar. Anyone else pays in full — or pays part, with their phone
        number taken at the counter.
      </p>

      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {isRegistering && <UdhaarRegistrationForm onSubmit={registerNew} onCancel={() => setIsRegistering(false)} />}

      {completing && (
        <UdhaarRegistrationForm existing={completing} onSubmit={complete} onCancel={() => setCompleting(null)} />
      )}

      <div className="filters">
        <div className="field">
          <label htmlFor="udhaarSearch">Search</label>
          <input
            id="udhaarSearch"
            value={search}
            placeholder="Name or phone number"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {missing > 0 && (
          <span className="badge badge--low" data-testid="missing-count">
            {missing} without an ID card
          </span>
        )}
      </div>

      <QueryState
        isLoading={list.isPending}
        error={list.error}
        isEmpty={rows.length === 0}
        emptyMessage={search ? 'No udhaar customer matches that.' : 'No udhaar customers yet — register the first one.'}
      >
        <table className="data-table">
          <caption className="visually-hidden">Udhaar customers</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Phone</th>
              <th scope="col">Owes</th>
              <th scope="col">ID card</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.mobileNumber ?? '—'}</td>
                <td className={`numeric${row.outstandingBalance > 0 ? ' owing' : ''}`}>{formatPkr(row.outstandingBalance)}</td>
                <td>
                  {row.idCardMissing ? (
                    <span className="badge badge--low">ID card missing</span>
                  ) : (
                    <span className="badge badge--ok">On file</span>
                  )}
                </td>
                <td className="row-actions">
                  <IdCardViewer customer={row} />
                  {row.idCardMissing && (
                    <button
                      type="button"
                      onClick={() => {
                        setNotice(null);
                        setCompleting(row);
                      }}
                    >
                      Complete ID card
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Take ${row.name} off the udhaar customers? What they owe stays as it is.`)) {
                        setError(null);
                        remove.mutate(row);
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
