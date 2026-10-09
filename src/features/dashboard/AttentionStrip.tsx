import { Link } from 'react-router-dom';
import { formatPkr } from '@/lib/money';
import { WATCH_LABELS, formatTime } from '@/features/team/TeamPage';
import type { WatchItem } from '@/features/team/teamApi';

/**
 * What is worth a look, shown BEFORE the figures: a problem should not wait behind totals.
 * A flag is something to look at, never an accusation — most have an ordinary reason.
 */
export function AttentionStrip({
  items,
  title,
  proofMissing,
}: {
  items: WatchItem[];
  /** Who it is about — "Everyone", or a person's name. */
  title: string;
  /** Shown on the Money lens only: transfers still without their screenshot. */
  proofMissing?: number;
}) {
  const proofCount = proofMissing ?? 0;
  const total = items.length + proofCount;

  if (total === 0) {
    return (
      <div className="attention attention--clear" role="status">
        <strong>Nothing to look at for {title}.</strong>
      </div>
    );
  }

  return (
    <div className="attention" role="status">
      <strong>
        {total} to look at · {title}
      </strong>

      <ul>
        {proofCount > 0 && (
          <li>
            <span>
              <span className="attention__pill attention__pill--bad">Proof missing</span>
              {proofCount} transfer{proofCount === 1 ? '' : 's'} without a screenshot
            </span>
            <Link to="/proofs-missing">Open →</Link>
          </li>
        )}

        {items.map((item) => (
          <li key={`${item.kind}-${item.referenceId}`}>
            <span>
              <span className="attention__pill">{WATCH_LABELS[item.kind]}</span>
              {item.reference ?? '—'} · {item.userName} · {formatTime(item.entryDateUtc)}
            </span>
            <b>{formatPkr(item.amount)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
