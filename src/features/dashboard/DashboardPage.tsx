import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dashboard, type DashboardPeriod } from './Dashboard';
import { dashboardApi } from './dashboardApi';
import { periodRange } from './dashboardRange';
import { LensChips, type Lens } from './LensChips';
import { AttentionStrip } from './AttentionStrip';
import { PersonView } from './PersonView';
import { MoneyView } from './MoneyView';
import { CompareTable } from './CompareTable';
import { teamApi } from '@/features/team/teamApi';
import { proofApi } from '@/features/proofs/proofApi';
import { ApiError } from '@/types/api';

const PERIODS: ReadonlyArray<{ value: DashboardPeriod; label: string }> = [
  { value: 'Today', label: 'Today' },
  { value: 'ThisMonth', label: 'This month' },
  { value: 'ThisYear', label: 'This year' },
];

/**
 * The owner's dashboard: ONE layout, scoped by a row of chips — the whole shop, each person, and
 * the owner's money. What is worth a look comes first, then the figures.
 *
 * <p>Built from what the server already answers: the shop totals (`/dashboard`), each person's days
 * and the watch list (`/team`), and the drawer, suppliers and expenses behind the Money chip. This
 * page only arranges them — it works out no figure of its own. Admin only: cost and profit appear
 * here, and the route is guarded to match.</p>
 */
export function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('Today');
  const [lens, setLens] = useState<Lens>('all');

  const { from, to } = periodRange(period);

  const shop = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => dashboardApi.get(period),
  });

  const members = useQuery({
    queryKey: ['team', 'members', from, to],
    queryFn: () => teamApi.members(from, to),
  });

  const watch = useQuery({
    queryKey: ['team', 'watch', from, to],
    queryFn: () => teamApi.watchList(from, to),
  });

  const proofs = useQuery({
    queryKey: ['proofs', 'missing', from, to],
    queryFn: () => proofApi.missing(from, to),
  });

  const people = members.data ?? [];
  const flags = watch.data ?? [];
  const proofMissing = proofs.data?.length ?? 0;
  const person = typeof lens === 'number' ? people.find((member) => member.userId === lens) : undefined;

  const attentionItems = typeof lens === 'number' ? flags.filter((item) => item.userId === lens) : lens === 'all' ? flags : [];
  const attentionTitle = lens === 'all' ? 'Everyone' : lens === 'money' ? 'Money' : (person?.fullName ?? 'this person');

  return (
    <section className="dashboard">
      <header className="dashboard__header">
        <h2>Dashboard</h2>

        <div className="dashboard__periods" role="group" aria-label="Reporting period">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              className={period === option.value ? 'is-active' : undefined}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {shop.error && (
        <p className="form-error" role="alert">
          {shop.error instanceof ApiError ? shop.error.message : 'Could not load the dashboard.'}
        </p>
      )}

      <LensChips members={people} watch={flags} proofMissing={proofMissing} selected={lens} onSelect={setLens} />

      <AttentionStrip
        items={attentionItems}
        title={attentionTitle}
        proofMissing={lens === 'money' ? proofMissing : undefined}
      />

      {lens === 'all' && (
        <>
          <Dashboard
            showHeader={false}
            data={shop.data ?? null}
            period={period}
            isLoading={shop.isPending}
            onPeriodChange={setPeriod}
          />
          <CompareTable members={people} watch={flags} onSelect={setLens} />
        </>
      )}

      {person && <PersonView key={person.userId} member={person} from={from} to={to} />}

      {lens === 'money' && <MoneyView from={from} to={to} />}
    </section>
  );
}
