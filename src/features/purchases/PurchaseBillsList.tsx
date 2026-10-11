import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/types/api';
import { formatPkr } from '@/lib/money';
import { shopToday } from '@/lib/shopDay';
import { QueryState } from '@/components/QueryState';
import { PAYMENT_METHODS, type PaymentMethod } from '@/features/pos/posApi';
import { ProofAttachment } from '@/features/proofs/ProofAttachment';
import { ProofFileField } from '@/features/proofs/ProofFileField';
import { attachProofAfterSave, needsProof, proofOutcomeText } from '@/features/proofs/proofApi';
import { accountsFor, accountLabel, shopAccountApi } from '@/features/shopAccounts/shopAccountApi';
import {
  purchaseBillApi,
  type PurchaseBillStatus,
  type PurchaseBillSummary,
} from './purchaseBillApi';
import { BillDetailDialog } from './BillDetailDialog';
import { billDay } from './billDay';

const STATUS: Record<PurchaseBillStatus, { label: string; badge: string }> = {
  Paid: { label: 'Paid', badge: 'badge--ok' },
  PartPaid: { label: 'Part paid', badge: 'badge--low' },
  Unpaid: { label: 'Unpaid', badge: 'badge--out' },
};

const SUPPLIER_PAYMENT_METHODS = PAYMENT_METHODS.filter(
  (method) => method.value !== 'Credit' && method.value !== 'Partial',
);

