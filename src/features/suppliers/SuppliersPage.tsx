import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supplierApi, type Supplier } from './supplierApi';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { ApiError, ErrorCodes } from '@/types/api';

function PayModal({
  supplier,
  onPay,
  onCancel,
}: {
  supplier: Supplier;
  onPay: (amount: number, confirmOverpayment: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(confirmOverpayment: boolean) {
    setError(null);

    if (amount <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    setIsSaving(true);

    try {
      await onPay(amount, confirmOverpayment);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === ErrorCodes.OverpaymentNotConfirmed) {
        setNeedsConfirmation(true);
      }

      setError(caught instanceof ApiError ? caught.message : 'Could not record the payment.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pay-supplier-title">
      <form
        className="modal__panel"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void submit(false);
        }}
        noValidate
      >
        <h3 id="pay-supplier-title">Pay {supplier.name}</h3>
        <p className="modal__hint">You owe {formatPkr(supplier.payableBalance)}.</p>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="field">
          <label htmlFor="supplierPayAmount">Amount</label>
          <input
            id="supplierPayAmount"
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={String(amount)}
            onChange={(event) => {
              setAmount(Number(event.target.value));
              setNeedsConfirmation(false);
            }}
          />
        </div>

        <div className="form-actions">
          {needsConfirmation ? (
            <button type="button" disabled={isSaving} onClick={() => void submit(true)}>
              Yes, pay more than owed
            </button>
          ) : (
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Record payment'}
            </button>
          )}
          <button type="button" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function SuppliersPage() {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [paying, setPaying] = useState<Supplier | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => supplierApi.search(),
  });

  const create = useMutation({
    mutationFn: () => supplierApi.create(name.trim(), contactNumber.trim() || null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setName('');
      setContactNumber('');
      setCreateError(null);
    },
    onError: (caught) =>
      setCreateError(caught instanceof ApiError ? caught.message : 'Could not add the supplier.'),
  });

  const pay = useMutation({
    mutationFn: (input: { id: number; amount: number; confirmOverpayment: boolean }) =>
      supplierApi.recordPayment(input.id, input.amount, 'Cash', null, input.confirmOverpayment),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setPaying(null);
    },
  });

  return (
    <section>
      <header className="page-header">
        <h2>Suppliers</h2>
      </header>

      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();

          if (!name.trim()) {
            setCreateError('Supplier name is required.');
            return;
          }

          create.mutate();
        }}
        noValidate
      >
        <div className="field">
          <label htmlFor="supplierName">Add a supplier</label>
          <input
            id="supplierName"
            value={name}
            placeholder="Name"
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="supplierContact">Contact</label>
          <input
            id="supplierContact"
            value={contactNumber}
            placeholder="03001234567"
            onChange={(event) => setContactNumber(event.target.value)}
          />
        </div>

        <button type="submit" disabled={create.isPending}>
          Add
        </button>
      </form>

      {createError && (
        <p className="form-error" role="alert">
          {createError}
        </p>
      )}

      <QueryState
        isLoading={isPending}
        error={error}
        isEmpty={data?.items.length === 0}
        emptyMessage="No suppliers yet."
      >
        <table className="data-table">
          <caption className="visually-hidden">Suppliers</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Contact</th>
              <th scope="col">You owe</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((supplier) => (
              <tr key={supplier.id}>
                <td>{supplier.name}</td>
                <td>{supplier.contactNumber ?? '—'}</td>
                <td className={`numeric${supplier.payableBalance > 0 ? ' owing' : ''}`}>
                  {formatPkr(supplier.payableBalance)}
                </td>
                <td>
                  <button
                    type="button"
                    disabled={supplier.payableBalance <= 0}
                    onClick={() => setPaying(supplier)}
                  >
                    Pay
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>

      {paying && (
        <PayModal
          supplier={paying}
          onPay={async (amount, confirmOverpayment) => {
            await pay.mutateAsync({ id: paying.id, amount, confirmOverpayment });
          }}
          onCancel={() => setPaying(null)}
        />
      )}
    </section>
  );
}
