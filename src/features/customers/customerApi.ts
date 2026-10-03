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
  /** A standing label the owner sets (feature 004) — never derived from their invoices. */
  saleType: 'Retail' | 'Wholesale';
  /** The owner's udhaar mark: the field salesman may sell to this customer on credit. */
  creditAllowed?: boolean;
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
  /** How a sale or payment was paid. Absent for every other kind of entry. */
  paymentMethod?: string | null;
  /** Whether that sale or payment has its proof attached. */
  hasProof?: boolean;
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

/**
 * A payment reminder, prepared by the server. Links are null when the customer has no usable
 * number. The due date is one month after the oldest purchase still unpaid, rolled forward a
 * month at a time once passed — worked out there, never here.
 */
export interface PaymentReminder {
  whatsAppUrl: string | null;
  smsUrl: string | null;
  outstanding: number;
  /** A calendar date, `yyyy-mm-dd`, in the shop's own day. */
  unpaidSince: string;
  dueOn: string;
  monthsOverdue: number;
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
   * Sets the owner's udhaar mark. The update endpoint replaces the contact details too, so they
   * are sent back exactly as they stand. The server ignores the mark from anyone but the owner.
   */
  setCreditAllowed(customer: Customer, creditAllowed: boolean): Promise<Customer> {
    return unwrap(
      api.put<ApiEnvelope<Customer>>(`/customers/${customer.id}`, {
        name: customer.name,
        mobileNumber: customer.mobileNumber ?? null,
        address: customer.address ?? null,
        creditAllowed,
      }),
    );
  },

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

  search(params: {
    search?: string;
    withBalanceOnly?: boolean;
    saleType?: 'Retail' | 'Wholesale';
  } = {}): Promise<PagedResult<Customer>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<Customer>>>('/customers', { params }),
    );
  },

  /** What this customer owes today and by when, as WhatsApp and SMS messages. 422 when nothing is owed. */
  reminder(id: number): Promise<PaymentReminder> {
    return unwrap(api.get<ApiEnvelope<PaymentReminder>>(`/customers/${id}/reminder`));
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
