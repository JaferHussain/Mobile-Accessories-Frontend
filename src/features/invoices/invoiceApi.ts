import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult } from '@/types/api';

/**
 * One past sale, as the Invoices list shows it.
 *
 * Carries no cost and no profit: this list is reachable by Staff, because handing a customer
 * their own receipt is counter work.
 */
export interface InvoiceListRow {
  id: number;
  invoiceNumber: string;
  invoiceDateUtc: string;
  /** Null for a walk-in — a sale that belongs to nobody. */
  customerId: number | null;
  /** Null for a walk-in. The screen decides how to word that; the server does not invent a label. */
  customerName: string | null;
  saleType: 'Retail' | 'Wholesale';
  total: number;
  amountPaid: number;
  amountRemaining: number;
  /** Total less the value of any returns — what the sale is worth today. */
  netAmount: number;
  paymentMethod: string;
}

export interface InvoiceSearch {
  customerId?: number;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const invoiceApi = {
  search(params: InvoiceSearch = {}): Promise<PagedResult<InvoiceListRow>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<InvoiceListRow>>>('/invoices', {
        params: { pageSize: 25, ...params },
      }),
    );
  },
};
