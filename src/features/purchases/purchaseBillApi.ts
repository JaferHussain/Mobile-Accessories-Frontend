import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';
import type { PaymentMethod } from '@/features/pos/posApi';

export interface PurchaseBillLineInput {
  productId: number;
  quantity: number;
  unitCost: number;
  /** Required the first time a product is stocked. */
  newRetailPrice?: number;
  newWholesalePrice?: number;
}

export interface PurchaseBillPaymentInput {
  amount: number;
  paymentMethod: PaymentMethod;
  /** `yyyy-mm-dd`, the shop's day it was really paid. Never before the bill, never in the future. */
  paidOn: string;
  shopAccountId?: number | null;
  reference?: string | null;
}

export interface RecordPurchaseBillInput {
  supplierId: number;
  billNumber?: string | null;
  /** `yyyy-mm-dd`, the shop's day the goods were bought. */
  billDate: string;
  note?: string | null;
  lines: PurchaseBillLineInput[];
  /** Paid with the bill, there and then. Absent: pay later. */
  payment?: PurchaseBillPaymentInput | null;
}

export interface StockedLine {
  purchaseId: number;
  productId: number;
  productName: string;
  quantity: number;
  unitCost: number;
  total: number;
  newQuantityOnHand: number;
  newCostPrice: number;
}

export interface RecordPurchaseBillResult {
  billId: number;
  total: number;
  paid: number;
  /** What the payment's screenshot is attached to; null when nothing was paid. */
  paymentId: number | null;
  newSupplierPayable: number;
  lines: StockedLine[];
}

export type PurchaseBillStatus = 'Paid' | 'PartPaid' | 'Unpaid';

export interface PurchaseBillSummary {
  id: number;
  supplierId: number;
  supplierName: string;
  billNumber: string | null;
  billDate: string;
  total: number;
  paid: number;
  returned: number;
  due: number;
  status: PurchaseBillStatus;
  itemCount: number;
  hasBillImage: boolean;
  note: string | null;
  recordedBy: string;
}

export interface PurchaseBillDetail extends PurchaseBillSummary {
  lines: Array<{
    purchaseId: number;
    productId: number;
    productName: string;
    quantity: number;
    unitCost: number;
    total: number;
    returnedQty: number;
  }>;
  payments: Array<{
    id: number;
    amount: number;
    paymentMethod: string;
    paidOn: string;
    note: string | null;
    hasProof: boolean;
  }>;
}

/** Owner only — a bill is purchase cost. */
export const purchaseBillApi = {
  list(supplierId?: number): Promise<PurchaseBillSummary[]> {
    return unwrap(api.get<ApiEnvelope<PurchaseBillSummary[]>>('/purchase-bills', { params: { supplierId } }));
  },

  get(id: number): Promise<PurchaseBillDetail> {
    return unwrap(api.get<ApiEnvelope<PurchaseBillDetail>>(`/purchase-bills/${id}`));
  },

  /** Stock first, then the payment — one transaction on the server. */
  record(bill: RecordPurchaseBillInput): Promise<RecordPurchaseBillResult> {
    return unwrap(api.post<ApiEnvelope<RecordPurchaseBillResult>>('/purchase-bills', bill));
  },

  /** Pays a bill later — never more than it still owes. */
  pay(id: number, payment: PurchaseBillPaymentInput): Promise<{ paymentId: number; due: number; newSupplierPayable: number }> {
    return unwrap(
      api.post<ApiEnvelope<{ paymentId: number; due: number; newSupplierPayable: number }>>(`/purchase-bills/${id}/payments`, payment),
    );
  },
};
