import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { PAYMENT_METHODS } from '@/features/pos/posApi';
import { teamApi, type ActivityKind, type TeamActivity } from './teamApi';
import { JOB_LABELS, formatTime } from './TeamPage';

export const KIND_LABELS: Record<ActivityKind, string> = {
  Sale: 'Sale',
  Return: 'Return',
  Recovery: 'Udhaar received',
  SupplierPayment: 'Supplier paid',
  Expense: 'Expense',
  Purchase: 'Purchase',
  SignIn: 'Signed in',
};

function methodLabel(method: string | null): string | null {
  if (!method) {
    return null;
  }

  if (method === 'Till') {
    return 'Cash (till)';
  }

  return PAYMENT_METHODS.find((option) => option.value === method)?.label ?? method;
}

/** "JazzCash · Asif" — how and with whom, in words. A sign-in shows its device. */
export function detailsFor(row: TeamActivity): string | null {
  return [methodLabel(row.method), row.detail].filter(Boolean).join(' · ') || null;
}

/**
 * Everything one person did in the chosen days, newest first — sales, returns, udhaar taken back,
 * payments made, purchases, and when they signed in. Admin only.
 */
export function TeamMemberPage() {
  const userId = Number(useParams().userId);
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;

  // For the name and job at the top; the same list the overview already asked for.
  const members = useQuery({ queryKey: ['team', 'members', from ?? '', to ?? ''], queryFn: () => teamApi.members(from, to) });
  const member = members.data?.find((candidate) => candidate.userId === userId);

  const activity = useQuery({
    queryKey: ['team', 'activity', userId, from, to],
    queryFn: () => teamApi.activity(userId, from, to),
  });

  return (
    <section>
      <Link className="link-button" to="/team">
        ← Team
      </Link>

      <header className="page-header">
        <h2>{member ? `${member.fullName} — activity` : 'Activity'}</h2>
        {member && <span className="team-card__job">{member.job ? JOB_LABELS[member.job] : 'Owner'}</span>}
      </header>

      <p className="page-intro">{from || to ? `${from ?? '…'} to ${to ?? '…'}` : 'Today'}</p>

      <QueryState
        isLoading={activity.isPending}
        error={activity.error}
        isEmpty={activity.data?.length === 0}
        emptyMessage="Nothing recorded for these days."
      >
        <ol className="timeline">
          {activity.data?.map((row) => (
            <li key={`${row.kind}-${row.referenceId}`} className={`timeline__item timeline__item--${row.kind}`}>
              <time dateTime={row.entryDateUtc}>{formatTime(row.entryDateUtc)}</time>
              <strong>{KIND_LABELS[row.kind]}</strong>
              {row.kind !== 'SignIn' && row.reference && <span>{row.reference}</span>}
              {row.amount !== null && <span className="numeric">{formatPkr(row.amount)}</span>}
              {detailsFor(row) && <small>{detailsFor(row)}</small>}
            </li>
          ))}
        </ol>
      </QueryState>
    </section>
  );
}
