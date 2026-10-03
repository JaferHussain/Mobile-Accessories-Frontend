import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { PAYMENT_METHODS } from '@/features/pos/posApi';
import { supplierApi, type SupplierLedgerEntry } from './supplierApi';
import { ProofAttachment } from '@/features/proofs/ProofAttachment';
import { needsProof } from '@/features/proofs/proofApi';

const ENTRY_LABELS: Record<SupplierLedgerEntry['entryType'], string> = {
  Purchase: 'Purchase',
  Return: 'Return',
  Payment: 'Payment',
};

function formatDate(iso: string): string {
  // The account is read in shop-local days, the same as the customer register.
  return new Date(iso).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  });
}

function methodLabel(method: string | null): string | null {
  return PAYMENT_METHODS.find((option) => option.value === method)?.label ?? method;
}

/**
 * One line in words: what was bought, what went back and why, or how the money went and its
 * reference. Wording only — every amount on the line is the server's.
 */
function detailsFor(entry: SupplierLedgerEntry): string {
  const goods = entry.productName ? `${entry.productName} × ${entry.quantity ?? 0}` : null;

  const parts =
    entry.entryType === 'Payment'
      ? [methodLabel(entry.paymentMethod), entry.shopAccountName, entry.note]
      : entry.entryType === 'Return'
        ? [entry.referenceNumber, goods, entry.note]
        : [goods];

  return parts.filter(Boolean).join(' · ') || '—';
}

const amount = (value: number) => (value > 0 ? formatPkr(value) : '—');

/**
 * A supplier's account: every purchase, return and payment, in date order, with what was owed
 * after each — the history behind "You owe" on the Suppliers list.
 *
 * <p><b>The server runs the balance.</b> It builds the account from the same three tables the
 * payable balance is the sum of, so the last line always equals "You owe". A date range only
 * chooses which lines are shown; the period opens on what was already owed before it.</p>
 *
 * <p>Admin only, like everything under Purchasing: it shows purchase cost and what the shop
 * owes. Reached from the rail, or from the Ledger button on a supplier's row.</p>
 */
export function SupplierLedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const supplierId = Number(searchParams.get('supplierId')) || null;

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const suppliers = useQuery({
    queryKey: ['suppliers', 'picker'],
    queryFn: () => supplierApi.search(),
  });

  const ledger = useQuery({
    queryKey: ['supplier-ledger', supplierId, from, to],
    queryFn: () => supplierApi.ledger(supplierId!, from || undefined, to || undefined),
    enabled: supplierId !== null,
  });

  const data = ledger.data;
  // A Proof column only when some payment went by transfer.
  const showsProof =
    data?.entries.some((entry) => entry.entryType === 'Payment' && needsProof(entry.paymentMethod)) ?? false;

  return (
    <section className="ledger">
      <header className="page-header">
        <h2>Supplier ledger</h2>
      </header>

      <div className="filters">
        <div className="field">
          <label htmlFor="ledgerSupplier">Supplier</label>
          <select
            id="ledgerSupplier"
            value={supplierId ?? ''}
            onChange={(event) =>
              setSearchParams(event.target.value ? { supplierId: event.target.value } : {})
            }
          >
            <option value="" disabled>
              Choose a supplier
            </option>
            {suppliers.data?.items.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="ledgerFrom">From</label>
          <input id="ledgerFrom" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="ledgerTo">To</label>
          <input id="ledgerTo" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
      </div>

      {supplierId === null ? (
        <p className="ledger__empty">Choose a supplier to see every purchase, return and payment.</p>
      ) : (
        <QueryState isLoading={ledger.isPending} error={ledger.error}>
          {data && (
            <>
              <header className="ledger__header">
                <div>
                  <h3>{data.supplierName}</h3>
                  <p className="ledger__mobile">
                    {data.from || data.to
                      ? `${data.from ?? 'Start'} to ${data.to ?? 'today'}`
                      : 'Every dealing since the first'}
                  </p>
                </div>
              </header>

              {/* All-time, whatever range is shown, so the four always add up:
                  purchased − returned − paid = owed. */}
              <dl className="ledger__summary">
                <dt>Total purchased</dt>
                <dd data-testid="total-purchased">{formatPkr(data.totalPurchased)}</dd>

                <dt>Returned</dt>
                <dd data-testid="total-returned">{formatPkr(data.totalReturned)}</dd>

                <dt>Paid</dt>
                <dd data-testid="total-paid">{formatPkr(data.totalPaid)}</dd>

                <dt>You owe</dt>
                <dd
                  data-testid="total-owed"
                  className={data.payableBalance > 0 ? 'ledger__owing' : undefined}
                >
                  {formatPkr(data.payableBalance)}
                </dd>
              </dl>

              {data.entries.length === 0 && !data.from ? (
                <p className="ledger__empty">No purchases, returns or payments yet.</p>
              ) : (
                <table className="ledger__table">
                  <caption className="visually-hidden">Account with {data.supplierName}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Type</th>
                      <th scope="col">Details</th>
                      <th scope="col">Purchased</th>
                      <th scope="col">Returned</th>
                      <th scope="col">Paid</th>
                      <th scope="col">Balance</th>
                      {showsProof && <th scope="col">Proof</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {/* A range opens on what was already owed — never on a pretend zero. */}
                    {data.from && (
                      <tr>
                        <td>{data.from}</td>
                        <td>Brought forward</td>
                        <td>Owed before this period</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td data-testid="opening-balance">{formatPkr(data.openingBalance)}</td>
                        {showsProof && <td />}
                      </tr>
                    )}

                    {data.entries.map((entry) => (
                      <tr key={`${entry.entryType}-${entry.referenceId}`}>
                        <td>{formatDate(entry.entryDateUtc)}</td>
                        <td>{ENTRY_LABELS[entry.entryType]}</td>
                        <td>{detailsFor(entry)}</td>
                        <td>{amount(entry.billAmount)}</td>
                        <td>{amount(entry.returnedAmount)}</td>
                        <td>{amount(entry.paidAmount)}</td>
                        <td data-testid="balance">{formatPkr(entry.balanceAfter)}</td>
                        {showsProof && (
                          <td>
                            {entry.entryType === 'Payment' && needsProof(entry.paymentMethod) && (
                              <ProofAttachment
                                kind="supplier-payment"
                                id={entry.referenceId}
                                hasProof={entry.hasProof}
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
      )}
    </section>
  );
}
