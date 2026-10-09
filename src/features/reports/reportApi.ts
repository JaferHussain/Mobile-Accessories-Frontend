import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult } from '@/types/api';

export interface PeriodTotals {
  period: string;
  totalSales: number;
  grossProfit: number;
  invoiceCount: number;
  itemsSold: number;
}

export interface ProfitRow {
  period: string;
  totalSales: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
}

export interface ProductProfitRow {
  productId: number;
  productName: string;
  quantitySold: number;
  totalSale: number;
  totalCost: number;
  totalProfit: number;
}

/** One side of the day's retail/wholesale split. */
export interface SaleTypeTotals {
  saleType: 'Retail' | 'Wholesale';
  totalSales: number;
  invoiceCount: number;
  itemsSold: number;
}

/** What came back in the period for one kind of sale. */
export interface SaleTypeReturns {
  saleType: 'Retail' | 'Wholesale';
  returnCount: number;
  itemsReturned: number;
  amountReturned: number;
}

/** One sale in the drill-down behind a retail or wholesale total. */
export interface SaleListRow {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDateUtc: string;
  saleType: 'Retail' | 'Wholesale';
  customerId?: number | null;
  /** Null for a walk-in, shown as "Walk-in". */
  customerName?: string | null;
  /** The salesman who rang the sale up. */
  userName: string;
  total: number;
  amountPaid: number;
  amountRemaining: number;
  paymentMethod: string;
  itemCount: number;
}

export interface StockRow {
  productId: number;
  productName: string;
  category: string;
  quantityOnHand: number;
  minStockThreshold: number;
  isLowStock: boolean;
  costPrice: number;
  stockValue: number;
}

export interface ReceivableRow {
  customerId: number;
  customerName: string;
  mobileNumber?: string | null;
  outstandingBalance: number;
}

export interface PayableRow {
  supplierId: number;
  supplierName: string;
  contactNumber?: string | null;
  payableBalance: number;
}

export interface StockMovementRow {
  id: number;
  createdAtUtc: string;
  productName: string;
  changeQty: number;
  resultingQty: number;
  reason: string;
  note?: string | null;
  userName: string;
}

export interface ExpenseReport {
  total: number;
  byCategory: Array<{ category: string; total: number }>;
}

export type ReportGrouping = 'Day' | 'Week' | 'Month' | 'Year';

/**
 * One salesman's period. No cost and no profit: this answers "who took the money and who gave
 * the discounts", which is what a short drawer needs alongside it.
 */
export interface UserSalesRow {
  userId: number;
  userName: string;
  invoiceCount: number;
  /** Net of returns — what the sales are worth today. */
  totalSales: number;
  /** What they actually took at the counter. */
  cashTaken: number;
  /** What they let leave on credit. */
  creditGiven: number;
  /** Line discounts plus whole-bill discounts. */
  discountGiven: number;
}

export const reportApi = {
  salesByUser(from: string, to: string): Promise<UserSalesRow[]> {
    return unwrap(
      api.get<ApiEnvelope<UserSalesRow[]>>('/reports/sales-by-user', { params: { from, to } }),
    );
  },

  sales(from: string, to: string, groupBy: ReportGrouping): Promise<PeriodTotals[]> {
    return unwrap(
      api.get<ApiEnvelope<PeriodTotals[]>>('/reports/sales', { params: { from, to, groupBy } }),
    );
  },

  profit(from: string, to: string, groupBy: ReportGrouping): Promise<ProfitRow[]> {
    return unwrap(
      api.get<ApiEnvelope<ProfitRow[]>>('/reports/profit', { params: { from, to, groupBy } }),
    );
  },

  profitByProduct(from: string, to: string): Promise<ProductProfitRow[]> {
    return unwrap(
      api.get<ApiEnvelope<ProductProfitRow[]>>('/reports/profit-by-product', {
        params: { from, to, limit: 200 },
      }),
    );
  },

  salesByType(from: string, to: string): Promise<SaleTypeTotals[]> {
    return unwrap(
      api.get<ApiEnvelope<SaleTypeTotals[]>>('/reports/sales-by-type', { params: { from, to } }),
    );
  },

  returnsByType(from: string, to: string): Promise<SaleTypeReturns[]> {
    return unwrap(
      api.get<ApiEnvelope<SaleTypeReturns[]>>('/reports/returns-by-type', { params: { from, to } }),
    );
  },

  salesList(
    from: string,
    to: string,
    saleType?: 'Retail' | 'Wholesale',
  ): Promise<PagedResult<SaleListRow>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<SaleListRow>>>('/reports/sales-list', {
        params: { from, to, saleType, pageSize: 200 },
      }),
    );
  },

  stock(lowStockOnly = false): Promise<StockRow[]> {
    return unwrap(api.get<ApiEnvelope<StockRow[]>>('/reports/stock', { params: { lowStockOnly } }));
  },

  receivables(): Promise<ReceivableRow[]> {
    return unwrap(api.get<ApiEnvelope<ReceivableRow[]>>('/reports/receivables'));
  },

  payables(): Promise<PayableRow[]> {
    return unwrap(api.get<ApiEnvelope<PayableRow[]>>('/reports/payables'));
  },

  expenses(from: string, to: string): Promise<ExpenseReport> {
    return unwrap(api.get<ApiEnvelope<ExpenseReport>>('/reports/expenses', { params: { from, to } }));
  },

  stockMovements(from?: string, to?: string): Promise<PagedResult<StockMovementRow>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<StockMovementRow>>>('/reports/stock-movements', {
        params: { from, to, pageSize: 100 },
      }),
    );
  },
};
