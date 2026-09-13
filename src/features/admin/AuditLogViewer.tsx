export interface AuditEntry {
  id: number;
  entityType: string;
  entityId: number;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  action: string;
  userName: string;
  occurredAtUtc: string;
}

export interface AuditLogViewerProps {
  entries: AuditEntry[];
  entityTypeFilter: string;
  onEntityTypeFilterChange: (entityType: string) => void;
}

const ENTITY_TYPES = ['', 'Product', 'Customer', 'Supplier'];

/** Field names as the owner would say them, rather than as the database spells them. */
const FIELD_LABELS: Record<string, string> = {
  quantity_on_hand: 'Stock',
  cost_price: 'Cost price',
  sale_price: 'Sale price',
  outstanding_balance: 'Customer balance',
  payable_balance: 'Supplier balance',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  });
}

/**
 * The audit trail (FR-041).
 *
 * Every stock and balance change, with who made it, what it was before, and what it became.
 * This is the record that answers "where did those five cables go?" months later.
 */
export function AuditLogViewer({
  entries,
  entityTypeFilter,
  onEntityTypeFilterChange,
}: AuditLogViewerProps) {
  return (
    <section className="audit">
      <header className="audit__header">
        <h2>Audit trail</h2>

        <div className="field">
          <label htmlFor="auditEntityType">Show</label>
          <select
            id="auditEntityType"
            value={entityTypeFilter}
            onChange={(event) => onEntityTypeFilterChange(event.target.value)}
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type || 'all'} value={type}>
                {type === '' ? 'Everything' : type}
              </option>
            ))}
          </select>
        </div>
      </header>

      {entries.length === 0 ? (
        <p className="audit__empty">No changes recorded for this filter.</p>
      ) : (
        <table className="audit__table">
          <caption className="visually-hidden">Recorded changes</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Who</th>
              <th scope="col">What</th>
              <th scope="col">Changed</th>
              <th scope="col">From</th>
              <th scope="col">To</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDateTime(entry.occurredAtUtc)}</td>
                <td>{entry.userName}</td>
                <td>
                  {entry.action} · {entry.entityType} #{entry.entityId}
                </td>
                <td>{FIELD_LABELS[entry.fieldName] ?? entry.fieldName}</td>
                <td data-testid={`old-${entry.id}`}>{entry.oldValue ?? '—'}</td>
                <td data-testid={`new-${entry.id}`}>{entry.newValue ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
