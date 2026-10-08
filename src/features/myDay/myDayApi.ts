import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';
import type { TeamActivity, TeamMember } from '@/features/team/teamApi';

/** The signed-in person's own day: the card the owner sees, and what they sold, returned and recovered. */
export interface MyDay {
  card: TeamMember;
  activity: TeamActivity[];
}

export const myDayApi = {
  /** Always the caller's own figures. `from`/`to` are shop days, inclusive; today when left out. */
  mine(from?: string, to?: string): Promise<MyDay> {
    return unwrap(api.get<ApiEnvelope<MyDay>>('/my-day', { params: { from, to } }));
  },
};
