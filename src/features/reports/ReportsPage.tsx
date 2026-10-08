import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  reportApi,
  type ExpenseReport,
  type PayableRow,
  type ProductProfitRow,
  type ProfitRow,
  type ReceivableRow,
  type ReportGrouping,
  type SaleListRow,
  type SaleTypeTotals,
  type StockMovementRow,
  type StockRow,
  type UserSalesRow,
} from './reportApi';
import { QueryState } from '@/components/QueryState';
import { LowStockBadge } from '@/components/LowStockBadge';
import { formatPkr } from '@/lib/money';
import { shopMonthStart, shopToday } from '@/lib/shopDay';

type ReportName =
  | 'sales-by-type'
  | 'sales-by-user'
  | 'profit'
  | 'profit-by-product'
  | 'stock'
  | 'receivables'
  | 'payables'
  | 'expenses'
  | 'stock-movements';

const REPORTS: ReadonlyArray<{ value: ReportName; label: string }> = [
  { value: 'sales-by-type', label: 'Retail vs wholesale' },
  { value: 'sales-by-user', label: 'Salesmen' },
  { value: 'profit', label: 'Sales & profit' },
  { value: 'profit-by-product', label: 'Profit by product' },
  { value: 'stock', label: 'Stock' },
  { value: 'receivables', label: 'Money owed to the shop' },
  { value: 'payables', label: 'Money the shop owes' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'stock-movements', label: 'Stock movements' },
];

/** Reports that read a date range; the rest are a snapshot of right now. */
const RANGED: ReadonlySet<ReportName> = new Set([
  'sales-by-type',
  'sales-by-user',
  'profit',
  'profit-by-product',
  'expenses',
  'stock-movements',
]);

