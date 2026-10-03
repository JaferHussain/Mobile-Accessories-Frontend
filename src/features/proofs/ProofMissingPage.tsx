import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { PAYMENT_METHODS } from '@/features/pos/posApi';
import { ProofAttachment } from './ProofAttachment';
import { PROOF_KIND_SLUGS, proofApi, type MissingProof } from './proofApi';

const KIND_LABELS: Record<MissingProof['kind'], string> = {
  Sale: 'Sale',
  CustomerPayment: 'Udhaar recovery',
  SupplierPayment: 'Supplier payment',
  Refund: 'Refund',
  Expense: 'Expense',
};

function methodLabel(method: string | null): string {
  if (method === 'Bank') {
    // A bank expense recorded before its method was asked for.
    return 'Bank';
  }

  return PAYMENT_METHODS.find((option) => option.value === method)?.label ?? method ?? '—';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  });
}

/**
 * Every non-cash transaction still without its proof — the owner's daily list to chase.
 *
 * <p>A proof is optional when a transaction is saved, so the counter never waits on a customer's
 * screenshot. This list is what makes "every transaction is provable" true anyway: each line can
 * be proved from right here, and leaves the list once it is. Admin only — it spans supplier
 * payments and expenses, which are the owner's alone.</p>
 */
export function ProofMissingPage() {
  const queryClient = useQueryClient();

  const missing = useQuery({
    queryKey: ['proofs', 'missing'],
    queryFn: () => proofApi.missing(),
  });

  return (
    <section>
      <header className="page-header">
        <h2>Proof missing</h2>
      </header>

      <p className="page-intro">
        Every payment received or sent by transfer, JazzCash, EasyPaisa or Raast is kept with a
        screenshot. These are still waiting for one.
      </p>

      <QueryState
        isLoading={missing.isPending}
        error={missing.error}
        isEmpty={missing.data?.length === 0}
        emptyMessage="Every non-cash transaction has its proof. Nothing to chase."
      >
        <table className="data-table">
          <caption className="visually-hidden">Transactions without a proof</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Type</th>
              <th scope="col">Reference</th>
              <th scope="col">From / to</th>
              <th scope="col">Paid by</th>
              <th scope="col">Amount</th>
              <th scope="col">
                <span className="visually-hidden">Proof</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {missing.data?.map((row) => (
              <tr key={`${row.kind}-${row.referenceId}`}>
                <td>{formatDate(row.entryDateUtc)}</td>
                <td>{KIND_LABELS[row.kind]}</td>
                <td>{row.reference ?? '—'}</td>
                <td>{row.party ?? (row.kind === 'Sale' ? 'Walk-in' : '—')}</td>
                <td>{methodLabel(row.method)}</td>
                <td className="numeric">{formatPkr(row.amount)}</td>
                <td>
                  <ProofAttachment
                    kind={PROOF_KIND_SLUGS[row.kind]}
                    id={row.referenceId}
                    hasProof={false}
                    onAttached={() => void queryClient.invalidateQueries({ queryKey: ['proofs', 'missing'] })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
    </section>
  );
}
