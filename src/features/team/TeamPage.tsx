import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { teamApi, type TeamMember, type WatchKind } from './teamApi';

export const JOB_LABELS: Record<string, string> = {
  Counter: 'Counter (shopkeeper)',
  FieldSales: 'Field sales (salesman)',
};

export const WATCH_LABELS: Record<WatchKind, string> = {
  BigDiscount: 'Big discount',
  TransferWithoutProof: 'Transfer without proof',
  SameDayReturn: 'Same-day return',
  TransferRefund: 'Refund by transfer',
};

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  });
}

function MemberCard({ member, period }: { member: TeamMember; period: string }) {
  return (
    <article className="team-card">
      <header>
        <h3>{member.fullName}</h3>
        <span className="team-card__job">{member.job ? JOB_LABELS[member.job] : 'Owner'}</span>
      </header>

      <dl>
        <dt>Sales</dt>
        <dd data-testid="total-sales">{formatPkr(member.totalSales)}</dd>

        <dt>Bills</dt>
        <dd data-testid="bills">{member.invoiceCount}</dd>

        <dt>Received at sale</dt>
        <dd>{formatPkr(member.receivedAtSale)}</dd>

        <dt>Udhaar given</dt>
        <dd>{formatPkr(member.creditGiven)}</dd>

        <dt>Discounts</dt>
        <dd data-testid="discount">{formatPkr(member.discountGiven)}</dd>

        <dt>Returns</dt>
        <dd>
          {member.returnCount} · {formatPkr(member.returnValue)}
        </dd>

        <dt>Udhaar collected</dt>
        <dd data-testid="udhaar-collected">{formatPkr(member.udhaarCollected)}</dd>

        {/* Market cash is not in the drawer until he hands it over. */}
        {member.job === 'FieldSales' && (
          <>
            <dt>Cash with him</dt>
            <dd data-testid="cash-in-hand">{formatPkr(member.cashInHand)}</dd>

            <dt>Stock with him</dt>
            <dd data-testid="stock-units">{member.stockUnits} units</dd>
          </>
        )}
      </dl>

      <footer>
        <small>{member.lastLoginUtc ? `Last signed in ${formatTime(member.lastLoginUtc)}` : 'Not signed in yet'}</small>
        <span className="team-card__links">
          {/* Only a field salesman earns commission. */}
          {member.job === 'FieldSales' && <Link to={`/salesman-stock/${member.userId}`}>Stock →</Link>}
          {member.job === 'FieldSales' && <Link to={`/salesman-cash/${member.userId}`}>Cash →</Link>}
          {member.job === 'FieldSales' && <Link to={`/commissions/${member.userId}`}>Commission →</Link>}
          <Link to={`/team/${member.userId}${period}`}>Activity →</Link>
        </span>
      </footer>
    </article>
  );
}

/**
 * The owner's view of the team: a card per person for the chosen days, and the watch list.
 *
 * <p>Built entirely from what the shop already records — every sale, return and payment names who
 * made it. The watch list is things worth a look, not accusations: most have an ordinary reason.
 * Admin only; staff never see one another's figures.</p>
 */
export function TeamPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const range = [from || undefined, to || undefined] as const;
  const period = from || to ? `?from=${from}&to=${to}` : '';

  const members = useQuery({
    queryKey: ['team', 'members', from, to],
    queryFn: () => teamApi.members(...range),
  });

  const watch = useQuery({
    queryKey: ['team', 'watch', from, to],
    queryFn: () => teamApi.watchList(...range),
  });

  return (
    <section>
      <header className="page-header">
        <h2>Team</h2>
      </header>

      <div className="filters">
        <div className="field">
          <label htmlFor="teamFrom">From</label>
          <input id="teamFrom" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="teamTo">To</label>
          <input id="teamTo" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <small className="field__hint">{from || to ? '' : 'Showing today.'}</small>
      </div>

      <QueryState isLoading={members.isPending} error={members.error}>
        <div className="team-grid">
          {members.data?.map((member) => (
            <MemberCard key={member.userId} member={member} period={period} />
          ))}
        </div>
      </QueryState>

      <h3>Worth a look</h3>

      <QueryState
        isLoading={watch.isPending}
        error={watch.error}
        isEmpty={watch.data?.length === 0}
        emptyMessage="Nothing to look at for these days."
      >
        <table className="data-table">
          <caption className="visually-hidden">Watch list</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Who</th>
              <th scope="col">What</th>
              <th scope="col">Reference</th>
              <th scope="col">Amount</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {watch.data?.map((item) => (
              <tr key={`${item.kind}-${item.referenceId}`}>
                <td>{formatTime(item.entryDateUtc)}</td>
                <td>{item.userName}</td>
                <td>{WATCH_LABELS[item.kind]}</td>
                <td>{item.reference ?? '—'}</td>
                <td className="numeric">{formatPkr(item.amount)}</td>
                <td>{item.detail ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
    </section>
  );
}
