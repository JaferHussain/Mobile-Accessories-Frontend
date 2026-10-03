import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supplierApi, type Supplier, type SupplierUpsert } from './supplierApi';
import { PAYMENT_METHODS, type PaymentMethod } from '@/features/pos/posApi';
import { accountLabel, accountsFor, shopAccountApi } from '@/features/shopAccounts/shopAccountApi';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { ApiError, ErrorCodes } from '@/types/api';

/**
 * The real ways money reaches a supplier. Credit and Partial describe an unpaid SALE; the server
 * refuses them on a supplier payment, so they are never offered.
 */
const SUPPLIER_PAYMENT_METHODS = PAYMENT_METHODS.filter(
  (method) => method.value !== 'Credit' && method.value !== 'Partial',
);

export interface SupplierPayment {
  amount: number;
  paymentMethod: PaymentMethod;
  note: string | null;
  confirmOverpayment: boolean;
  /** Which shop account paid. Only for a transfer, and optional. */
  shopAccountId: number | null;
}

function PayModal({
  supplier,
  onPay,
  onCancel,
}: {
  supplier: Supplier;
  onPay: (payment: SupplierPayment) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(0);
  // Starts unanswered, on purpose. A Cash default is what put every bank transfer to a supplier
  // into the evening's drawer count as a short — day close subtracts Cash payments only.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [note, setNote] = useState('');
  const [shopAccountId, setShopAccountId] = useState<number | ''>('');

  // Loaded when the box opens, not with the supplier list: most visits to Suppliers pay no one.
  const accounts = useQuery({ queryKey: ['shop-accounts', 'active'], queryFn: () => shopAccountApi.list() });
  const offeredAccounts = accountsFor(accounts.data ?? [], paymentMethod);
  const isTransfer = paymentMethod !== '' && paymentMethod !== 'Cash';
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(confirmOverpayment: boolean) {
    setError(null);

    if (amount <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    if (paymentMethod === '') {
      setError('Say how the supplier was paid — cash, bank transfer, JazzCash…');
      return;
    }

    setIsSaving(true);

    try {
      await onPay({
        amount,
        paymentMethod,
        // Blank is "not given", sent as null rather than an empty string.
        note: note.trim() || null,
        confirmOverpayment,
        shopAccountId: isTransfer && shopAccountId !== '' ? shopAccountId : null,
      });
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

        <div className="field">
          <label htmlFor="supplierPayMethod">Paid by</label>
          <select
            id="supplierPayMethod"
            value={paymentMethod}
            onChange={(event) => {
              setPaymentMethod(event.target.value as PaymentMethod | '');
              // An account chosen for one method may not carry another.
              setShopAccountId('');
            }}
          >
            <option value="" disabled>
              Choose how it was paid
            </option>
            {SUPPLIER_PAYMENT_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
          <small className="field__hint">Only a cash payment is taken out of the drawer at day close.</small>
        </div>

        {isTransfer && (
          <div className="field">
            <label htmlFor="supplierPayAccount">From account</label>
            <select
              id="supplierPayAccount"
              value={shopAccountId}
              onChange={(event) => setShopAccountId(event.target.value ? Number(event.target.value) : '')}
            >
              <option value="">Not recorded</option>
              {offeredAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountLabel(account)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="supplierPayNote">Reference (optional)</label>
          <input
            id="supplierPayNote"
            maxLength={255}
            placeholder="Cheque or transaction number"
            value={note}
            onChange={(event) => setNote(event.target.value)}
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

  const navigate = useNavigate();

  const pay = useMutation({
    mutationFn: (input: SupplierPayment & { id: number }) =>
      supplierApi.recordPayment(
        input.id, input.amount, input.paymentMethod, input.note, input.confirmOverpayment, input.shopAccountId,
      ),
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
                  {/* Every purchase, return and payment behind "You owe". */}
                  <button
                    type="button"
                    onClick={() => navigate(`/supplier-ledger?supplierId=${supplier.id}`)}
                  >
                    Ledger
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
          onPay={async (payment) => {
            await pay.mutateAsync({ id: paying.id, ...payment });
          }}
          onCancel={() => setPaying(null)}
        />
      )}
    </section>
  );
}
