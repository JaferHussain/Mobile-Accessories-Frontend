import { formatPkr } from '@/lib/money';
import { ShareButtons } from '@/features/documents/ShareButtons';
import type { DocumentType, ShareLink } from '@/features/documents/documentApi';
import { ReminderButtons } from './ReminderButtons';
import { ProofAttachment } from '@/features/proofs/ProofAttachment';
import { needsProof, type ProofKind } from '@/features/proofs/proofApi';
import type { Customer, CustomerSummary, LedgerEntry, PaymentReminder } from './customerApi';

export interface CustomerLedgerProps {
  customer: Customer;
  summary: CustomerSummary;
  entries: LedgerEntry[];
  onReceivePayment: () => void;

  /**
   * Sharing, wired in by the page. Optional so the register stays a function of its own data and
   * remains testable on its own, which is how every existing ledger test renders it.
   */
  onFetchDocument?: (documentType: DocumentType, referenceId: number) => Promise<Blob>;
  onCreateShareLink?: (
    documentType: DocumentType,
    referenceId: number,
    mobileNumber?: string | null,
  ) => Promise<ShareLink>;

  /** A payment reminder. Optional for the same reason; offered only while money is owed. */
  onCreateReminder?: (customerId: number) => Promise<PaymentReminder>;
}

/**
 * Which ledger rows have a document behind them.
 *
 * A sale and a payment do. An opening balance was brought forward from the paper register and a
 * return or adjustment is a correction — none of those has a receipt to send, and offering one
 * would promise a document that does not exist.
 */
function documentFor(entry: LedgerEntry): DocumentType | null {
  if (entry.referenceId === null || entry.referenceId === undefined) {
    return null;
  }

  if (entry.entryType === 'Invoice') {
    return 'Invoice';
  }

  return entry.entryType === 'Payment' ? 'PaymentReceipt' : null;
}

/**
 * Which proof a ledger line carries: a sale's or a payment's, and only when it was paid by
 * transfer. Cash was counted into the drawer; a return or adjustment moved no money here.
 */
function proofKindFor(entry: LedgerEntry): ProofKind | null {
  if (entry.referenceId == null || !needsProof(entry.paymentMethod)) {
    return null;
  }

  if (entry.entryType === 'Invoice') {
    return 'sale';
  }

  return entry.entryType === 'Payment' ? 'customer-payment' : null;
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
  onFetchDocument,
  onCreateShareLink,
  onCreateReminder,
}: CustomerLedgerProps) {
  const canShare = Boolean(onFetchDocument && onCreateShareLink);
  // A Proof column only when some line was paid by transfer — a cash-only register looks as it
  // always did.
  const showsProof = entries.some((entry) => proofKindFor(entry) !== null);
  const owes = summary.totalOutstanding > 0;

  return (
    <section className="ledger">
      <header className="ledger__header">
        <div>
          <h2>{customer.name}</h2>
          {customer.mobileNumber && <p className="ledger__mobile">{customer.mobileNumber}</p>}
        </div>

        {/* Everything done TO the account sits together on the right: take money, or ask for it. */}
        <div className="ledger__actions">
          <button type="button" onClick={onReceivePayment} disabled={!owes}>
            Receive payment
          </button>

          {/* A reminder for nothing owed is a message the customer should never receive. */}
          {owes && onCreateReminder && (
            <ReminderButtons
              customerId={customer.id}
              customerMobile={customer.mobileNumber}
              onCreateReminder={onCreateReminder}
            />
          )}
        </div>
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
              {showsProof && <th scope="col">Proof</th>}
              {canShare && (
                <th scope="col">
                  <span className="visually-hidden">Give to customer</span>
                </th>
              )}
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

                {showsProof && (
                  <td>
                    {proofKindFor(entry) && (
                      <ProofAttachment
                        kind={proofKindFor(entry)!}
                        id={entry.referenceId!}
                        hasProof={entry.hasProof ?? false}
                      />
                    )}
                  </td>
                )}

                {canShare && (
                  <td>
                    {/* The row already knows which document it is and which one — entryType and
                        referenceId have been here since the register was built. */}
                    {documentFor(entry) && (
                      <ShareButtons
                        documentType={documentFor(entry)!}
                        referenceId={entry.referenceId!}
                        customerMobile={customer.mobileNumber}
                        // They are on file, so a number typed here could silently redirect a
                        // known customer's receipt. The fix belongs on their record.
                        hasCustomer
                        onFetchDocument={onFetchDocument!}
                        onCreateShareLink={onCreateShareLink!}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
