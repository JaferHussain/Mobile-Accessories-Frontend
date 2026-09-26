import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supplierApi, type Supplier, type SupplierUpsert } from './supplierApi';
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

const EMPTY_SUPPLIER: SupplierUpsert = {
  name: '',
  contactNumber: '',
  address: '',
  cnic: '',
  email: '',
  bankName: '',
  bankAccountNumber: '',
  notes: '',
};

export function SuppliersPage() {
  const queryClient = useQueryClient();

  // One object rather than a variable per box: there are eight of them now, and the form is
  // filled, cleared and loaded-for-edit as a unit.
  const [form, setForm] = useState<SupplierUpsert>(EMPTY_SUPPLIER);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [paying, setPaying] = useState<Supplier | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const set = (field: keyof SupplierUpsert, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const { data, isPending, error } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => supplierApi.search(),
  });

  const save = useMutation({
    mutationFn: () => {
      // An empty box means "not recorded", not "recorded as blank" — the difference matters
      // when the owner later asks which suppliers still need their bank details.
      const payload = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [
          key,
          typeof value === 'string' && value.trim() === '' ? null : value?.trim() ?? null,
        ]),
      ) as SupplierUpsert;

      return editing
        ? supplierApi.update(editing.id, payload)
        : supplierApi.create(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setForm(EMPTY_SUPPLIER);
      setEditing(null);
      setCreateError(null);
    },
    onError: (caught) =>
      setCreateError(caught instanceof ApiError ? caught.message : 'Could not save the supplier.'),
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
        className="supplier-form"
        onSubmit={(event) => {
          event.preventDefault();

          if (!form.name.trim()) {
            setCreateError('Supplier name is required.');
            return;
          }

          save.mutate();
        }}
        noValidate
      >
        <h3>{editing ? `Edit ${editing.name}` : 'Add a supplier'}</h3>

        <div className="supplier-form__group">
          <div className="field">
            <label htmlFor="supplierName">Supplier Name</label>
            <input
              id="supplierName"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="supplierContact">Contact</label>
            <input
              id="supplierContact"
              value={form.contactNumber ?? ''}
              placeholder="03001234567"
              onChange={(event) => set('contactNumber', event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="supplierEmail">Email</label>
            <input
              id="supplierEmail"
              value={form.email ?? ''}
              onChange={(event) => set('email', event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="supplierCnic">CNIC</label>
            <input
              id="supplierCnic"
              value={form.cnic ?? ''}
              placeholder="36603-1234567-1"
              onChange={(event) => set('cnic', event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="supplierAddress">Address</label>
            <input
              id="supplierAddress"
              value={form.address ?? ''}
              onChange={(event) => set('address', event.target.value)}
            />
          </div>
        </div>

        {/* Grouped on purpose: whoever is paying an invoice reads these three together, and
            hunting for them among the contact details is how the wrong account gets paid. */}
        <fieldset className="supplier-form__payment">
          <legend>Payment details</legend>

          <div className="supplier-form__group">
            <div className="field">
              <label htmlFor="supplierBankName">Bank name</label>
              <input
                id="supplierBankName"
                value={form.bankName ?? ''}
                onChange={(event) => set('bankName', event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="supplierAccountNumber">Account number</label>
              <input
                id="supplierAccountNumber"
                value={form.bankAccountNumber ?? ''}
                placeholder="IBAN or account number"
                onChange={(event) => set('bankAccountNumber', event.target.value)}
              />
            </div>
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="supplierNotes">Notes</label>
          <input
            id="supplierNotes"
            value={form.notes ?? ''}
            onChange={(event) => set('notes', event.target.value)}
          />
        </div>

        <div className="supplier-form__actions">
          <button type="submit" disabled={save.isPending}>
            {editing ? 'Save' : 'Add'}
          </button>

          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY_SUPPLIER);
                setCreateError(null);
              }}
            >
              Cancel
            </button>
          )}
        </div>
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
              <th scope="col">Supplier Name</th>
              <th scope="col">Contact</th>
              <th scope="col">Pay into</th>
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
                <td>
                  {supplier.bankName || supplier.bankAccountNumber ? (
                    <>
                      {supplier.bankName}
                      {supplier.bankName && supplier.bankAccountNumber ? ' · ' : ''}
                      {supplier.bankAccountNumber}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
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
                  <button
                    type="button"
                    onClick={() => {
                      // Loads the whole record into the form, so a supplier recorded before
                      // these fields existed can gain them later without being re-created.
                      setEditing(supplier);
                      setForm({
                        name: supplier.name,
                        contactNumber: supplier.contactNumber ?? '',
                        address: supplier.address ?? '',
                        cnic: supplier.cnic ?? '',
                        email: supplier.email ?? '',
                        bankName: supplier.bankName ?? '',
                        bankAccountNumber: supplier.bankAccountNumber ?? '',
                        notes: supplier.notes ?? '',
                      });
                      setCreateError(null);
                    }}
                  >
                    Edit
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
