import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { ApiError } from '@/types/api';
import { PAYMENT_METHODS, type PaymentMethod } from '@/features/pos/posApi';
import { ProofAttachment } from '@/features/proofs/ProofAttachment';
import { ProofFileField } from '@/features/proofs/ProofFileField';
import { attachProofAfterSave, needsProof, proofOutcomeText } from '@/features/proofs/proofApi';
import { commissionApi, type CommissionLine } from './commissionApi';

/** The real ways to pay the salesman. */
const PAYOUT_METHODS = PAYMENT_METHODS.filter((method) => method.value !== 'Credit' && method.value !== 'Partial');

function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return `${day} ${months[Number(month) - 1]} ${year}`;
}

function statusText(line: CommissionLine): string {
  if (line.status === 'Earned') {
    return line.earnedOn ? `Earned ${formatDay(line.earnedOn).slice(0, 6)}` : 'Earned';
  }

  // Commission on udhaar is his once the customer has paid — never before.
  return line.status === 'PartEarned'
    ? `Part earned · ${formatPkr(line.pending)} waiting for udhaar`
    : 'Waiting for udhaar';
}

/**
 * A field salesman's commission — the owner's rule: half of whatever he sells above the owner's
 * price, earned once the customer has paid for it.
 *
 * <p>The owner reads it here product by product, sees what is earned and what is still waiting on
 * udhaar, and pays him. He can never be paid more than he has earned; a cash payment comes out of
 * the drawer at day close.</p>
 */
export function CommissionPage() {
  const userId = Number(useParams().userId);
  const queryClient = useQueryClient();

  const statement = useQuery({
    queryKey: ['commission', userId],
    queryFn: () => commissionApi.statement(userId),
  });

  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [note, setNote] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The amount starts at what he is owed, once that is known.
  useEffect(() => {
    if (statement.data) {
      setAmount(statement.data.owed);
    }
  }, [statement.data]);

  const pay = useMutation({
    mutationFn: async () => {
      const result = await commissionApi.pay(userId, amount, method as PaymentMethod, note.trim() || null);
      return attachProofAfterSave('commission-payout', result.payoutId, proofFile, method);
    },
    onSuccess: async (proof) => {
      setNotice(`Commission paid.${proofOutcomeText(proof)}`);
      setMethod('');
      setNote('');
      setProofFile(null);
      await queryClient.invalidateQueries({ queryKey: ['commission', userId] });
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Could not record the payment.'),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!(amount > 0)) {
      setError('The amount paid must be more than zero.');
      return;
    }

    if (!method) {
      setError('Say how the commission was paid — cash, bank transfer, JazzCash…');
      return;
    }

    pay.mutate();
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
              <h2>{data.fullName} — commission</h2>
            </header>

            <p className="page-intro">Half of whatever he sells above your price, earned once the customer has paid.</p>

            <dl className="ledger__summary">
              <dt>Earned</dt>
              <dd data-testid="earned">{formatPkr(data.earned)}</dd>

              <dt>Waiting for udhaar</dt>
              <dd data-testid="pending">{formatPkr(data.pending)}</dd>

              <dt>Paid to him</dt>
              <dd data-testid="paid-out">{formatPkr(data.paidOut)}</dd>

              <dt>You owe him</dt>
              <dd data-testid="owed" className={data.owed > 0 ? 'ledger__owing' : undefined}>
                {formatPkr(data.owed)}
              </dd>
            </dl>

            {notice && (
              <p className="form-success" role="status">
                {notice}
              </p>
            )}

            <form className="card inline-form" onSubmit={submit} noValidate>
              <h3>Pay commission</h3>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <div className="field">
                <label htmlFor="payoutAmount">Amount</label>
                <input
                  id="payoutAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={String(amount)}
                  onChange={(event) => setAmount(Number(event.target.value))}
                />
              </div>

              <div className="field">
                <label htmlFor="payoutMethod">Paid by</label>
                <select id="payoutMethod" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod | '')}>
                  <option value="">Choose…</option>
                  {PAYOUT_METHODS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <small className="field__hint">Cash comes out of the drawer at day close.</small>
              </div>

              <ProofFileField id="payoutProof" method={method} onFile={setProofFile} />

              <div className="field">
                <label htmlFor="payoutNote">Note</label>
                <input id="payoutNote" maxLength={255} value={note} onChange={(event) => setNote(event.target.value)} />
              </div>

              <button type="submit" disabled={pay.isPending || data.owed <= 0}>
                Pay commission
              </button>
            </form>

            <h3>Product by product</h3>

            {data.lines.length === 0 ? (
              <p className="empty-state">No commission yet — his sales above your price appear here.</p>
            ) : (
              <table className="data-table">
                <caption className="visually-hidden">Commission by product</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Invoice</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Product</th>
                    <th scope="col">Units</th>
                    <th scope="col">Your price</th>
                    <th scope="col">Sold at</th>
                    <th scope="col">Commission</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line) => (
                    <tr key={`${line.invoiceId}-${line.productName}`}>
                      <td>{formatDay(line.saleDate)}</td>
                      <td>{line.invoiceNumber}</td>
                      <td>{line.customerName ?? 'Walk-in'}</td>
                      <td>{line.productName}</td>
                      <td className="numeric">
                        {line.unitsSold - line.unitsReturned}
                        {line.unitsReturned > 0 && <small className="field__hint"> ({line.unitsReturned} returned)</small>}
                      </td>
                      <td className="numeric">{formatPkr(line.baseUnitPrice)}</td>
                      <td className="numeric">{formatPkr(line.soldAtUnitPrice)}</td>
                      <td className="numeric">{formatPkr(line.commission)}</td>
                      <td>{statusText(line)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3>Paid to him</h3>

            {data.payouts.length === 0 ? (
              <p className="empty-state">Nothing paid yet.</p>
            ) : (
              <table className="data-table">
                <caption className="visually-hidden">Commission paid</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Paid by</th>
                    <th scope="col">Recorded by</th>
                    <th scope="col">Note</th>
                    {data.payouts.some((payout) => needsProof(payout.paymentMethod)) && <th scope="col">Proof</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.payouts.map((payout) => (
                    <tr key={payout.id}>
                      <td>{new Date(payout.paidAtUtc).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })}</td>
                      <td className="numeric">{formatPkr(payout.amount)}</td>
                      <td>{PAYMENT_METHODS.find((option) => option.value === payout.paymentMethod)?.label ?? payout.paymentMethod}</td>
                      <td>{payout.recordedBy}</td>
                      <td>{payout.note ?? '—'}</td>
                      {data.payouts.some((row) => needsProof(row.paymentMethod)) && (
                        <td>
                          {needsProof(payout.paymentMethod) && (
                            <ProofAttachment
                              kind="commission-payout"
                              id={payout.id}
                              hasProof={payout.hasProof === true}
                              onAttached={() => void queryClient.invalidateQueries({ queryKey: ['commission', userId] })}
                            />
                          )}
                        </td>
                      )}
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
