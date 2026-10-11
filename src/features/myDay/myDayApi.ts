import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';
import type { TeamActivity, TeamMember } from '@/features/team/teamApi';

/** The signed-in person's own day: the card the owner sees, and what they sold, returned and recovered. */
/** How the person's sales were paid — what came in at the sale, cash apart from online. */
export interface MyPayments {
  cashBills: number;
  cashReceived: number;
  onlineBills: number;
  onlineReceived: number;
  /** Each online method on its own: BankTransfer, JazzCash, EasyPaisa, Raast. Largest first. */
  online: Array<{ method: string; bills: number; received: number }>;
}

export interface MyDay {
  card: TeamMember;
  activity: TeamActivity[];
  /** Absent from an older server; the screen then shows nothing about it. */
  payments?: MyPayments;
}

export const myDayApi = {
  /** Always the caller's own figures. `from`/`to` are shop days, inclusive; today when left out. */
  mine(from?: string, to?: string): Promise<MyDay> {
    return unwrap(api.get<ApiEnvelope<MyDay>>('/my-day', { params: { from, to } }));
  },
};
