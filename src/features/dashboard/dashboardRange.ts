import { shopMonthStart, shopToday, shopYearStart } from '@/lib/shopDay';
import type { DashboardPeriod } from './Dashboard';

/**
 * The shop days a dashboard period covers, as `yyyy-mm-dd`, both inclusive. The people, the
 * watch list and the money panels ask by day; the shop totals ask by named period — this keeps the
 * two reading the same days.
 */
export function periodRange(period: DashboardPeriod): { from: string; to: string } {
  const to = shopToday();

  if (period === 'ThisMonth') {
    return { from: shopMonthStart(), to };
  }

  if (period === 'ThisYear') {
    return { from: shopYearStart(), to };
  }

  return { from: to, to };
}
