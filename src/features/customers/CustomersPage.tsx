import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customerApi, type Customer } from './customerApi';
import { CustomerLedger } from './CustomerLedger';
import { documentApi } from '@/features/documents/documentApi';
import { ShareButtons } from '@/features/documents/ShareButtons';
import { ReceivePaymentModal } from './ReceivePaymentModal';
import { OpeningBalanceForm } from './OpeningBalanceForm';
import { UdhaarCustomerToggle } from './UdhaarCustomerToggle';
import { useAuth } from '@/features/auth/AuthContext';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import type { PaymentMethod } from '@/features/pos/posApi';
import type { ReceivePaymentResult } from './customerApi';

function CustomerDetail({ customer, onBack }: { customer: Customer; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [isReceiving, setIsReceiving] = useState(false);

  // The payment just taken, kept so the acknowledgement can be sent while the customer is still
  // standing there. Finding them again in the register afterwards is the step that never happens.
  const [justPaid, setJustPaid] = useState<ReceivePaymentResult | null>(null);
  // Only the owner may record what a customer owed on paper (FR-068).
  const [isSettingOpening, setIsSettingOpening] = useState(false);

  const ledger = useQuery({
    queryKey: ['ledger', customer.id],
    queryFn: () => customerApi.ledger(customer.id, 1, 100),
  });

  const summary = useQuery({
    queryKey: ['customer-summary', customer.id],
    queryFn: () => customerApi.summary(customer.id),
  });

  const current = useQuery({
    queryKey: ['customer', customer.id],
    queryFn: () => customerApi.get(customer.id),
    initialData: customer,
  });

  const receive = useMutation({
    mutationFn: (input: {
      amount: number;
      method: PaymentMethod;
      note: string | null;
      confirmOverpayment: boolean;
    }) =>
      customerApi.receivePayment(
        customer.id,
        input.amount,
        input.method,
        input.note,
        input.confirmOverpayment,
      ),
    onSuccess: async (result) => {
      setJustPaid(result);

      // The balance, the register and the totals all moved together on the server.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ledger', customer.id] }),
        queryClient.invalidateQueries({ queryKey: ['customer-summary', customer.id] }),
        queryClient.invalidateQueries({ queryKey: ['customer', customer.id] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ]);

      setIsReceiving(false);
    },
  });

  const setOpeningBalance = useMutation({
    mutationFn: (input: { amount: number; reason: string | null }) =>
      customerApi.setOpeningBalance(customer.id, input.amount, input.reason),
    onSuccess: async () => {
      // The figure, the balance and the register all moved together on the server.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ledger', customer.id] }),
        queryClient.invalidateQueries({ queryKey: ['customer-summary', customer.id] }),
        queryClient.invalidateQueries({ queryKey: ['customer', customer.id] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ]);

      setIsSettingOpening(false);
    },
  });

  const shown = current.data ?? customer;

  return (
    <section>
      <button type="button" className="link-button" onClick={onBack}>
        ← All customers
      </button>

      <QueryState isLoading={ledger.isPending || summary.isPending} error={ledger.error ?? summary.error}>
        {summary.data && (
          <CustomerLedger
            customer={current.data ?? customer}
            summary={summary.data}
            entries={ledger.data?.items ?? []}
            onReceivePayment={() => setIsReceiving(true)}
            // A customer disputing a bill, or asking for proof of what they paid, is answered
            // from the register itself rather than by finding the sale somewhere else.
            onFetchDocument={(documentType, referenceId) =>
              documentType === 'Invoice'
                ? documentApi.invoicePdf(referenceId)
                : documentApi.paymentReceiptPdf(referenceId)
            }
            onCreateShareLink={documentApi.createShareLink}
            onCreateReminder={customerApi.reminder}
          />
        )}
      </QueryState>

      {isAdmin && <UdhaarCustomerToggle key={shown.id} customer={shown} />}

      {isAdmin && !isSettingOpening && (
        <button type="button" onClick={() => setIsSettingOpening(true)}>
          {shown.openingBalance === null || shown.openingBalance === undefined
            ? 'Record amount brought forward'
            : 'Correct amount brought forward'}
        </button>
      )}

      {isAdmin && isSettingOpening && (
        <OpeningBalanceForm
          customer={shown}
          openingBalance={shown.openingBalance ?? null}
          onSubmit={async (amount, reason) => {
            await setOpeningBalance.mutateAsync({ amount, reason });
          }}
          onCancel={() => setIsSettingOpening(false)}
        />
      )}

      {justPaid && (
        <div className="form-success" role="status">
          <p>
            Received {formatPkr(justPaid.amount)} — {justPaid.receiptNumber}.{' '}
            {justPaid.balanceAfter > 0
              ? `${formatPkr(justPaid.balanceAfter)} still owed.`
              : 'Account settled.'}
          </p>

          <ShareButtons
            documentType="PaymentReceipt"
            referenceId={justPaid.paymentId}
            customerMobile={(current.data ?? customer).mobileNumber}
            hasCustomer
            onFetchDocument={(_documentType, referenceId) =>
              documentApi.paymentReceiptPdf(referenceId)
            }
            onCreateShareLink={documentApi.createShareLink}
          />

          <button type="button" onClick={() => setJustPaid(null)}>
            Done
          </button>
        </div>
      )}

      {isReceiving && (
        <ReceivePaymentModal
          customerName={customer.name}
          outstandingBalance={(current.data ?? customer).outstandingBalance}
          onReceive={async (amount, method, note, confirmOverpayment) => {
            await receive.mutateAsync({ amount, method, note, confirmOverpayment });
          }}
          onCancel={() => setIsReceiving(false)}
        />
      )}
    </section>
  );
}

const SALE_TYPE_FILTERS = ['All', 'Retail', 'Wholesale'] as const;
type SaleTypeFilter = (typeof SALE_TYPE_FILTERS)[number];

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [withBalanceOnly, setWithBalanceOnly] = useState(false);
  // Alternatives, never additive (FR-092): one state, not two independent booleans that could
  // both be true at once.
  const [saleTypeFilter, setSaleTypeFilter] = useState<SaleTypeFilter>('All');
  const [selected, setSelected] = useState<Customer | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ['customers', search, withBalanceOnly, saleTypeFilter],
    queryFn: () =>
      customerApi.search({
        search: search || undefined,
        withBalanceOnly,
        saleType: saleTypeFilter === 'All' ? undefined : saleTypeFilter,
      }),
  });

  if (selected) {
    return <CustomerDetail customer={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <section>
      <header className="page-header">
        <h2>Customers</h2>
      </header>

      <div className="filters">
        <div className="field">
          <label htmlFor="customerSearchBox">Search</label>
          <input
            id="customerSearchBox"
            value={search}
            placeholder="Name or mobile number"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={withBalanceOnly}
            onChange={(event) => setWithBalanceOnly(event.target.checked)}
          />
          Only those who owe
        </label>

        {/* Alternatives, not checkboxes: retail and wholesale are never both selected. */}
        <div className="view-toggle" role="group" aria-label="Sale type">
          {SALE_TYPE_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={saleTypeFilter === option}
              onClick={() => setSaleTypeFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <QueryState
        isLoading={isPending}
        error={error}
        isEmpty={data?.items.length === 0}
        emptyMessage="No customers match that search."
      >
        <table className="data-table">
          <caption className="visually-hidden">Customers</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Mobile</th>
              <th scope="col">Type</th>
              <th scope="col">Owes</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>{customer.mobileNumber ?? '—'}</td>
                <td>
                  {customer.saleType}
                  {customer.creditAllowed && <span className="badge"> · udhaar customer</span>}
                </td>
                <td className={`numeric${customer.outstandingBalance > 0 ? ' owing' : ''}`}>
                  {formatPkr(customer.outstandingBalance)}
                </td>
                <td>
                  <button type="button" onClick={() => setSelected(customer)}>
                    Open ledger
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
    </section>
  );
}
