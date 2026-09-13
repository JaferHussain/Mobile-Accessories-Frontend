import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult } from '@/types/api';
import type { PaymentMethod } from '@/features/pos/posApi';

export interface Customer {
  id: number;
  name: string;
  mobileNumber?: string | null;
  address?: string | null;
  outstandingBalance: number;
  /**
   * What this customer already owed before the software was in use, carried over from the
   * shop's paper register. Null means none was ever recorded — not the same as a recorded zero.
   */
  openingBalance?: number | null;
  isActive: boolean;
}

export type LedgerEntryType =
  | 'Invoice'
  | 'Payment'
  | 'SaleReturn'
  | 'Adjustment'
  | 'OpeningBalance';

export interface LedgerEntry {
  id: number;
  entryDateUtc: string;
  entryType: LedgerEntryType;
  /** Why this entry exists. Carried by a correction to an opening balance. */
  note?: string | null;
  referenceId?: number | null;
  referenceNumber?: string | null;
  billAmount: number;
  paidAmount: number;
  balanceAfter: number;
}

export interface CustomerSummary {
  totalPurchased: number;
  totalPaid: number;
  totalOutstanding: number;
  invoiceCount: number;
}

export interface ReceivePaymentResult {
  paymentId: number;
  receiptNumber: string;
  amount: number;
  balanceAfter: number;
}

export interface OpeningBalanceResult {
  customerId: number;
  openingBalance: number;
  previousOpeningBalance?: number | null;
  outstandingBalance: number;
  wasCorrection: boolean;
}

export const customerApi = {
  /**
   * Records — or corrects — what a customer already owed before the software was in use.
   *
   * Sending this a second time is a correction: the customer's balance moves by the difference,
   * never by the full amount again. A reason is required once a figure exists.
   */
  setOpeningBalance(
    customerId: number,
    amount: number,
    reason?: string | null,
  ): Promise<OpeningBalanceResult> {
    return unwrap(
      api.put<ApiEnvelope<OpeningBalanceResult>>(
        `/customers/${customerId}/opening-balance`,
        { amount, reason: reason?.trim() || null },
      ),
    );
  },

  search(search?: string, withBalanceOnly = false): Promise<PagedResult<Customer>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<Customer>>>('/customers', {
        params: { search, withBalanceOnly },
      }),
    );
  },

  get(id: number): Promise<Customer> {
    return unwrap(api.get<ApiEnvelope<Customer>>(`/customers/${id}`));
  },

  ledger(id: number, page = 1, pageSize = 25): Promise<PagedResult<LedgerEntry>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<LedgerEntry>>>(`/customers/${id}/ledger`, {
        params: { page, pageSize },
      }),
    );
  },

  summary(id: number): Promise<CustomerSummary> {
    return unwrap(api.get<ApiEnvelope<CustomerSummary>>(`/customers/${id}/summary`));
  },

  receivePayment(
    id: number,
    amount: number,
    paymentMethod: PaymentMethod,
    note?: string | null,
    confirmOverpayment = false,
  ): Promise<ReceivePaymentResult> {
    return unwrap(
      api.post<ApiEnvelope<ReceivePaymentResult>>(`/customers/${id}/payments`, {
        amount,
        paymentMethod,
        note,
        confirmOverpayment,
      }),
    );
  },
};
