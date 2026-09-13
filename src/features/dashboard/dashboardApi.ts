import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';
import type { DashboardData, DashboardPeriod } from './Dashboard';

export const dashboardApi = {
  get(period: DashboardPeriod): Promise<DashboardData> {
    return unwrap(api.get<ApiEnvelope<DashboardData>>('/dashboard', { params: { period } }));
  },
};
