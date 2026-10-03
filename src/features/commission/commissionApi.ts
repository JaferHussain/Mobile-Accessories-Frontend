import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';
import type { PaymentMethod } from '@/features/pos/posApi';

/** One product line's commission. Every figure is the server's. */
export interface CommissionLine {
  invoiceId: number;
  invoiceNumber: string;
  saleDate: string;
  customerName: string | null;
  productName: string;
  unitsSold: number;
  unitsReturned: number;
  /** The owner's price at the moment of sale. */
  baseUnitPrice: number;
  /** What one unit really fetched, after discounts. */
  soldAtUnitPrice: number;
  extraPerUnit: number;
  ratePercent: number;
  commission: number;
  earned: number;
  pending: number;
  status: 'Earned' | 'Pending' | 'PartEarned';
  /** The day the sale was paid for in full — when its commission was earned. */
  earnedOn: string | null;
}

export interface CommissionPayout {
  id: number;
  amount: number;
  paymentMethod: string;
  note: string | null;
  paidAtUtc: string;
  recordedBy: string;
}

/** A salesman's commission account. Earned − paid out = owed. */
export interface CommissionStatement {
  userId: number;
  fullName: string;
  job: string | null;
  totalCommission: number;
  earned: number;
  pending: number;
  paidOut: number;
  owed: number;
  lines: CommissionLine[];
  payouts: CommissionPayout[];
}

export const commissionApi = {
  /** Admin only. */
  statement(userId: number): Promise<CommissionStatement> {
    return unwrap(api.get<ApiEnvelope<CommissionStatement>>(`/commissions/${userId}`));
  },

  /** The signed-in salesman's own account. */
  mine(): Promise<CommissionStatement> {
    return unwrap(api.get<ApiEnvelope<CommissionStatement>>('/commissions/me'));
  },

  /** Admin only. Never more than he is owed — the server refuses it. */
  pay(userId: number, amount: number, paymentMethod: PaymentMethod, note: string | null): Promise<CommissionStatement> {
    return unwrap(
      api.post<ApiEnvelope<CommissionStatement>>(`/commissions/${userId}/payouts`, { amount, paymentMethod, note }),
    );
  },
};
