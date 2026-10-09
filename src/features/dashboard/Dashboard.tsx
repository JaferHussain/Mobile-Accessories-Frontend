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
  /** Value returned by customers this period. Already netted into totalSales via net_amount. */
  totalSaleReturns: number;
  /** Value sent back to suppliers this period. Already netted into totalPurchases. */
  totalPurchaseReturns: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  cashSales: number;
  creditSales: number;

  /**
   * How creditSales was made up. Visibility only — every rupee here is already inside
   * creditSales and totalReceivables, so these are never added to either.
   */
  udhaarSalesCount: number;
  udhaarSalesAmount: number;
  partPaidSalesCount: number;
  partPaidRemaining: number;
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
  /**
   * False when a page above already shows the heading and the period buttons (the lens
   * dashboard). On by default, so the screen stands on its own.
   */
  showHeader?: boolean;
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
  note,
}: {
  label: string;
  value: string;
  testId: string;
  tone?: 'good' | 'bad';
  /** A second line under the figure — a count, or where the money already sits. */
  note?: string;
}) {
  return (
    <div className={`kpi${tone ? ` kpi--${tone}` : ''}`}>
      <span className="kpi__label">{label}</span>
      <strong className="kpi__value" data-testid={testId}>
        {value}
      </strong>
      {note && (
        <span className="kpi__note" data-testid={`${testId}-note`}>
          {note}
        </span>
      )}
    </div>
  );
}

/** "1 sale", "4 sales" — a count the owner reads, not a bare number. */
function saleCount(count: number): string {
  return `${count} ${count === 1 ? 'sale' : 'sales'}`;
}

/**
 * What the owner sees on opening the system (FR-035).
 *
 * Net profit is the figure that matters, so it is coloured by whether the period made or lost
 * money — a loss should be obvious at a glance, not buried in a row of identical tiles.
 */
export function Dashboard({
  data,
  period,
  isLoading = false,
  onPeriodChange,
  showHeader = true,
}: DashboardProps) {
  return (
    <section className="dashboard">
      {showHeader && (
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
      )}

      {isLoading && <p role="status">Loading…</p>}

      {!isLoading && !data && <p>No figures available.</p>}

      {!isLoading && data && (
        <>
          <div className="dashboard__kpis">
            <KpiCard label="Sales" value={formatPkr(data.totalSales)} testId="kpi-sales" />
            <KpiCard label="Purchases" value={formatPkr(data.totalPurchases)} testId="kpi-purchases" />
            {/* Already folded into Sales/Purchases above via net_amount — shown again so the
                owner sees how much came back, not just the smaller number it produced. */}
            <KpiCard
              label="Sale returns"
              value={formatPkr(data.totalSaleReturns)}
              testId="kpi-sale-returns"
              tone={data.totalSaleReturns > 0 ? 'bad' : undefined}
            />
            <KpiCard
              label="Purchase returns"
              value={formatPkr(data.totalPurchaseReturns)}
              testId="kpi-purchase-returns"
            />
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
            {/* The two halves of Credit sales above. Visibility, not new money: both are
                already inside Credit sales and Owed to shop, so neither is added to them. */}
            <KpiCard
              label="Udhaar sales"
              value={formatPkr(data.udhaarSalesAmount)}
              testId="kpi-udhaar-sales"
              note={saleCount(data.udhaarSalesCount)}
              tone={data.udhaarSalesAmount > 0 ? 'bad' : undefined}
            />
            <KpiCard
              label="Part paid — still owed"
              value={formatPkr(data.partPaidRemaining)}
              testId="kpi-part-paid-remaining"
              note={saleCount(data.partPaidSalesCount)}
              tone={data.partPaidRemaining > 0 ? 'bad' : undefined}
            />
            <KpiCard
              label="Owed to shop"
              value={formatPkr(data.totalReceivables)}
              testId="kpi-receivables"
              note="includes today's udhaar"
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
