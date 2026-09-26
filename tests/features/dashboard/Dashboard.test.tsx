import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard, type DashboardData } from '@/features/dashboard/Dashboard';

/** T137 — KPI rendering and the period toggle (FR-035). */

const data: DashboardData = {
  period: 'Today',
  totalSales: 125_000,
  totalPurchases: 60_000,
  totalSaleReturns: 3_500,
  totalPurchaseReturns: 1_200,
  grossProfit: 50_000,
  totalExpenses: 12_000,
  netProfit: 38_000,
  cashSales: 90_000,
  creditSales: 35_000,
  // The two halves of creditSales: 20,000 taken wholly on udhaar and 15,000 still owed on
  // sales that were part paid. 20,000 + 15,000 = 35,000, which is the whole point.
  udhaarSalesCount: 4,
  udhaarSalesAmount: 20_000,
  partPaidSalesCount: 3,
  partPaidRemaining: 15_000,
  salesByType: [
    { saleType: 'Retail', totalSales: 80_000, invoiceCount: 21, itemsSold: 40 },
    { saleType: 'Wholesale', totalSales: 45_000, invoiceCount: 4, itemsSold: 23 },
  ],
  totalReceivables: 47_500,
  totalPayables: 22_000,
  itemsSoldCount: 63,
  lowStockProducts: [
    { productId: 1, productName: 'Type-C Braided 2m', quantityOnHand: 2, minStockThreshold: 5 },
    { productId: 2, productName: 'Earbuds Pro', quantityOnHand: 0, minStockThreshold: 3 },
  ],
};

describe('Dashboard KPIs', () => {
  it('splits the day into retail and wholesale', () => {
    render(<Dashboard data={data} period="Today" onPeriodChange={vi.fn()} />);

    expect(screen.getByTestId('kpi-retail-sales')).toHaveTextContent('Rs 80,000.00');
    expect(screen.getByTestId('kpi-wholesale-sales')).toHaveTextContent('Rs 45,000.00');
  });

  it('shows zero rather than nothing when a half is missing', () => {
    // A day with no wholesale trade must read "Rs 0.00", not leave the owner wondering
    // whether it simply was not recorded.
    render(
      <Dashboard
        data={{ ...data, salesByType: undefined }}
        period="Today"
        onPeriodChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('kpi-wholesale-sales')).toHaveTextContent('Rs 0.00');
  });

  it('shows every headline figure', () => {
    render(<Dashboard data={data} period="Today" onPeriodChange={vi.fn()} />);

    expect(screen.getByTestId('kpi-sales')).toHaveTextContent('Rs 125,000.00');
    expect(screen.getByTestId('kpi-purchases')).toHaveTextContent('Rs 60,000.00');
    // Already netted into Sales/Purchases via net_amount — shown again on its own so the owner
    // sees how much came back, not just the smaller totals it already produced.
    expect(screen.getByTestId('kpi-sale-returns')).toHaveTextContent('Rs 3,500.00');
    expect(screen.getByTestId('kpi-purchase-returns')).toHaveTextContent('Rs 1,200.00');
    expect(screen.getByTestId('kpi-gross-profit')).toHaveTextContent('Rs 50,000.00');
    expect(screen.getByTestId('kpi-expenses')).toHaveTextContent('Rs 12,000.00');
    expect(screen.getByTestId('kpi-cash-sales')).toHaveTextContent('Rs 90,000.00');
    expect(screen.getByTestId('kpi-credit-sales')).toHaveTextContent('Rs 35,000.00');
    expect(screen.getByTestId('kpi-receivables')).toHaveTextContent('Rs 47,500.00');
    expect(screen.getByTestId('kpi-payables')).toHaveTextContent('Rs 22,000.00');
    expect(screen.getByTestId('kpi-items-sold')).toHaveTextContent('63');
  });

  it('shows net profit as gross less expenses', () => {
    render(<Dashboard data={data} period="Today" onPeriodChange={vi.fn()} />);

    // spec US4 scenario 2: 50,000 - 12,000 = 38,000.
    expect(screen.getByTestId('kpi-net-profit')).toHaveTextContent('Rs 38,000.00');
  });

  it('marks a loss differently from a profit', () => {
    const { rerender } = render(
      <Dashboard data={data} period="Today" onPeriodChange={vi.fn()} />,
    );

    expect(screen.getByTestId('kpi-net-profit').closest('.kpi')).toHaveClass('kpi--good');

    rerender(
      <Dashboard
        data={{ ...data, grossProfit: 5_000, totalExpenses: 12_000, netProfit: -7_000 }}
        period="Today"
        onPeriodChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('kpi-net-profit')).toHaveTextContent('-Rs 7,000.00');
    expect(screen.getByTestId('kpi-net-profit').closest('.kpi')).toHaveClass('kpi--bad');
  });
});

