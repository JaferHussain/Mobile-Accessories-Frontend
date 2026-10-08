import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { customerApi, type ReceivePaymentResult } from '@/features/customers/customerApi';
import { ReceivePaymentModal } from '@/features/customers/ReceivePaymentModal';
import { ReminderButtons } from '@/features/customers/ReminderButtons';
import { documentApi } from '@/features/documents/documentApi';
import { ShareButtons } from '@/features/documents/ShareButtons';
import type { PaymentMethod } from '@/features/pos/posApi';
import { attachProofAfterSave, proofOutcomeText, type ProofOutcome } from '@/features/proofs/proofApi';
import { recoveryApi, type RecoveryAccount, type RecoveryBill } from './recoveryApi';

type Filter = 'all' | 'udhaar' | 'partpaid' | 'overdue';

const FILTERS: ReadonlyArray<[Filter, string]> = [
  ['all', 'All'],
  ['udhaar', 'Udhaar customers'],
  ['partpaid', 'Part paid'],
  ['overdue', 'Overdue'],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A `yyyy-mm-dd` shop day, read from its parts — never through Date, which would place it at UTC midnight. */
function day(isoDate: string): string {
  const [year, month, date] = isoDate.split('-');
  return `${Number(date)} ${MONTHS[Number(month) - 1]} ${year}`;
}

function billLabel(bill: RecoveryBill): string {
  if (bill.referenceNumber) {
    return bill.referenceNumber;
  }

  return bill.entryType === 'OpeningBalance' ? 'Brought forward' : bill.entryType;
}

function matches(account: RecoveryAccount, filter: Filter, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (term && !account.name.toLowerCase().includes(term) && !(account.mobileNumber ?? '').includes(term)) {
    return false;
  }

  switch (filter) {
    case 'udhaar':
      return account.isUdhaarCustomer;
    case 'partpaid':
      return account.partPaidBills > 0;
    case 'overdue':
      return account.monthsOverdue > 0;
    default:
      return true;
  }
}

function AccountCard({
  account,
  onReceive,
}: {
  account: RecoveryAccount;
  onReceive: (account: RecoveryAccount) => void;
}) {
  const [showBills, setShowBills] = useState(false);
  const overdue = account.monthsOverdue > 0;

  return (
    <article
      className={`recovery-card${overdue ? ' recovery-card--overdue' : ''}`}
      data-testid={`recovery-${account.customerId}`}
    >
      <header className="recovery-card__head">
        <div>
          <h3>{account.name}</h3>
          <span className="recovery-card__meta">
            {account.mobileNumber ?? 'No phone number'}
            {account.isUdhaarCustomer ? (
              <span className="badge badge--udhaar">Udhaar customer</span>
            ) : (
              <span className="badge badge--low">Part payment</span>
            )}
          </span>
        </div>
        <strong className="recovery-card__amount">{formatPkr(account.outstanding)}</strong>
      </header>

      <p className="recovery-card__when">
        {account.unpaidSince && <>Owing since {day(account.unpaidSince)}</>}
        {account.dueOn && <> · due {day(account.dueOn)}</>}
        {overdue && (
          <span className="badge badge--out">
            {account.monthsOverdue} {account.monthsOverdue === 1 ? 'month' : 'months'} overdue
          </span>
        )}
      </p>

      <div className="recovery-card__actions">
        <button type="button" className="button--primary" onClick={() => onReceive(account)}>
          Receive payment
        </button>
        <ReminderButtons
          customerId={account.customerId}
          customerMobile={account.mobileNumber}
          onCreateReminder={customerApi.reminder}
        />
        {account.openBills.length > 0 && (
          <button type="button" className="link-button" aria-expanded={showBills} onClick={() => setShowBills((open) => !open)}>
            {showBills ? 'Hide bills' : `Show ${account.openBills.length} open ${account.openBills.length === 1 ? 'bill' : 'bills'}`}
          </button>
        )}
      </div>

      {showBills && (
        <table className="data-table recovery-card__bills">
          <caption className="visually-hidden">Open bills of {account.name}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Bill</th>
              <th scope="col">Amount</th>
              <th scope="col">Still owed</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {account.openBills.map((bill, index) => (
              <tr key={`${bill.referenceId ?? 'b'}-${index}`}>
                <td>{day(bill.onDate)}</td>
                <td>{billLabel(bill)}</td>
                <td className="numeric">{formatPkr(bill.billAmount)}</td>
                <td className="numeric owing">{formatPkr(bill.remaining)}</td>
                <td>
                  {bill.status === 'PartPaid' ? (
                    <span className="badge badge--low">Part paid</span>
                  ) : (
                    <span className="badge badge--out">Not paid</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

/**
 * Recovery — everyone who owes the shop money, most overdue first, and the two things to do about
 * it: remind them, and take the payment. Every figure is the server's: which bills are still open
 * (payments settle the oldest first) and when each debt fell due.
 */
export function RecoveryPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [receiving, setReceiving] = useState<RecoveryAccount | null>(null);
  const [justPaid, setJustPaid] = useState<{
    account: RecoveryAccount;
    result: ReceivePaymentResult;
    proof: ProofOutcome;
  } | null>(null);

  const report = useQuery({ queryKey: ['recovery'], queryFn: () => recoveryApi.report() });

  const receive = useMutation({
    mutationFn: (input: {
      account: RecoveryAccount;
      amount: number;
      method: PaymentMethod;
      note: string | null;
      confirmOverpayment: boolean;
      proofFile: File | null;
    }) => customerApi.receivePayment(input.account.customerId, input.amount, input.method, input.note, input.confirmOverpayment),
    onSuccess: async (result, input) => {
      const proof = await attachProofAfterSave('customer-payment', result.paymentId, input.proofFile, input.method);
      setJustPaid({ account: input.account, result, proof });
      setReceiving(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recovery'] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['ledger', input.account.customerId] }),
        queryClient.invalidateQueries({ queryKey: ['customer', input.account.customerId] }),
      ]);
    },
  });

  const data = report.data;
  const shown = useMemo(
    () => (data?.accounts ?? []).filter((account) => matches(account, filter, search)),
    [data, filter, search],
  );

  return (
    <section>
      <header className="page-header">
        <h2>Recovery</h2>
      </header>

      <p className="page-intro">Everyone who owes the shop money, most overdue first.</p>

      {justPaid && (
        <div className="form-success" role="status">
          <p>
            Received {formatPkr(justPaid.result.amount)} from {justPaid.account.name} — {justPaid.result.receiptNumber}.{' '}
            {justPaid.result.balanceAfter > 0 ? `${formatPkr(justPaid.result.balanceAfter)} still owed.` : 'Account settled.'}
            {proofOutcomeText(justPaid.proof)}
          </p>
          <ShareButtons
            documentType="PaymentReceipt"
            referenceId={justPaid.result.paymentId}
            customerMobile={justPaid.account.mobileNumber}
            hasCustomer
            onFetchDocument={(_documentType, referenceId) => documentApi.paymentReceiptPdf(referenceId)}
            onCreateShareLink={documentApi.createShareLink}
          />
          <button type="button" onClick={() => setJustPaid(null)}>
            Done
          </button>
        </div>
      )}

      <QueryState isLoading={report.isPending} error={report.error}>
        {data && (
          <>
            <div className="stat-tiles">
              <div className="stat-tile">
                <span className="stat-tile__label">Owed to the shop</span>
                <strong className="stat-tile__value" data-testid="total-owed">
                  {formatPkr(data.totalOwed)}
                </strong>
              </div>
              <div className="stat-tile">
                <span className="stat-tile__label">Customers owing</span>
                <strong className="stat-tile__value" data-testid="customers-owing">
                  {data.customersOwing}
                </strong>
              </div>
              <div className={`stat-tile${data.overdueCustomers > 0 ? ' stat-tile--alert' : ''}`}>
                <span className="stat-tile__label">Overdue</span>
                <strong className="stat-tile__value" data-testid="overdue">
                  {data.overdueCustomers} · {formatPkr(data.overdueAmount)}
                </strong>
              </div>
            </div>

            <div className="filters">
              <div className="view-toggle" role="group" aria-label="Show">
                {FILTERS.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="field">
                <label htmlFor="recoverySearch">Search</label>
                <input
                  id="recoverySearch"
                  value={search}
                  placeholder="Name or phone number"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>

            {data.accounts.length === 0 ? (
              <p className="empty-state">Nobody owes the shop anything. Every account is settled.</p>
            ) : shown.length === 0 ? (
              <p className="empty-state">Nobody matches that.</p>
            ) : (
              <div className="recovery-list">
                {shown.map((account) => (
                  <AccountCard
                    key={account.customerId}
                    account={account}
                    onReceive={(chosen) => {
                      setJustPaid(null);
                      setReceiving(chosen);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </QueryState>

      {receiving && (
        <ReceivePaymentModal
          customerName={receiving.name}
          outstandingBalance={receiving.outstanding}
          onReceive={async (amount, method, note, confirmOverpayment, proofFile) => {
            await receive.mutateAsync({ account: receiving, amount, method, note, confirmOverpayment, proofFile });
          }}
          onCancel={() => setReceiving(null)}
        />
      )}
    </section>
  );
}
