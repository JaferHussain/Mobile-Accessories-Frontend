import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';

/** A day's drawer: what the day put through it, and what was counted. */
export interface DayClosing {
  /** The shop's own trading day (Asia/Karachi), as yyyy-MM-dd. */
  closingDate: string;
  openingFloat: number;

  /** All computed by the server from what was recorded. Cash only. */
  cashSales: number;
  cashRecovery: number;
  /** Cash a field salesman handed over that day — his market cash joins the drawer only then. */
  cashFromSalesmen: number;
  cashRefunds: number;
  cashPaidOut: number;
  /** Supplier bills settled in cash. Kept apart from cashPaidOut: buying stock and paying the
   *  electricity bill are different questions. */
  cashToSuppliers: number;
  expectedCash: number;

  countedCash: number;
  /** Counted less expected. Negative is short. */
  difference: number;

  note: string | null;
  closedByUserName: string | null;
  closedAtUtc: string | null;
  /** False while this is only a preview — nothing counted or saved yet. */
  isClosed: boolean;
}

export interface CloseDayRequest {
  closingDate: string;
  openingFloat: number;
  countedCash: number;
  note: string | null;
}

export const dayCloseApi = {
  /** What the day took, before anyone counts it. Saves nothing. */
  preview(date: string, openingFloat: number): Promise<DayClosing> {
    return unwrap(
      api.get<ApiEnvelope<DayClosing>>('/day-closings/preview', {
        params: { date, openingFloat },
      }),
    );
  },

  close(request: CloseDayRequest): Promise<DayClosing> {
    return unwrap(api.post<ApiEnvelope<DayClosing>>('/day-closings', request));
  },

  /** Recent closings — where a pattern of small shorts becomes visible. */
  recent(count = 30): Promise<DayClosing[]> {
    return unwrap(
      api.get<ApiEnvelope<DayClosing[]>>('/day-closings', { params: { count } }),
    );
  },
};