describe('Dashboard period toggle', () => {
  it('offers today, this month and this year', () => {
    render(<Dashboard data={data} period="Today" onPeriodChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This year' })).toBeInTheDocument();
  });

  it('marks the active period', () => {
    render(<Dashboard data={data} period="ThisMonth" onPeriodChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('asks for new figures when the period changes', async () => {
    const onPeriodChange = vi.fn();
    const user = userEvent.setup();

    render(<Dashboard data={data} period="Today" onPeriodChange={onPeriodChange} />);

    await user.click(screen.getByRole('button', { name: 'This year' }));

    expect(onPeriodChange).toHaveBeenCalledWith('ThisYear');
  });
});

describe('Dashboard low stock', () => {
  it('lists what needs reordering', () => {
    render(<Dashboard data={data} period="Today" onPeriodChange={vi.fn()} />);

    expect(screen.getByText(/Type-C Braided 2m/)).toBeInTheDocument();
    expect(screen.getByText(/Earbuds Pro/)).toBeInTheDocument();
  });

  it('calls out anything actually out of stock', () => {
    render(<Dashboard data={data} period="Today" onPeriodChange={vi.fn()} />);

    const earbuds = screen.getByText(/Earbuds Pro/).closest('li')!;

    expect(earbuds).toHaveTextContent('out of stock');
  });

  it('says so when nothing needs reordering', () => {
    render(
      <Dashboard
        data={{ ...data, lowStockProducts: [] }}
        period="Today"
        onPeriodChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Nothing needs reordering.')).toBeInTheDocument();
  });
});

describe('Dashboard states', () => {
  it('shows a loading indicator', () => {
    render(<Dashboard data={null} period="Today" isLoading onPeriodChange={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('copes with no figures', () => {
    render(<Dashboard data={null} period="Today" onPeriodChange={vi.fn()} />);

    expect(screen.getByText('No figures available.')).toBeInTheDocument();
  });
});

/**
 * The day's udhaar, split into what was taken wholly on credit and what is still owed on a part
 * payment. Both are VISIBILITY into figures the dashboard already showed — the owner could see
 * "Credit sales 35,000" but not how it was made up, nor how many customers it involved.
 */
describe('Dashboard credit breakdown', () => {
  it('shows what was taken wholly on udhaar, and how many sales', () => {
    render(<Dashboard data={data} period="Today" onPeriodChange={vi.fn()} />);

    expect(screen.getByTestId('kpi-udhaar-sales')).toHaveTextContent('Rs 20,000.00');
    expect(screen.getByTestId('kpi-udhaar-sales-note')).toHaveTextContent('4 sales');
  });

  it('shows only the unpaid remainder of part-paid sales', () => {
    render(<Dashboard data={data} period="Today" onPeriodChange={vi.fn()} />);

    // What came in on those sales is already counted in Cash sales.
    expect(screen.getByTestId('kpi-part-paid-remaining')).toHaveTextContent('Rs 15,000.00');
    expect(screen.getByTestId('kpi-part-paid-remaining-note')).toHaveTextContent('3 sales');
  });

  it('says "1 sale" rather than "1 sales"', () => {
    render(
      <Dashboard
        data={{ ...data, udhaarSalesCount: 1 }}
        period="Today"
        onPeriodChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('kpi-udhaar-sales-note')).toHaveTextContent('1 sale');
  });

  it('accounts for the whole of credit sales between them', () => {
    render(<Dashboard data={data} period="Today" onPeriodChange={vi.fn()} />);

    // 20,000 + 15,000 = 35,000. Neither card is money counted a second time.
    expect(data.udhaarSalesAmount + data.partPaidRemaining).toBe(data.creditSales);
    expect(screen.getByTestId('kpi-credit-sales')).toHaveTextContent('Rs 35,000.00');
  });

  it('says that what is owed already includes the udhaar just taken', () => {
    render(<Dashboard data={data} period="Today" onPeriodChange={vi.fn()} />);

    // The trap these cards invite: adding them to Owed to shop, and counting a debt twice.
    expect(screen.getByTestId('kpi-receivables-note')).toHaveTextContent(/includes/i);
  });

  it('stays quiet when nothing was sold on credit', () => {
    render(
      <Dashboard
        data={{
          ...data,
          creditSales: 0,
          udhaarSalesCount: 0,
          udhaarSalesAmount: 0,
          partPaidSalesCount: 0,
          partPaidRemaining: 0,
        }}
        period="Today"
        onPeriodChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('kpi-udhaar-sales')).toHaveTextContent('Rs 0.00');
    expect(screen.getByTestId('kpi-udhaar-sales-note')).toHaveTextContent('0 sales');
  });
});
