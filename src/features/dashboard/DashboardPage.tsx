import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dashboard, type DashboardPeriod } from './Dashboard';
import { dashboardApi } from './dashboardApi';
import { ApiError } from '@/types/api';

export function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('Today');

  const { data, isPending, error } = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => dashboardApi.get(period),
  });

  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error instanceof ApiError ? error.message : 'Could not load the dashboard.'}
        </p>
      )}

      <Dashboard
        data={data ?? null}
        period={period}
        isLoading={isPending}
        onPeriodChange={setPeriod}
      />
    </>
  );
}
