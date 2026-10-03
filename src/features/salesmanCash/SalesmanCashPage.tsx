import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { ApiError } from '@/types/api';
import { PAYMENT_METHODS, type PaymentMethod } from '@/features/pos/posApi';
import { salesmanCashApi, type SalesmanCashKind } from './salesmanCashApi';

/** The real ways money can reach the shop from him. */
const HANDOVER_METHODS = PAYMENT_METHODS.filter((method) => method.value !== 'Credit' && method.value !== 'Partial');

const KIND_LABELS: Record<SalesmanCashKind, string> = {
  Sale: 'Sale',
  Recovery: 'Udhaar recovered',
  Refund: 'Refund on a return',
  Handover: 'Handed over',
};

/**
 * The cash a field salesman is carrying from the market, and the owner's "Received from salesman".
 *
 * <p>Day close leaves his market cash out of the drawer until it is handed over here; a cash
 * handover then joins the drawer that day. Worked out from what he recorded — never a figure he
 * types — and the owner can never receive more than he holds.</p>
 */
export function SalesmanCashPage() {
  const userId = Number(useParams().userId);
  const queryClient = useQueryClient();

  const statement = useQuery({
    queryKey: ['salesman-cash', userId],
    queryFn: () => salesmanCashApi.statement(userId),
  });

  const [amount, setAmount] = useState(0);
  // Starts unanswered: cash joins the drawer at day close, a transfer went into a shop account.
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The amount starts at what he holds, once that is known.
  useEffect(() => {
    if (statement.data) {
      setAmount(statement.data.inHand);
    }
  }, [statement.data]);

  const receive = useMutation({
    mutationFn: () => salesmanCashApi.receive(userId, amount, method as PaymentMethod, note.trim() || null),
    onSuccess: async () => {
      setMethod('');
      setNote('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['salesman-cash', userId] }),
        queryClient.invalidateQueries({ queryKey: ['team'] }),
        queryClient.invalidateQueries({ queryKey: ['day-closing'] }),
      ]);
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Could not record the money received.'),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!(amount > 0)) {
      setError('The amount received must be more than zero.');
      return;
    }

    if (!method) {
      setError('Say how he handed it over — cash into the drawer, or by transfer.');
      return;
    }

    receive.mutate();
  }

  const data = statement.data;

  return (
    <section>
      <Link className="link-button" to="/team">
        ← Team
      </Link>

      <QueryState isLoading={statement.isPending} error={statement.error}>
        {data && (
          <>
            <header className="page-header">
              <h2>{data.fullName} — cash with him</h2>
            </header>

            <p className="page-intro">
              What he took in the market, less what he gave back and handed over. It joins the drawer only once
              you receive it.
            </p>

            <dl className="ledger__summary">
              <dt>Collected</dt>
              <dd data-testid="collected">{formatPkr(data.collected)}</dd>

              <dt>Refunded</dt>
              <dd data-testid="refunded">{formatPkr(data.refunded)}</dd>

              <dt>Handed over</dt>
              <dd data-testid="handed-over">{formatPkr(data.handedOver)}</dd>

              <dt>With him now</dt>
              <dd data-testid="in-hand" className={data.inHand > 0 ? 'ledger__owing' : undefined}>
                {formatPkr(data.inHand)}
              </dd>
            </dl>

            <form className="card inline-form" onSubmit={submit} noValidate>
              <h3>Received from salesman</h3>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <div className="field">
                <label htmlFor="handoverAmount">Amount</label>
                <input
                  id="handoverAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={String(amount)}
                  onChange={(event) => setAmount(Number(event.target.value))}
                />
              </div>

              <div className="field">
                <label htmlFor="handoverMethod">Received as</label>
                <select
                  id="handoverMethod"
                  value={method}
                  onChange={(event) => setMethod(event.target.value as PaymentMethod | '')}
                >
                  <option value="">Choose…</option>
                  {HANDOVER_METHODS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <small className="field__hint">Cash joins today's drawer at day close; a transfer does not.</small>
              </div>

              <div className="field">
                <label htmlFor="handoverNote">Note</label>
                <input id="handoverNote" maxLength={255} value={note} onChange={(event) => setNote(event.target.value)} />
              </div>

              <button type="submit" disabled={receive.isPending || data.inHand <= 0}>
                Received from salesman
              </button>
            </form>

            <h3>Cash movements</h3>

            {data.movements.length === 0 ? (
              <p className="empty-state">Nothing yet — cash he takes in the market appears here.</p>
            ) : (
              <table className="data-table">
                <caption className="visually-hidden">Cash movements</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">What</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Customer / received by</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movements.map((movement) => (
                    <tr key={`${movement.kind}-${movement.referenceId}`}>
                      <td>
                        {new Date(movement.entryDateUtc).toLocaleString('en-PK', {
                          day: '2-digit',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: 'Asia/Karachi',
                        })}
                      </td>
                      <td>
                        {KIND_LABELS[movement.kind] ?? movement.kind}
                        {movement.kind === 'Handover' && movement.method && movement.method !== 'Cash' && (
                          <small className="field__hint">
                            {' '}
                            ({PAYMENT_METHODS.find((option) => option.value === movement.method)?.label ?? movement.method})
                          </small>
                        )}
                      </td>
                      <td>{movement.reference ?? '—'}</td>
                      <td>{movement.detail ?? '—'}</td>
                      <td className="numeric">
                        {movement.effect < 0 ? '− ' : '+ '}
                        {formatPkr(Math.abs(movement.effect))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </QueryState>
    </section>
  );
}
