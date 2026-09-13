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

export const reportApi = {
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
