import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { shopToday } from '@/lib/shopDay';
import { dayCloseApi } from '@/features/dayclose/dayCloseApi';
import { reportApi } from '@/features/reports/reportApi';
import { supplierApi } from '@/features/suppliers/supplierApi';

function Line({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="lens-line">
      <span>{label}</span>
      <span className={negative && value > 0 ? 'lens-line__out' : undefined}>
        {negative && value > 0 ? `− ${formatPkr(value)}` : formatPkr(value)}
      </span>
    </div>
  );
}

/**
 * The owner's money, in one place: the drawer, what he owes, what is owed to him, what was spent.
 * Owner only — the route behind each query is Admin-only on the server, and the Money chip is not
 * offered to anyone else.
 *
 * <p>The drawer is the day-close preview, so this screen and day close can never disagree.
 * Opening cash is added when the drawer is counted, so it is left out here.</p>
 */
export function MoneyView({ from, to }: { from: string; to: string }) {
  const today = shopToday();

  const drawer = useQuery({
    queryKey: ['money', 'drawer', today],
    queryFn: () => dayCloseApi.preview(today, 0),
  });

  const expenses = useQuery({
    queryKey: ['report', 'expenses', from, to],
    queryFn: () => reportApi.expenses(from, to),
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', ''],
    queryFn: () => supplierApi.search(),
  });

  const receivables = useQuery({
    queryKey: ['report', 'receivables'],
    queryFn: () => reportApi.receivables(),
  });

  const owedBySupplier = (suppliers.data?.items ?? [])
    .filter((supplier) => supplier.payableBalance > 0)
    .sort((a, b) => b.payableBalance - a.payableBalance);
  const owedByCustomer = [...(receivables.data ?? [])].sort((a, b) => b.outstandingBalance - a.outstandingBalance);

  return (
    <>
      <div className="lens-cols">
        <section className="lens-panel">
          <header className="lens-panel__head">
            <h3>Cash drawer today</h3>
            <Link to="/day-close">Day close →</Link>
          </header>

          <QueryState isLoading={drawer.isPending} error={drawer.error}>
            {drawer.data && (
              <div data-testid="money-drawer">
                <Line label="Cash sales" value={drawer.data.cashSales} />
                <Line label="Udhaar recovered in cash" value={drawer.data.cashRecovery} />
                <Line label="Cash received from salesmen" value={drawer.data.cashFromSalesmen} />
                <Line label="Cash refunds" value={drawer.data.cashRefunds} negative />
                <Line label="Expenses paid from till" value={drawer.data.cashPaidOut} negative />
                <Line label="Paid to suppliers in cash" value={drawer.data.cashToSuppliers} negative />
                <div className="lens-line lens-line--total">
                  <span>Cash that went through</span>
                  <span data-testid="money-expected">{formatPkr(drawer.data.expectedCash)}</span>
                </div>
              </div>
            )}
          </QueryState>

          <small className="field__hint">
            Add the opening cash when you count. Bank transfers never enter the drawer.
          </small>
        </section>

        <section className="lens-panel">
          <header className="lens-panel__head">
            <h3>Expenses</h3>
            <Link to="/expenses">All expenses →</Link>
          </header>

          <QueryState
            isLoading={expenses.isPending}
            error={expenses.error}
            isEmpty={expenses.data?.byCategory.length === 0}
            emptyMessage="No expenses for these days."
          >
            <div data-testid="money-expenses">
              {expenses.data?.byCategory.map((row) => (
                <div key={row.category}>
                  <Line label={row.category} value={row.total} />
                  <div className="lens-meter" aria-hidden="true">
                    <i style={{ width: `${expenses.data.total > 0 ? (row.total / expenses.data.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
              <div className="lens-line lens-line--total">
                <span>Total</span>
                <span>{formatPkr(expenses.data?.total ?? 0)}</span>
              </div>
            </div>
          </QueryState>
        </section>
      </div>

      <div className="lens-cols">
        <section className="lens-panel">
          <header className="lens-panel__head">
            <h3>You owe suppliers</h3>
            <Link to="/supplier-ledger">Supplier ledger →</Link>
          </header>

          <QueryState
            isLoading={suppliers.isPending}
            error={suppliers.error}
            isEmpty={owedBySupplier.length === 0}
            emptyMessage="The shop owes no supplier anything."
          >
            <div data-testid="money-suppliers">
              {owedBySupplier.map((supplier) => (
                <Line key={supplier.id} label={supplier.name} value={supplier.payableBalance} />
              ))}
              <div className="lens-line lens-line--total">
                <span>Total</span>
                <span>{formatPkr(owedBySupplier.reduce((sum, supplier) => sum + supplier.payableBalance, 0))}</span>
              </div>
            </div>
          </QueryState>
        </section>

        <section className="lens-panel">
          <header className="lens-panel__head">
            <h3>Customers owe you</h3>
            <Link to="/recovery">Recovery →</Link>
          </header>

          <QueryState
            isLoading={receivables.isPending}
            error={receivables.error}
            isEmpty={owedByCustomer.length === 0}
            emptyMessage="Nobody owes the shop anything."
          >
            <div data-testid="money-owed">
              {owedByCustomer.slice(0, 6).map((row) => (
                <Line key={row.customerId} label={row.customerName} value={row.outstandingBalance} />
              ))}
              {owedByCustomer.length > 6 && (
                <small className="field__hint">and {owedByCustomer.length - 6} more — see Recovery.</small>
              )}
              <div className="lens-line lens-line--total">
                <span>Total</span>
                <span>{formatPkr(owedByCustomer.reduce((sum, row) => sum + row.outstandingBalance, 0))}</span>
              </div>
            </div>
          </QueryState>
        </section>
      </div>
    </>
  );
}
