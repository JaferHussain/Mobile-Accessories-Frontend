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

/**
 * What a counter lookup found — and, crucially, HOW it found it (feature 005).
 *
 * A scanned barcode is unambiguous: the salesman is holding the very item it came off, so it
 * goes straight into the cart. A typed search is a guess among look-alike stock, so it returns
 * candidates for the salesman to pick from. Collapsing these two into one shape is what made
 * the old code add the first search hit automatically.
 */
export type ProductLookup =
  | { kind: 'barcode'; product: ProductSummary }
  | { kind: 'matches'; products: ProductSummary[] };

/** The counter only ever needs the fields it shows; imported to avoid a circular module. */
type ProductSummary = import('@/features/products/productApi').Product;

/** How many candidates a typed search offers. Enough to choose from, few enough to scan by eye. */
export const MAX_SEARCH_RESULTS = 8;

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
  /** The customer's account, where a non-cash payment came from. A cash sale is refused one. */
  paymentAccountNumber?: string | null;
  /** Their reference for that transfer. Optional, permanently. */
  paymentTransactionId?: string | null;
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
  /** Marked by the owner as an udhaar customer: a field salesman may sell to them on credit. */
  creditAllowed?: boolean;
}

export const posApi = {
  /**
   * Attaches the screenshot behind a non-cash payment to an invoice that already exists
   * (feature 008). Separate from createInvoice on purpose: the sale must never wait on it.
   */
  uploadPaymentProof(invoiceId: number, picture: File): Promise<void> {
    const body = new FormData();
    body.append('file', picture);

    return unwrap(
      api.post<ApiEnvelope<unknown>>(`/invoices/${invoiceId}/payment-proof`, body),
    ).then(() => undefined);
  },

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

  /** Registered udhaar customers only — the one kind of customer checkout looks up. */
  searchCustomers(search: string): Promise<CustomerSummary[]> {
    return unwrap(
      api.get<ApiEnvelope<{ items: CustomerSummary[] }>>('/customers', { params: { search, udhaarOnly: true } }),
    ).then((page) => page.items);
  },
};
