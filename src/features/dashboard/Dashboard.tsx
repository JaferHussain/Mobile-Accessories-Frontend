import { formatPkr } from '@/lib/money';

export type DashboardPeriod = 'Today' | 'ThisMonth' | 'ThisYear';

export interface LowStockProduct {
  productId: number;
  productName: string;
  quantityOnHand: number;
  minStockThreshold: number;
}

export interface DashboardData {
  period: DashboardPeriod;
  totalSales: number;
  totalPurchases: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  cashSales: number;
  creditSales: number;
  /** The period's takings split by how the sale was made. Always both sides, zero included. */
  salesByType?: Array<{
    saleType: 'Retail' | 'Wholesale';
    totalSales: number;
    invoiceCount: number;
    itemsSold: number;
  }>;
  totalReceivables: number;
  totalPayables: number;
  itemsSoldCount: number;
  lowStockProducts: LowStockProduct[];
}

export interface DashboardProps {
  data: DashboardData | null;
  period: DashboardPeriod;
  isLoading?: boolean;
  onPeriodChange: (period: DashboardPeriod) => void;
}

const PERIODS: ReadonlyArray<{ value: DashboardPeriod; label: string }> = [
  { value: 'Today', label: 'Today' },
  { value: 'ThisMonth', label: 'This month' },
  { value: 'ThisYear', label: 'This year' },
];

function KpiCard({
  label,
  value,
  testId,
  tone,
}: {
  label: string;
  value: string;
  testId: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className={`kpi${tone ? ` kpi--${tone}` : ''}`}>
      <span className="kpi__label">{label}</span>
      <strong className="kpi__value" data-testid={testId}>
        {value}
      </strong>
    </div>
  );
}

/**
 * What the owner sees on opening the system (FR-035).
 *
 * Net profit is the figure that matters, so it is coloured by whether the period made or lost
 * money — a loss should be obvious at a glance, not buried in a row of identical tiles.
 */
export function Dashboard({ data, period, isLoading = false, onPeriodChange }: DashboardProps) {
  return (
    <section className="dashboard">
      <header className="dashboard__header">
        <h2>Dashboard</h2>

        <div className="dashboard__periods" role="group" aria-label="Reporting period">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              className={period === option.value ? 'is-active' : undefined}
              onClick={() => onPeriodChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {isLoading && <p role="status">Loading…</p>}

      {!isLoading && !data && <p>No figures available.</p>}

      {!isLoading && data && (
        <>
          <div className="dashboard__kpis">
            <KpiCard label="Sales" value={formatPkr(data.totalSales)} testId="kpi-sales" />
            <KpiCard label="Purchases" value={formatPkr(data.totalPurchases)} testId="kpi-purchases" />
            <KpiCard label="Gross profit" value={formatPkr(data.grossProfit)} testId="kpi-gross-profit" />
            <KpiCard label="Expenses" value={formatPkr(data.totalExpenses)} testId="kpi-expenses" />
            <KpiCard
              label="Net profit"
              value={formatPkr(data.netProfit)}
              testId="kpi-net-profit"
              tone={data.netProfit < 0 ? 'bad' : 'good'}
            />
            {/* The retail/wholesale split the owner reads at day end. */}
            <KpiCard
              label="Retail sales"
              value={formatPkr(
                data.salesByType?.find((row) => row.saleType === 'Retail')?.totalSales ?? 0,
              )}
              testId="kpi-retail-sales"
            />
            <KpiCard
              label="Wholesale sales"
              value={formatPkr(
                data.salesByType?.find((row) => row.saleType === 'Wholesale')?.totalSales ?? 0,
              )}
              testId="kpi-wholesale-sales"
            />
            <KpiCard label="Cash sales" value={formatPkr(data.cashSales)} testId="kpi-cash-sales" />
            <KpiCard label="Credit sales" value={formatPkr(data.creditSales)} testId="kpi-credit-sales" />
            <KpiCard
              label="Owed to shop"
              value={formatPkr(data.totalReceivables)}
              testId="kpi-receivables"
            />
            <KpiCard
              label="Shop owes"
              value={formatPkr(data.totalPayables)}
              testId="kpi-payables"
            />
            <KpiCard
              label="Items sold"
              value={String(data.itemsSoldCount)}
              testId="kpi-items-sold"
            />
          </div>

          <section className="dashboard__low-stock">
            <h3>Needs reordering</h3>

            {data.lowStockProducts.length === 0 ? (
              <p>Nothing needs reordering.</p>
            ) : (
              <ul>
                {data.lowStockProducts.map((product) => (
                  <li key={product.productId}>
                    {product.productName} — {product.quantityOnHand} left
                    {product.quantityOnHand === 0 && <strong> (out of stock)</strong>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
