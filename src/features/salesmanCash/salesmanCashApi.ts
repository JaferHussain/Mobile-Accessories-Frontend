import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';
import type { PaymentMethod } from '@/features/pos/posApi';

export type SalesmanCashKind = 'Sale' | 'Recovery' | 'Refund' | 'Handover';

/** One movement of the salesman's cash. `effect` is + for money taken, − for money given back or handed over. */
export interface SalesmanCashMovement {
  kind: SalesmanCashKind;
  referenceId: number;
  reference: string | null;
  entryDateUtc: string;
  amount: number;
  method: string | null;
  /** The customer; for a handover, who received it. */
  detail: string | null;
  effect: number;
}

/** Collected − refunded − handed over = in hand. Every figure is the server's. */
export interface SalesmanCashStatement {
  userId: number;
  fullName: string;
  job: string | null;
  collected: number;
  refunded: number;
  handedOver: number;
  inHand: number;
  movements: SalesmanCashMovement[];
}

export const salesmanCashApi = {
  /** Admin only. */
  statement(userId: number): Promise<SalesmanCashStatement> {
    return unwrap(api.get<ApiEnvelope<SalesmanCashStatement>>(`/salesman-cash/${userId}`));
  },

  /** The signed-in salesman's own cash. */
  mine(): Promise<SalesmanCashStatement> {
    return unwrap(api.get<ApiEnvelope<SalesmanCashStatement>>('/salesman-cash/me'));
  },

  /** Admin only — "Received from salesman". Never more than he holds; the server refuses it. */
  receive(userId: number, amount: number, paymentMethod: PaymentMethod, note: string | null): Promise<SalesmanCashStatement> {
    return unwrap(
      api.post<ApiEnvelope<SalesmanCashStatement>>(`/salesman-cash/${userId}/handovers`, { amount, paymentMethod, note }),
    );
  },
};
