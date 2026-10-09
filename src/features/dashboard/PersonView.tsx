import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { formatTime } from '@/features/team/TeamPage';
import { teamApi, type TeamMember } from '@/features/team/teamApi';

function Figure({ label, value, note, bad }: { label: string; value: string; note?: string; bad?: boolean }) {
  return (
    <div className={`kpi${bad ? ' kpi--bad' : ''}`}>
      <span className="kpi__label">{label}</span>
      <strong className="kpi__value">{value}</strong>
      {note && <span className="kpi__note">{note}</span>}
    </div>
  );
}

/**
 * One person's days: what they sold, took, gave away and brought back, then what they did.
 * Every figure is the server's (`/team`); this screen only arranges them. No cost and no profit
 * is carried per person.
 */
export function PersonView({ member, from, to }: { member: TeamMember; from: string; to: string }) {
  const activity = useQuery({
    queryKey: ['team', 'activity', member.userId, from, to],
    queryFn: () => teamApi.activity(member.userId, from, to),
  });

  const average = member.invoiceCount > 0 ? member.totalSales / member.invoiceCount : 0;
  const period = from === to ? '' : `?from=${from}&to=${to}`;

  return (
    <>
      <div className="dashboard__kpis dashboard__kpis--plain">
        <Figure label="Sales (net of returns)" value={formatPkr(member.totalSales)} note={`${member.invoiceCount} bills`} />
        <Figure label="Average bill" value={formatPkr(average)} />
        <Figure label="Received at sale" value={formatPkr(member.receivedAtSale)} />
        <Figure label="Udhaar given" value={formatPkr(member.creditGiven)} />
        <Figure label="Discounts given" value={formatPkr(member.discountGiven)} />
        <Figure
          label="Returns"
          value={`${member.returnCount} · ${formatPkr(member.returnValue)}`}
          bad={member.returnValue > 0}
        />
        <Figure label="Udhaar collected" value={formatPkr(member.udhaarCollected)} />
        {/* Market cash is not in the drawer until he hands it over. */}
        {member.job === 'FieldSales' && (
          <>
            <Figure label="Cash with him" value={formatPkr(member.cashInHand)} note="not yet handed over" />
            <Figure label="Stock with him" value={`${member.stockUnits} units`} />
          </>
        )}
      </div>

      <p className="lens-links">
        {member.job === 'FieldSales' && (
          <>
            <Link to={`/salesman-stock/${member.userId}`}>Stock →</Link>
            <Link to={`/salesman-cash/${member.userId}`}>Cash →</Link>
            <Link to={`/commissions/${member.userId}`}>Commission →</Link>
          </>
        )}
        <Link to={`/team/${member.userId}${period}`}>Full activity →</Link>
        <small>{member.lastLoginUtc ? `Last signed in ${formatTime(member.lastLoginUtc)}` : 'Not signed in yet'}</small>
      </p>

      <section className="lens-panel">
        <h3>What {member.fullName} did</h3>

        <QueryState
          isLoading={activity.isPending}
          error={activity.error}
          isEmpty={activity.data?.length === 0}
          emptyMessage="Nothing recorded for these days."
        >
          <ul className="lens-timeline">
            {activity.data?.slice(0, 12).map((entry) => (
              <li key={`${entry.kind}-${entry.referenceId}-${entry.entryDateUtc}`}>
                <span className="lens-timeline__time">{formatTime(entry.entryDateUtc)}</span>
                <span>
                  {entry.kind} {entry.reference ?? ''}
                  {entry.detail && <small> · {entry.detail}</small>}
                </span>
                <span className="numeric">{entry.amount === null ? '—' : formatPkr(entry.amount)}</span>
              </li>
            ))}
          </ul>
        </QueryState>
      </section>
    </>
  );
}