/** Paying a bill later: never more than it still owes, never dated before it. */
function PayBillModal({
  bill,
  onPaid,
  onCancel,
}: {
  bill: PurchaseBillSummary;
  onPaid: (message: string) => void;
  onCancel: () => void;
}) {
  const today = shopToday();
  const [amount, setAmount] = useState(bill.due);
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [paidOn, setPaidOn] = useState(today);
  const [shopAccountId, setShopAccountId] = useState<number | ''>('');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accounts = useQuery({
    queryKey: ['shop-accounts', 'active'],
    queryFn: () => shopAccountApi.list(),
  });
  const offeredAccounts = accountsFor(accounts.data ?? [], method);

  const pay = useMutation({
    mutationFn: async () => {
      const result = await purchaseBillApi.pay(bill.id, {
        amount,
        paymentMethod: method as PaymentMethod,
        paidOn,
        shopAccountId: needsProof(method) && shopAccountId !== '' ? shopAccountId : null,
        reference: reference.trim() || null,
      });
      const outcome = await attachProofAfterSave(
        'supplier-payment',
        result.paymentId,
        proof,
        method,
      );
      return (
        `Paid ${formatPkr(amount)} on ${billDay(paidOn)}. ` +
        (result.due > 0
          ? `${formatPkr(result.due)} still owed on this bill.`
          : 'The bill is paid.') +
        proofOutcomeText(outcome)
      );
    },
    onSuccess: onPaid,
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not record the payment.'),
  });

  function submit() {
    setError(null);

    if (!(amount > 0) || amount > bill.due) {
      setError(`Pay more than zero and no more than the ${formatPkr(bill.due)} still owed.`);
      return;
    }

    if (!method) {
      setError('Say how the supplier was paid — cash, bank transfer, JazzCash…');
      return;
    }

    pay.mutate();
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pay-bill-title">
      <div className="modal__panel">
        <h3 id="pay-bill-title">
          Pay {bill.supplierName} — bill of {billDay(bill.billDate)}
        </h3>
        <p className="modal__hint">{formatPkr(bill.due)} still owed on this bill.</p>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="field">
          <label htmlFor="payBillAmount">Amount</label>
          <input
            id="payBillAmount"
            type="number"
            min="0"
            step="0.01"
            value={String(amount)}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="payBillMethod">Paid by</label>
          <select
            id="payBillMethod"
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod | '')}
          >
            <option value="">Choose…</option>
            {SUPPLIER_PAYMENT_METHODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="payBillDate">Date paid</label>
          <input
            id="payBillDate"
            type="date"
            min={bill.billDate}
            max={today}
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
          />
        </div>
        {needsProof(method) && offeredAccounts.length > 0 && (
          <div className="field">
            <label htmlFor="payBillAccount">From account</label>
            <select
              id="payBillAccount"
              value={shopAccountId}
              onChange={(event) =>
                setShopAccountId(event.target.value ? Number(event.target.value) : '')
              }
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
          <label htmlFor="payBillReference">Reference</label>
          <input
            id="payBillReference"
            maxLength={255}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </div>
        <ProofFileField id="payBillProof" method={method} onFile={setProof} />

        <div className="form-actions">
          <button
            type="button"
            className="button--primary"
            disabled={pay.isPending}
            onClick={submit}
          >
            {pay.isPending ? 'Saving…' : 'Record payment'}
          </button>
          <button type="button" disabled={pay.isPending} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Every supplier bill, newest first: when, from whom, what it came to, what has been paid, what is
 * still owed — with the bill's photo, and Pay for anything outstanding. Every figure is the server's.
 */
export function PurchaseBillsList() {
  const queryClient = useQueryClient();
  const bills = useQuery({ queryKey: ['purchase-bills'], queryFn: () => purchaseBillApi.list() });
  const [open, setOpen] = useState<PurchaseBillSummary | null>(null);
  const [paying, setPaying] = useState<PurchaseBillSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchase-bills'] }),
      queryClient.invalidateQueries({ queryKey: ['purchase-bill'] }),
      queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
    ]);

  return (
    <section className="purchase-bills">
      <h3>Recent bills</h3>

      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}

      <QueryState
        isLoading={bills.isPending}
        error={bills.error}
        isEmpty={bills.data?.length === 0}
        emptyMessage="No bills yet — the first one you save appears here."
      >
        <table className="data-table">
          <caption className="visually-hidden">Recent bills</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Supplier</th>
              <th scope="col">Bill no.</th>
              <th scope="col">Items</th>
              <th scope="col">Total</th>
              <th scope="col">Paid</th>
              <th scope="col">Owed</th>
              <th scope="col">Status</th>
              <th scope="col">Bill photo</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {bills.data?.map((bill) => (
              <BillRow
                key={bill.id}
                bill={bill}
                onDetails={() => setOpen(bill)}
                onPay={() => {
                  setNotice(null);
                  setPaying(bill);
                }}
                onPhoto={() => void refresh()}
              />
            ))}
          </tbody>
        </table>
      </QueryState>

      {open && (
        <BillDetailDialog
          bill={open}
          onClose={() => setOpen(null)}
          onPay={() => {
            // One popup at a time: the Pay popup takes the bill's place.
            setNotice(null);
            setPaying(open);
            setOpen(null);
          }}
          onChanged={() => void refresh()}
        />
      )}

      {paying && (
        <PayBillModal
          bill={paying}
          onPaid={(message) => {
            setNotice(message);
            setPaying(null);
            void refresh();
          }}
          onCancel={() => setPaying(null)}
        />
      )}
    </section>
  );
}

function BillRow({
  bill,
  onDetails,
  onPay,
  onPhoto,
}: {
  bill: PurchaseBillSummary;
  onDetails: () => void;
  onPay: () => void;
  onPhoto: () => void;
}) {
  const status = STATUS[bill.status];

  return (
    <tr data-testid={`bill-${bill.id}`}>
      <td>{billDay(bill.billDate)}</td>
      <td>{bill.supplierName}</td>
      <td>{bill.billNumber ?? '—'}</td>
      <td className="numeric">{bill.itemCount}</td>
      <td className="numeric">{formatPkr(bill.total)}</td>
      <td className="numeric">{formatPkr(bill.paid)}</td>
      <td className={`numeric${bill.due > 0 ? ' owing' : ''}`}>{formatPkr(bill.due)}</td>
      <td>
        <span className={`badge ${status.badge}`}>{status.label}</span>
      </td>
      <td>
        <ProofAttachment
          kind="purchase-bill"
          id={bill.id}
          hasProof={bill.hasBillImage}
          onAttached={onPhoto}
        />
      </td>
      <td className="row-actions">
        <button type="button" className="link-button" aria-haspopup="dialog" onClick={onDetails}>
          Details
        </button>
        {bill.due > 0 && (
          <button type="button" className="button--primary" onClick={onPay}>
            Pay
          </button>
        )}
      </td>
    </tr>
  );
}
