import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';

export type PaymentMethod =
  | 'Cash'
  | 'BankTransfer'
  | 'JazzCash'
  | 'EasyPaisa'
  | 'Raast'
  | 'Credit'
  | 'Partial';

export const PAYMENT_METHODS: ReadonlyArray<{ value: PaymentMethod; label: string }> = [
  { value: 'Cash', label: 'Cash' },
  { value: 'BankTransfer', label: 'Bank transfer' },
  { value: 'JazzCash', label: 'JazzCash' },
  { value: 'EasyPaisa', label: 'EasyPaisa' },
  { value: 'Raast', label: 'Raast' },
  { value: 'Credit', label: 'Credit (udhaar)' },
  { value: 'Partial', label: 'Part paid, rest on credit' },
];

/**
 * The payment methods this user may choose.
 *
 * Credit and part payment are the owner's to approve (FR-051), so they are not offered to a
 * salesman. This is a usability measure only — the server refuses a Staff credit sale however
 * the request arrives (FR-057).
 */
export function paymentMethodsFor(canSellOnCredit: boolean) {
  return canSellOnCredit
    ? PAYMENT_METHODS
    : PAYMENT_METHODS.filter((m) => m.value !== 'Credit' && m.value !== 'Partial');
}

/** Methods that settle the bill in full at the counter. */
export const FULLY_PAID_METHODS: readonly PaymentMethod[] = [
  'Cash',
  'BankTransfer',
  'JazzCash',
  'EasyPaisa',
  'Raast',
];

/** Counter sale or bulk sale to another shopkeeper. Drives the owner's day-end split. */
export type SaleType = 'Retail' | 'Wholesale';

export const SALE_TYPES: ReadonlyArray<{ value: SaleType; label: string }> = [
  { value: 'Retail', label: 'Retail' },
  { value: 'Wholesale', label: 'Wholesale' },
];

export interface CreateInvoiceLine {
  productId: number;
  quantity: number;
  unitSalePrice: number;
  lineDiscount: number;
}

export interface CreateInvoicePayload {
  customerId?: number | null;
  newCustomer?: { name: string; mobileNumber?: string | null } | null;
  orderDiscount: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  saleType: SaleType;
  items: CreateInvoiceLine[];
}

export interface CreateInvoiceResult {
  invoiceId: number;
  invoiceNumber: string;
  subtotal: number;
  totalDiscount: number;
  total: number;
  amountPaid: number;
  amountRemaining: number;
  customerId: number | null;
  customerBalance: number | null;
}

export interface CustomerSummary {
  id: number;
  name: string;
  mobileNumber?: string | null;
  outstandingBalance: number;
}

export const posApi = {
  /**
   * Saves the sale. The Idempotency-Key protects against a double-tap at a busy counter: a
   * replayed key returns the sale already recorded rather than selling the goods twice.
   */
  createInvoice(payload: CreateInvoicePayload, idempotencyKey: string): Promise<CreateInvoiceResult> {
    return unwrap(
      api.post<ApiEnvelope<CreateInvoiceResult>>('/invoices', payload, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    );
  },

  createCustomer(name: string, mobileNumber?: string | null): Promise<CustomerSummary> {
    return unwrap(api.post<ApiEnvelope<CustomerSummary>>('/customers', { name, mobileNumber }));
  },

  searchCustomers(search: string): Promise<CustomerSummary[]> {
    return unwrap(
      api.get<ApiEnvelope<{ items: CustomerSummary[] }>>('/customers', { params: { search } }),
    ).then((page) => page.items);
  },
};
