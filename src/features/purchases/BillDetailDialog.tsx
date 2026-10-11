import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPkr } from '@/lib/money';
import { QueryState } from '@/components/QueryState';
import { PAYMENT_METHODS } from '@/features/pos/posApi';
import { ProofAttachment } from '@/features/proofs/ProofAttachment';
import { needsProof } from '@/features/proofs/proofApi';
import { billDay } from './billDay';
import {
  purchaseBillApi,
  type PurchaseBillStatus,
  type PurchaseBillSummary,
} from './purchaseBillApi';

const STATUS: Record<PurchaseBillStatus, { label: string; badge: string }> = {
  Paid: { label: 'Paid', badge: 'badge--ok' },
  PartPaid: { label: 'Part paid', badge: 'badge--low' },
  Unpaid: { label: 'Unpaid', badge: 'badge--out' },
};

function methodLabel(method: string): string {
  return PAYMENT_METHODS.find((option) => option.value === method)?.label ?? method;
}

type Tab = 'items' | 'payments' | 'photo';

/**
 * One supplier bill, opened in a popup: who it came from and when, what it came to and how much of
 * it is paid, then the items, the payments and the photo of the bill — each on its own tab.
 *
 * <p>Every figure is the server's. Escape, the close button and a click outside all close it, and
 * focus goes into the popup when it opens and back to the Details button when it closes.</p>
 */
export function BillDetailDialog({
  bill,
  onClose,
  onPay,
  onChanged,
}: {
  bill: PurchaseBillSummary;
  onClose: () => void;
  /** Offered while anything is owed; the list opens its Pay popup in place of this one. */
  onPay: () => void;
  /** A screenshot or bill photo was attached — the list refreshes its badges. */
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('items');
  const closeRef = useRef<HTMLButtonElement>(null);
  // Held in a ref so the effect below runs once: re-running it on every render of the list would
  // bounce focus out of the popup and back.
  const closeHandler = useRef(onClose);

  useEffect(() => {
    closeHandler.current = onClose;
  }, [onClose]);

  const detail = useQuery({
    queryKey: ['purchase-bill', bill.id],
    queryFn: () => purchaseBillApi.get(bill.id),
  });
  const data = detail.data;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeHandler.current();
      }
    };

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, []);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-bill', bill.id] });
    onChanged();
  };

  const shown = data ?? bill;
  const status = STATUS[shown.status];
  // Paid against what is left once returns are taken off — the same three the server's status reads.
  const owedAtMost = Math.max(shown.total - shown.returned, 0);
  const paidShare = owedAtMost > 0 ? Math.min(100, (shown.paid / owedAtMost) * 100) : 100;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'items', label: `Items${data ? ` (${data.lines.length})` : ''}` },
    { id: 'payments', label: `Payments${data ? ` (${data.payments.length})` : ''}` },
    { id: 'photo', label: 'Bill photo' },
  ];

  return (
    <div
      className="modal"
      onMouseDown={(event) => {
        // Only a click on the dimmed backdrop itself closes it, never one that started inside.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal__panel bill-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-dialog-title"
      >
        <header className="bill-dialog__head">
          <div>
            <h3 id="bill-dialog-title">{bill.supplierName}</h3>
            <p className="modal__hint">
              {bill.billNumber ? `Bill ${bill.billNumber} · ` : ''}
              {billDay(bill.billDate)} · recorded by {bill.recordedBy}
            </p>
          </div>
          <span className={`badge ${status.badge}`}>{status.label}</span>
          <button
            ref={closeRef}
            type="button"
            className="bill-dialog__close"
            aria-label="Close bill details"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <dl className="bill-dialog__figures">
          <div>
            <dt>Total</dt>
            <dd>{formatPkr(shown.total)}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{formatPkr(shown.paid)}</dd>
          </div>
          {shown.returned > 0 && (
            <div>
              <dt>Sent back</dt>
              <dd>{formatPkr(shown.returned)}</dd>
            </div>
          )}
          <div className={shown.due > 0 ? 'is-owing' : 'is-settled'}>
            <dt>Owed</dt>
            <dd data-testid="bill-dialog-due">{formatPkr(shown.due)}</dd>
          </div>
        </dl>

        <div
          className="bill-dialog__meter"
          role="meter"
          aria-label="Share of the bill paid"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(paidShare)}
        >
          <i style={{ width: `${paidShare}%` }} />
        </div>

        {shown.note && <p className="bill-dialog__note">{shown.note}</p>}

        <div className="bill-dialog__tabs" role="tablist" aria-label="Bill details">
          {tabs.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              id={`bill-tab-${option.id}`}
              aria-selected={tab === option.id}
              aria-controls={`bill-panel-${option.id}`}
              onClick={() => setTab(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div
          className="bill-dialog__body"
          role="tabpanel"
          id={`bill-panel-${tab}`}
          aria-labelledby={`bill-tab-${tab}`}
        >
          <QueryState isLoading={detail.isPending} error={detail.error}>
            {data && tab === 'items' && (
              <table className="data-table">
                <caption className="visually-hidden">Items on the bill</caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Cost</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line) => (
                    <tr key={line.purchaseId}>
                      <td>
                        {line.productName}
                        {line.returnedQty > 0 && (
                          <span className="badge badge--low bill-dialog__returned">
                            {line.returnedQty} sent back
                          </span>
                        )}
                      </td>
                      <td className="numeric">{line.quantity}</td>
                      <td className="numeric">{formatPkr(line.unitCost)}</td>
                      <td className="numeric">{formatPkr(line.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={3}>
                      Bill total
                    </th>
                    <td className="numeric">{formatPkr(data.total)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {data && tab === 'payments' && data.payments.length === 0 && (
              <p className="empty-state">Nothing paid against this bill yet.</p>
            )}

            {data && tab === 'payments' && data.payments.length > 0 && (
              <ol className="bill-dialog__payments">
                {data.payments.map((payment) => (
                  <li key={payment.id}>
                    <div>
                      <strong>{formatPkr(payment.amount)}</strong>
                      <span className="modal__hint">
                        {billDay(payment.paidOn)} · {methodLabel(payment.paymentMethod)}
                        {payment.note ? ` · ${payment.note}` : ''}
                      </span>
                    </div>
                    {needsProof(payment.paymentMethod) && (
                      <ProofAttachment
                        kind="supplier-payment"
                        id={payment.id}
                        hasProof={payment.hasProof}
                        onAttached={refresh}
                      />
                    )}
                  </li>
                ))}
              </ol>
            )}

            {data && tab === 'photo' && (
              <div className="bill-dialog__photo">
                <p className="modal__hint">
                  {data.hasBillImage
                    ? 'The supplier’s bill is on file.'
                    : 'No photo of the supplier’s bill yet.'}
                </p>
                <ProofAttachment
                  kind="purchase-bill"
                  id={bill.id}
                  hasProof={data.hasBillImage}
                  onAttached={refresh}
                />
              </div>
            )}
          </QueryState>
        </div>

        <div className="form-actions">
          {shown.due > 0 && (
            <button type="button" className="button--primary" onClick={onPay}>
              Pay {formatPkr(shown.due)}
            </button>
          )}
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
