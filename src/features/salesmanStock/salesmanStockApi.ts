import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';

export type SalesmanStockReason = 'Issued' | 'Returned' | 'Sold' | 'CustomerReturn';

export interface SalesmanHolding {
  productId: number;
  productName: string;
  quantity: number;
}

/** One movement in or out of his bag. `changeQty` is + into the bag, − out of it. */
export interface SalesmanStockMovement {
  id: number;
  productId: number;
  productName: string;
  reason: SalesmanStockReason;
  changeQty: number;
  resultingQty: number;
  referenceId: number | null;
  /** The invoice for a sale, the return for a customer return. */
  reference: string | null;
  note: string | null;
  recordedBy: string;
  createdAtUtc: string;
}

export interface SalesmanStockStatement {
  userId: number;
  fullName: string;
  job: string | null;
  totalUnits: number;
  items: SalesmanHolding[];
  movements: SalesmanStockMovement[];
}

export interface SalesmanStockLine {
  productId: number;
  quantity: number;
}

export const salesmanStockApi = {
  /** Admin only. */
  statement(userId: number): Promise<SalesmanStockStatement> {
    return unwrap(api.get<ApiEnvelope<SalesmanStockStatement>>(`/salesman-stock/${userId}`));
  },

  /** The signed-in salesman's own bag. */
  mine(): Promise<SalesmanStockStatement> {
    return unwrap(api.get<ApiEnvelope<SalesmanStockStatement>>('/salesman-stock/me'));
  },

  /** Admin only. Only what is on the shelf — the server refuses more. */
  issue(userId: number, items: SalesmanStockLine[], note: string | null): Promise<SalesmanStockStatement> {
    return unwrap(api.post<ApiEnvelope<SalesmanStockStatement>>(`/salesman-stock/${userId}/issue`, { items, note }));
  },

  /** Admin only. Only what he is carrying — the server refuses more. */
  returnToShop(userId: number, items: SalesmanStockLine[], note: string | null): Promise<SalesmanStockStatement> {
    return unwrap(api.post<ApiEnvelope<SalesmanStockStatement>>(`/salesman-stock/${userId}/return`, { items, note }));
  },
};
