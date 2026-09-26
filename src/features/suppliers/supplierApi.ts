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

  recordPayment(
    id: number,
    amount: number,
    paymentMethod: PaymentMethod,
    note?: string | null,
    confirmOverpayment = false,
  ): Promise<{ supplierId: number; payableBalance: number }> {
    return unwrap(
      api.post<ApiEnvelope<{ supplierId: number; payableBalance: number }>>(
        `/suppliers/${id}/payments`,
        { amount, paymentMethod, note, confirmOverpayment },
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
