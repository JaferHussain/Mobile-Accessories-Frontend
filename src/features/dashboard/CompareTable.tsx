import { formatPkr } from '@/lib/money';
import type { TeamMember, WatchItem } from '@/features/team/teamApi';

/** One row a person, the same columns as every card — so people can be read against each other. */
export function CompareTable({
  members,
  watch,
  onSelect,
}: {
  members: TeamMember[];
  watch: WatchItem[];
  onSelect: (userId: number) => void;
}) {
  if (members.length === 0) {
    return null;
  }

  return (
    <section className="lens-panel">
      <h3>Compare people</h3>

      <div className="table-scroll">
        <table className="data-table" data-testid="compare-people">
          <caption className="visually-hidden">People side by side</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Sales</th>
              <th scope="col">Bills</th>
              <th scope="col">Discounts</th>
              <th scope="col">Returns</th>
              <th scope="col">Cash held</th>
              <th scope="col">To look at</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const flags = watch.filter((item) => item.userId === member.userId).length;

              return (
                <tr key={member.userId}>
                  <td>
                    <button type="button" className="link-button" onClick={() => onSelect(member.userId)}>
                      {member.fullName}
                    </button>
                  </td>
                  <td className="numeric">{formatPkr(member.totalSales)}</td>
                  <td className="numeric">{member.invoiceCount}</td>
                  <td className="numeric">{formatPkr(member.discountGiven)}</td>
                  <td className="numeric">
                    {member.returnCount} · {formatPkr(member.returnValue)}
                  </td>
                  <td className="numeric">{member.job === 'FieldSales' ? formatPkr(member.cashInHand) : '—'}</td>
                  <td className="numeric">{flags > 0 ? flags : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <small className="field__hint">Cash held is money a field salesman carries and has not handed over yet.</small>
    </section>
  );
}
