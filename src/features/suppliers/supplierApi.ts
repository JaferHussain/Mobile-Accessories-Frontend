import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult } from '@/types/api';
import type { PaymentMethod } from '@/features/pos/posApi';

export interface Supplier {
  id: number;
  name: string;
  contactNumber?: string | null;
  address?: string | null;
  payableBalance: number;
  isActive: boolean;
}

export interface Purchase {
  id: number;
  supplierId: number;
  productId: number;
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

  create(name: string, contactNumber?: string | null, address?: string | null): Promise<Supplier> {
    return unwrap(
      api.post<ApiEnvelope<Supplier>>('/suppliers', { name, contactNumber, address }),
    );
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
  search(supplierId?: number): Promise<PagedResult<Purchase>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<Purchase>>>('/purchases', {
        params: { supplierId, pageSize: 50 },
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
