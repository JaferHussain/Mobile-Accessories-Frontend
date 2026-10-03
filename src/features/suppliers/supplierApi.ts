import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult } from '@/types/api';
import type { PaymentMethod } from '@/features/pos/posApi';

export interface Supplier {
  id: number;
  name: string;
  contactNumber?: string | null;
  address?: string | null;
  /** Stored exactly as entered — the supplier's own paperwork sets the format. */
  cnic?: string | null;
  email?: string | null;
  bankName?: string | null;
  bankAccountTitle?: string | null;
  bankAccountNumber?: string | null;
  notes?: string | null;
  payableBalance: number;
  isActive: boolean;
}

/** Everything a supplier record accepts. Only the name is required. */
export interface SupplierUpsert {
  name: string;
  contactNumber?: string | null;
  address?: string | null;
  cnic?: string | null;
  email?: string | null;
  bankName?: string | null;
  bankAccountTitle?: string | null;
  bankAccountNumber?: string | null;
  notes?: string | null;
}

export type SupplierLedgerEntryType = 'Purchase' | 'Return' | 'Payment';

/** One line of a supplier's account. Every amount, and the balance, is the server's. */
export interface SupplierLedgerEntry {
  entryType: SupplierLedgerEntryType;
  referenceId: number;
  entryDateUtc: string;
  /** The goods bought or sent back. Null for a payment. */
  productName: string | null;
  quantity: number | null;
  /** A return's own number. */
  referenceNumber: string | null;
  /** How a payment was made. */
  paymentMethod: PaymentMethod | null;
  /** A payment's reference (cheque / transaction number) or a return's reason. */
  note: string | null;
  billAmount: number;
  returnedAmount: number;
  paidAmount: number;
  /** Whether a payment's proof is attached. Always false for goods. */
  hasProof: boolean;
  /** The shop account a payment left, when one was named. */
  shopAccountName?: string | null;
  balanceAfter: number;
}

export interface SupplierLedger {
  supplierId: number;
  supplierName: string;
  payableBalance: number;
  /** All-time, so the three always explain `payableBalance`. */
  totalPurchased: number;
  totalReturned: number;
  totalPaid: number;
  from: string | null;
  to: string | null;
  /** What was owed before `from` — the balance the listed period opens on. */
  openingBalance: number;
  entries: SupplierLedgerEntry[];
}

export interface Purchase {
  id: number;
  supplierId: number;
  productId: number;
  productName: string;
  purchaseDateUtc: string;
  unitCost: number;
  quantity: number;
  total: number;
  returnedQty: number;
}

export interface RecordPurchasePayload {
  supplierId: number;
  productId: number;
  unitCost: number;
  quantity: number;
  newSalePrice?: number;
}

export const supplierApi = {
  search(search?: string): Promise<PagedResult<Supplier>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<Supplier>>>('/suppliers', {
        params: { search, pageSize: 100 },
      }),
    );
  },

  create(supplier: SupplierUpsert): Promise<Supplier> {
    return unwrap(api.post<ApiEnvelope<Supplier>>('/suppliers', supplier));
  },

  update(id: number, supplier: SupplierUpsert): Promise<Supplier> {
    return unwrap(api.put<ApiEnvelope<Supplier>>(`/suppliers/${id}`, supplier));
  },

  /**
   * A supplier's account. `from` and `to` are `yyyy-mm-dd` shop days, both inclusive; left out,
   * the account runs from the first dealing to today. Admin only.
   */
  ledger(id: number, from?: string, to?: string): Promise<SupplierLedger> {
    return unwrap(
      api.get<ApiEnvelope<SupplierLedger>>(`/suppliers/${id}/ledger`, { params: { from, to } }),
    );
  },

  recordPayment(
    id: number,
    amount: number,
    paymentMethod: PaymentMethod,
    note?: string | null,
    confirmOverpayment = false,
    /** Which shop account paid. Only for a transfer, and optional. */
    shopAccountId: number | null = null,
  ): Promise<{ supplierId: number; paymentId: number; payableBalance: number }> {
    return unwrap(
      api.post<ApiEnvelope<{ supplierId: number; paymentId: number; payableBalance: number }>>(
        `/suppliers/${id}/payments`,
        { amount, paymentMethod, note, confirmOverpayment, shopAccountId },
      ),
    );
  },
};

export const purchaseApi = {
  /** "Return item": productSearch finds a purchase by product name instead of scrolling every
   * purchase from a supplier. */
  search(supplierId?: number, productSearch?: string): Promise<PagedResult<Purchase>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<Purchase>>>('/purchases', {
        params: { supplierId, productSearch, pageSize: 50 },
      }),
    );
  },

  record(payload: RecordPurchasePayload): Promise<{
    purchaseId: number;
    newQuantityOnHand: number;
    newCostPrice: number;
    newSupplierPayable: number;
  }> {
    return unwrap(api.post<ApiEnvelope<never>>('/purchases', payload)) as never;
  },
};
