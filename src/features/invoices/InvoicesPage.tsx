import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoiceApi, type InvoiceListRow } from './invoiceApi';
import { documentApi } from '@/features/documents/documentApi';
import { ShareButtons } from '@/features/documents/ShareButtons';
import { ShareLinksPanel } from '@/features/documents/ShareLinksPanel';
import { useAuth } from '@/features/auth/AuthContext';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { ProofAttachment } from '@/features/proofs/ProofAttachment';
import { needsProof } from '@/features/proofs/proofApi';

/**
 * Past sales, so a bill can be produced again.
 *
 * <p><b>Why this exists when the customer ledger already lists a customer's invoices.</b> A
 * walk-in belongs to no customer and appears in no ledger — and walk-ins are most counter sales.
 * Without this screen they become unreachable the moment the counter resets, which is exactly the
 * situation a customer returning three days later with a complaint puts the shop in.</p>
 *
 * <p>Deliberately a finder, not an invoice manager: no editing, no voiding. Finding a bill and
 * handing it over is the whole job.</p>
 */
export function InvoicesPage() {
  // Revoking is the owner's: containment over something already released. Sharing stays open to
  // a salesman, who is the one serving the customer.
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // One sale at a time. Rendering every way of handing a bill over against every row turned the
  // table into a wall of controls, and an error from one row pushed all the others around.
  const [sharing, setSharing] = useState<InvoiceListRow | null>(null);

  const invoices = useQuery({
    queryKey: ['invoices', from, to],
    queryFn: () =>
      invoiceApi.search({
        from: from || undefined,
        to: to || undefined,
      }),
  });

  return (
    <section>
      <header className="page-header">
        <h2>Invoices</h2>
      </header>

      <div className="filters">
        <div className="field">
          <label htmlFor="invoicesFrom">From</label>
          <input
            id="invoicesFrom"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="invoicesTo">To</label>
          <input
            id="invoicesTo"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </div>

      <QueryState
        isLoading={invoices.isPending}
        error={invoices.error}
        isEmpty={invoices.data?.items.length === 0}
        emptyMessage="No sales found for those dates."
      >
        <table className="data-table">
          <caption className="visually-hidden">Past sales</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Invoice</th>
              <th scope="col">Customer</th>
              <th scope="col">Value</th>
              <th scope="col">
                <span className="visually-hidden">Give to customer</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invoices.data?.items.map((invoice: InvoiceListRow) => (
              <tr key={invoice.id}>
                <td>{new Date(invoice.invoiceDateUtc).toLocaleDateString('en-PK')}</td>
                <td>{invoice.invoiceNumber}</td>
                {/* The server sends null for a sale that belongs to nobody; wording it is this
                    screen's job, not the database's. */}
                <td>{invoice.customerName ?? 'Walk-in'}</td>
                {/* What the sale is worth TODAY. An invoice reduced by a later return is worth
                    less than it was billed at, and the bill the customer holds says so. */}
                <td className="numeric">{formatPkr(invoice.netAmount)}</td>
                <td>
                  <button
                    type="button"
                    aria-label={`Give to customer — ${invoice.invoiceNumber}`}
                    onClick={() => setSharing(invoice)}
                  >
                    Give to customer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>

      {sharing && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-invoice-title">
          <div className="modal__panel">
            <h3 id="share-invoice-title">Give {sharing.invoiceNumber} to the customer</h3>

            {/* Naming the sale in the heading is what stops the wrong bill being sent from a
                long list — the rows all look alike. */}
            <p className="modal__hint">
              {sharing.customerName ?? 'Walk-in'} · {formatPkr(sharing.netAmount)}
            </p>

            <ShareButtons
              documentType="Invoice"
              referenceId={sharing.id}
              // The list does not carry mobile numbers; the server resolves a customer's own
              // number from the invoice. A walk-in has none either way, which is what makes
              // the dialog ask for one.
              customerMobile={null}
              hasCustomer={sharing.customerId !== null}
              onFetchDocument={(_documentType, referenceId) => documentApi.invoicePdf(referenceId)}
              onCreateShareLink={documentApi.createShareLink}
            />

            {/* The sale's own proof — only for a transfer; cash was counted into the drawer. */}
            {needsProof(sharing.paymentMethod) && (
              <div className="modal__proof">
                <span>Payment proof ({sharing.paymentMethod})</span>
                <ProofAttachment
                  kind="sale"
                  id={sharing.id}
                  hasProof={sharing.hasProof ?? false}
                  onAttached={() => void queryClient.invalidateQueries({ queryKey: ['invoices'] })}
                />
              </div>
            )}

            {isAdmin && (
              <ShareLinksPanel
                documentType="Invoice"
                referenceId={sharing.id}
                onList={documentApi.listShareLinks}
                onRevoke={documentApi.revokeShareLink}
              />
            )}

            <div className="form-actions">
              <button type="button" onClick={() => setSharing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