export function ReportsPage() {
  const [report, setReport] = useState<ReportName>('profit');
  // Both from the shop's own day: one from the device's date and one from UTC ran backwards on
  // the 1st of every month before 5 a.m.
  const [from, setFrom] = useState(shopMonthStart());
  const [to, setTo] = useState(shopToday());
  const [groupBy, setGroupBy] = useState<ReportGrouping>('Day');

  // Which half of the split the owner has opened, if any. Null means the totals are on screen.
  const [openedType, setOpenedType] = useState<'Retail' | 'Wholesale' | null>(null);

  const usesRange = RANGED.has(report);
  const rangeInvalid = to < from;

  // One typed query per report, each fetching only while its report is on screen. A single
  // query returning a union would need casts at every use, which is where display bugs hide.
  const ready = (name: ReportName) => report === name && (!RANGED.has(name) || !rangeInvalid);

  const salesByUser = useQuery({
    queryKey: ['report', 'sales-by-user', from, to],
    queryFn: () => reportApi.salesByUser(from, to),
    enabled: ready('sales-by-user'),
  });

  const salesByType = useQuery({
    queryKey: ['report', 'sales-by-type', from, to],
    queryFn: () => reportApi.salesByType(from, to),
    enabled: ready('sales-by-type'),
  });

  // The drill-down behind whichever total was clicked. Only fetched once one is opened.
  const salesList = useQuery({
    queryKey: ['report', 'sales-list', from, to, openedType],
    queryFn: () => reportApi.salesList(from, to, openedType ?? undefined),
    enabled: ready('sales-by-type') && openedType !== null,
  });

  const profit = useQuery({
    queryKey: ['report', 'profit', from, to, groupBy],
    queryFn: () => reportApi.profit(from, to, groupBy),
    enabled: ready('profit'),
  });

  const byProduct = useQuery({
    queryKey: ['report', 'profit-by-product', from, to],
    queryFn: () => reportApi.profitByProduct(from, to),
    enabled: ready('profit-by-product'),
  });

  const stock = useQuery({
    queryKey: ['report', 'stock'],
    queryFn: () => reportApi.stock(),
    enabled: ready('stock'),
  });

  const receivables = useQuery({
    queryKey: ['report', 'receivables'],
    queryFn: () => reportApi.receivables(),
    enabled: ready('receivables'),
  });

  const payables = useQuery({
    queryKey: ['report', 'payables'],
    queryFn: () => reportApi.payables(),
    enabled: ready('payables'),
  });

  const expenses = useQuery({
    queryKey: ['report', 'expenses', from, to],
    queryFn: () => reportApi.expenses(from, to),
    enabled: ready('expenses'),
  });

  const movements = useQuery({
    queryKey: ['report', 'stock-movements', from, to],
    queryFn: () => reportApi.stockMovements(from, to),
    enabled: ready('stock-movements'),
  });

  const active = {
    'sales-by-type': openedType === null ? salesByType : salesList,
    'sales-by-user': salesByUser,
    profit,
    'profit-by-product': byProduct,
    stock,
    receivables,
    payables,
    expenses,
    'stock-movements': movements,
  }[report];

  return (
    <section>
      <header className="page-header">
        <h2>Reports</h2>
      </header>

      <div className="filters">
        <div className="field">
          <label htmlFor="reportName">Report</label>
          <select
            id="reportName"
            value={report}
            onChange={(event) => {
              setReport(event.target.value as ReportName);
              // An open drill-down belongs to the report that opened it.
              setOpenedType(null);
            }}
          >
            {REPORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {usesRange && (
          <>
            <div className="field">
              <label htmlFor="reportFrom">From</label>
              <input
                id="reportFrom"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="reportTo">To</label>
              <input
                id="reportTo"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </>
        )}

        {report === 'profit' && (
          <div className="field">
            <label htmlFor="reportGroupBy">Group by</label>
            <select
              id="reportGroupBy"
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as ReportGrouping)}
            >
              <option value="Day">Day</option>
              <option value="Week">Week</option>
              <option value="Month">Month</option>
              <option value="Year">Year</option>
            </select>
          </div>
        )}
      </div>

      {usesRange && rangeInvalid && (
        <p className="form-error" role="alert">
          The end of the range cannot be before its start.
        </p>
      )}

      {!(usesRange && rangeInvalid) && (
        <QueryState isLoading={active.isPending} error={active.error}>
          {report === 'sales-by-type' &&
            (openedType === null ? (
              <SaleTypeTable rows={salesByType.data ?? []} onOpen={setOpenedType} />
            ) : (
              <SaleListTable
                saleType={openedType}
                rows={salesList.data?.items ?? []}
                onBack={() => setOpenedType(null)}
              />
            ))}
          {report === 'sales-by-user' && <UserSalesTable rows={salesByUser.data ?? []} />}
          {report === 'profit' && <ProfitTable rows={profit.data ?? []} />}
          {report === 'profit-by-product' && <ProductProfitTable rows={byProduct.data ?? []} />}
          {report === 'stock' && <StockTable rows={stock.data ?? []} />}
          {report === 'receivables' && <ReceivablesTable rows={receivables.data ?? []} />}
          {report === 'payables' && <PayablesTable rows={payables.data ?? []} />}
          {report === 'expenses' && <ExpenseSummary data={expenses.data} />}
          {report === 'stock-movements' && <MovementsTable rows={movements.data?.items ?? []} />}
        </QueryState>
      )}
    </section>
  );
}

function Empty({ what }: { what: string }) {
  return <p className="empty-state">No {what} for this period.</p>;
}

/**
 * The day's takings split into retail and wholesale.
 *
 * Each total is a button: clicking it opens the sales behind it, which is the question the owner
 * actually asks on seeing an unexpected figure.
 */
