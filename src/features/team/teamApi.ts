import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';

/** One person's period, as the owner's Team card shows it. Every figure is the server's. */
export interface TeamMember {
  userId: number;
  fullName: string;
  role: 'Admin' | 'Staff';
  /** Counter or FieldSales for staff; null for the owner. */
  job: 'Counter' | 'FieldSales' | null;
  invoiceCount: number;
  /** Net of returns. */
  totalSales: number;
  /** Paid at the sale — cash or transfer. */
  receivedAtSale: number;
  creditGiven: number;
  discountGiven: number;
  returnCount: number;
  returnValue: number;
  udhaarCollected: number;
  lastLoginUtc: string | null;
  /** Cash a field salesman is holding now, until he hands it over. Zero at the counter. */
  cashInHand: number;
  /** Units of stock a field salesman is carrying now. Zero at the counter. */
  stockUnits: number;
}

export type ActivityKind = 'Sale' | 'Return' | 'Recovery' | 'SupplierPayment' | 'Expense' | 'Purchase' | 'SignIn';

export interface TeamActivity {
  kind: ActivityKind;
  referenceId: number;
  reference: string | null;
  entryDateUtc: string;
  amount: number | null;
  method: string | null;
  detail: string | null;
}

export type WatchKind = 'BigDiscount' | 'TransferWithoutProof' | 'SameDayReturn' | 'TransferRefund';

/** Something worth a look — never an accusation. */
export interface WatchItem {
  kind: WatchKind;
  referenceId: number;
  reference: string | null;
  entryDateUtc: string;
  userId: number;
  userName: string;
  amount: number;
  detail: string | null;
}

/** Admin only. `from` and `to` are yyyy-mm-dd shop days, both inclusive; today when left out. */
export const teamApi = {
  members(from?: string, to?: string): Promise<TeamMember[]> {
    return unwrap(api.get<ApiEnvelope<TeamMember[]>>('/team', { params: { from, to } }));
  },

  activity(userId: number, from?: string, to?: string): Promise<TeamActivity[]> {
    return unwrap(api.get<ApiEnvelope<TeamActivity[]>>(`/team/${userId}/activity`, { params: { from, to } }));
  },

  watchList(from?: string, to?: string): Promise<WatchItem[]> {
    return unwrap(api.get<ApiEnvelope<WatchItem[]>>('/team/watchlist', { params: { from, to } }));
  },
};
