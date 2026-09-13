import { formatPkr } from '@/lib/money';
import type { Customer, CustomerSummary, LedgerEntry } from './customerApi';

export interface CustomerLedgerProps {
  customer: Customer;
  summary: CustomerSummary;
  entries: LedgerEntry[];
  onReceivePayment: () => void;
}

const ENTRY_LABELS: Record<LedgerEntry['entryType'], string> = {
  Invoice: 'Sale',
  Payment: 'Payment',
  SaleReturn: 'Return',
  Adjustment: 'Adjustment',
  // Not a sale. This is what the customer already owed from the paper register (FR-067), and
  // labelling it "Sale" would put money into the shop's sales figures that was never sold.
  OpeningBalance: 'Brought forward',
};

function formatDate(iso: string): string {
  // The register is read in shop-local time, not UTC.
  return new Date(iso).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  });
}

/**
 * The customer's udhaar register.
 *
 * Laid out the way the shopkeeper's own book is: date, what it was, what was billed, what was
 * paid, and the balance that resulted (FR-020).
 */
export function CustomerLedger({
  customer,
  summary,
  entries,
  onReceivePayment,
}: CustomerLedgerProps) {
  const owes = summary.totalOutstanding > 0;

  return (
    <section className="ledger">
      <header className="ledger__header">
        <div>
          <h2>{customer.name}</h2>
          {customer.mobileNumber && <p className="ledger__mobile">{customer.mobileNumber}</p>}
        </div>

        <button type="button" onClick={onReceivePayment} disabled={!owes}>
          Receive payment
        </button>
      </header>

      <dl className="ledger__summary">
        <dt>Total purchased</dt>
        <dd data-testid="total-purchased">{formatPkr(summary.totalPurchased)}</dd>

        <dt>Total paid</dt>
        <dd data-testid="total-paid">{formatPkr(summary.totalPaid)}</dd>

        <dt>Outstanding</dt>
        <dd data-testid="total-outstanding" className={owes ? 'ledger__owing' : undefined}>
          {formatPkr(summary.totalOutstanding)}
        </dd>
      </dl>

      {entries.length === 0 ? (
        <p className="ledger__empty">No entries yet.</p>
      ) : (
        <table className="ledger__table">
          <caption className="visually-hidden">Ledger entries for {customer.name}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Type</th>
              <th scope="col">Reference</th>
              <th scope="col">Bill</th>
              <th scope="col">Paid</th>
              <th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDate(entry.entryDateUtc)}</td>
                <td>{ENTRY_LABELS[entry.entryType]}</td>
                {/* A correction's reason belongs where the register is read, not only in the
                    audit trail (FR-071). */}
                <td>{entry.referenceNumber ?? entry.note ?? '—'}</td>
                <td>{entry.billAmount > 0 ? formatPkr(entry.billAmount) : '—'}</td>
                <td>{entry.paidAmount > 0 ? formatPkr(entry.paidAmount) : '—'}</td>
                <td data-testid={`balance-${entry.id}`}>{formatPkr(entry.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