function SaleTypeTable({
  rows,
  onOpen,
}: {
  rows: SaleTypeTotals[];
  onOpen: (saleType: 'Retail' | 'Wholesale') => void;
}) {
  const grandTotal = rows.reduce((sum, row) => sum + row.totalSales, 0);

  return (
    <table className="data-table">
      <caption className="visually-hidden">Sales split by retail and wholesale</caption>
      <thead>
        <tr>
          <th scope="col">Sale type</th>
          <th scope="col">Sales</th>
          <th scope="col">Items</th>
          <th scope="col">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.saleType}>
            <td>
              <button
                type="button"
                className="link-button"
                onClick={() => onOpen(row.saleType)}
              >
                {row.saleType}
              </button>
            </td>
            <td className="numeric">{row.invoiceCount}</td>
            <td className="numeric">{row.itemsSold}</td>
            <td className="numeric">{formatPkr(row.totalSales)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total</th>
          <td />
          <td />
          <td className="numeric">{formatPkr(grandTotal)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** The sales behind one of those totals: who sold, who bought, and how much. */
function SaleListTable({
  saleType,
  rows,
  onBack,
}: {
  saleType: 'Retail' | 'Wholesale';
  rows: SaleListRow[];
  onBack: () => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <div>
      <div className="page-header">
        <h3>{saleType} sales</h3>
        <button type="button" onClick={onBack}>
          Back to the split
        </button>
      </div>

      {rows.length === 0 ? (
        <Empty what={`${saleType.toLowerCase()} sales`} />
      ) : (
        <table className="data-table">
          <caption className="visually-hidden">{saleType} sales</caption>
          <thead>
            <tr>
              <th scope="col">Invoice</th>
              <th scope="col">Time</th>
              <th scope="col">Customer</th>
              <th scope="col">Sold by</th>
              <th scope="col">Items</th>
              <th scope="col">Payment</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.invoiceId}>
                <td>{row.invoiceNumber}</td>
                <td>
                  {new Date(row.invoiceDateUtc).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                {/* A cash walk-in has no customer record, but the sale still happened. */}
                <td>{row.customerName ?? 'Walk-in'}</td>
                <td>{row.userName}</td>
                <td className="numeric">{row.itemCount}</td>
                <td>
                  {row.paymentMethod}
                  {row.amountRemaining > 0 && (
                    <span className="badge badge--muted">
                      {formatPkr(row.amountRemaining)} owing
                    </span>
                  )}
                </td>
                <td className="numeric">{formatPkr(row.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td />
              <td />
              <td />
              <td />
              <td />
              <td className="numeric">{formatPkr(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

/**
 * Each salesman's period.
 *
 * <p>Cash taken and credit given are kept apart because they are different risks: one is money
 * in the drawer tonight, the other is money that walked out of the shop. Discount is shown
 * beside them, because a salesman who discounts heavily and takes little cash is a different
 * conversation from one who simply sold less.</p>
 *
 * <p>No cost, no profit — this is accountability, not margin.</p>
 */
function UserSalesTable({ rows }: { rows: UserSalesRow[] }) {
  if (rows.length === 0) {
    return <p>Nobody sold anything in this period.</p>;
  }

  return (
    <table className="data-table" data-testid="sales-by-user">
      <caption className="visually-hidden">Sales by salesman</caption>
      <thead>
        <tr>
          <th scope="col">Salesman</th>
          <th scope="col">Sales</th>
          <th scope="col">Cash taken</th>
          <th scope="col">Credit given</th>
          <th scope="col">Discount given</th>
          <th scope="col">Bills</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.userId} data-testid={`user-sales-${row.userId}`}>
            <td>{row.userName}</td>
            <td className="numeric">{formatPkr(row.totalSales)}</td>
            <td className="numeric">{formatPkr(row.cashTaken)}</td>
            <td className="numeric">{formatPkr(row.creditGiven)}</td>
            <td className="numeric">{formatPkr(row.discountGiven)}</td>
            <td className="numeric">{row.invoiceCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProfitTable({ rows }: { rows: ProfitRow[] }) {
  if (rows.length === 0) {
    return <Empty what="sales" />;
  }

  return (
    <table className="data-table">
      <caption className="visually-hidden">Sales and profit</caption>
      <thead>
        <tr>
          <th scope="col">Period</th>
          <th scope="col" className="numeric">Sales</th>
          <th scope="col" className="numeric">Gross profit</th>
          <th scope="col" className="numeric">Expenses</th>
          <th scope="col" className="numeric">Net profit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.period}>
            <td>{row.period}</td>
            <td className="numeric">{formatPkr(row.totalSales)}</td>
            <td className="numeric">{formatPkr(row.grossProfit)}</td>
            <td className="numeric">{formatPkr(row.expenses)}</td>
            <td className={`numeric${row.netProfit < 0 ? ' owing' : ''}`}>
              {formatPkr(row.netProfit)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProductProfitTable({ rows }: { rows: ProductProfitRow[] }) {
  if (rows.length === 0) {
    return <Empty what="sales" />;
  }

  return (
    <table className="data-table">
      <caption className="visually-hidden">Profit by product</caption>
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col" className="numeric">Sold</th>
          <th scope="col" className="numeric">Sale value</th>
          <th scope="col" className="numeric">Cost</th>
          <th scope="col" className="numeric">Profit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.productId}>
            <td>{row.productName}</td>
            <td className="numeric">{row.quantitySold}</td>
            <td className="numeric">{formatPkr(row.totalSale)}</td>
            <td className="numeric">{formatPkr(row.totalCost)}</td>
            <td className={`numeric${row.totalProfit < 0 ? ' owing' : ''}`}>
              {formatPkr(row.totalProfit)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StockTable({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">No products yet.</p>;
  }

  const total = rows.reduce((sum, row) => sum + row.stockValue, 0);

  return (
    <>
      <p className="report-total">
        Stock on hand is worth <strong>{formatPkr(total)}</strong> at current cost.
      </p>

      <table className="data-table">
        <caption className="visually-hidden">Current stock</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Category</th>
            <th scope="col" className="numeric">On hand</th>
            <th scope="col" className="numeric">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.productId}>
              <td>{row.productName}</td>
              <td>{row.category}</td>
              <td className="numeric">
                {row.quantityOnHand}{' '}
                <LowStockBadge quantityOnHand={row.quantityOnHand} isLowStock={row.isLowStock} />
              </td>
              <td className="numeric">{formatPkr(row.stockValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ReceivablesTable({ rows }: { rows: ReceivableRow[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">Nobody owes the shop anything.</p>;
  }

  const total = rows.reduce((sum, row) => sum + row.outstandingBalance, 0);

  return (
    <>
      <p className="report-total">
        Customers owe <strong>{formatPkr(total)}</strong> in total.
      </p>

      <table className="data-table">
        <caption className="visually-hidden">Money owed to the shop</caption>
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Mobile</th>
            <th scope="col" className="numeric">Owes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.customerId}>
              <td>{row.customerName}</td>
              <td>{row.mobileNumber ?? '—'}</td>
              <td className="numeric owing">{formatPkr(row.outstandingBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function PayablesTable({ rows }: { rows: PayableRow[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">The shop owes nothing.</p>;
  }

  const total = rows.reduce((sum, row) => sum + row.payableBalance, 0);

  return (
    <>
      <p className="report-total">
        The shop owes <strong>{formatPkr(total)}</strong> in total.
      </p>

      <table className="data-table">
        <caption className="visually-hidden">Money the shop owes</caption>
        <thead>
          <tr>
            <th scope="col">Supplier</th>
            <th scope="col">Contact</th>
            <th scope="col" className="numeric">Owed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.supplierId}>
              <td>{row.supplierName}</td>
              <td>{row.contactNumber ?? '—'}</td>
              <td className="numeric owing">{formatPkr(row.payableBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ExpenseSummary({ data }: { data: ExpenseReport | undefined }) {
  if (!data || data.byCategory.length === 0) {
    return <Empty what="expenses" />;
  }

  return (
    <>
      <p className="report-total">
        Expenses total <strong>{formatPkr(data.total)}</strong> for this period.
      </p>

      <table className="data-table">
        <caption className="visually-hidden">Expenses by category</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col" className="numeric">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.byCategory.map((row) => (
            <tr key={row.category}>
              <td>{row.category}</td>
              <td className="numeric">{formatPkr(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function MovementsTable({ rows }: { rows: StockMovementRow[] }) {
  if (rows.length === 0) {
    return <Empty what="stock movements" />;
  }

  return (
    <table className="data-table">
      <caption className="visually-hidden">Stock movements</caption>
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">Product</th>
          <th scope="col" className="numeric">Change</th>
          <th scope="col" className="numeric">Left</th>
          <th scope="col">Why</th>
          <th scope="col">Who</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              {new Date(row.createdAtUtc).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
            </td>
            <td>{row.productName}</td>
            <td className="numeric">{row.changeQty > 0 ? `+${row.changeQty}` : row.changeQty}</td>
            <td className="numeric">{row.resultingQty}</td>
            <td>{row.reason}</td>
            <td>{row.userName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
