import { formatPkr } from '@/lib/money';
import { JOB_LABELS } from '@/features/team/TeamPage';
import type { TeamMember, WatchItem } from '@/features/team/teamApi';

/** Whose figures the dashboard is showing: the whole shop, one person, or the owner's money. */
export type Lens = 'all' | 'money' | number;

export interface LensChipsProps {
  members: TeamMember[];
  watch: WatchItem[];
  /** Items waiting on Proof missing — the Money chip's count. */
  proofMissing: number;
  selected: Lens;
  onSelect: (lens: Lens) => void;
}

function Chip({
  name,
  note,
  figure,
  flags,
  pressed,
  money,
  onClick,
}: {
  name: string;
  note: string;
  figure: string;
  flags: number;
  pressed: boolean;
  money?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`lens-chip${money ? ' lens-chip--money' : ''}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span className="lens-chip__name">
        {name}
        {flags > 0 && (
          <span className="lens-chip__flags" title={`${flags} to look at`}>
            {flags}
          </span>
        )}
      </span>
      <span className="lens-chip__note">{note}</span>
      <span className="lens-chip__figure">{figure}</span>
    </button>
  );
}

/**
 * One chip per person, plus the whole shop and the owner's money. Each carries a count of the
 * things worth a look, so a problem is visible before anything is opened.
 */
export function LensChips({ members, watch, proofMissing, selected, onSelect }: LensChipsProps) {
  const shopTotal = members.reduce((sum, member) => sum + member.totalSales, 0);

  return (
    <div className="lens-chips" role="group" aria-label="Whose figures">
      <Chip
        name="Everyone"
        note="Whole shop"
        figure={formatPkr(shopTotal)}
        flags={watch.length}
        pressed={selected === 'all'}
        onClick={() => onSelect('all')}
      />

      {members.map((member) => (
        <Chip
          key={member.userId}
          name={member.fullName}
          note={member.job ? (JOB_LABELS[member.job] ?? 'Staff') : 'Owner'}
          figure={formatPkr(member.totalSales)}
          flags={watch.filter((item) => item.userId === member.userId).length}
          pressed={selected === member.userId}
          onClick={() => onSelect(member.userId)}
        />
      ))}

      <Chip
        money
        name="Money"
        note="Owner only · drawer, suppliers, expenses"
        figure="Open"
        flags={proofMissing}
        pressed={selected === 'money'}
        onClick={() => onSelect('money')}
      />
    </div>
  );
}
