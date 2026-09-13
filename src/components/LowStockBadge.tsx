export interface LowStockBadgeProps {
  quantityOnHand: number;
  /** Absent for Staff, who are not shown thresholds — pass isLowStock instead. */
  minStockThreshold?: number;
  /** The server's own verdict. Preferred when present. */
  isLowStock?: boolean;
}

/**
 * Marks a product that needs reordering.
 *
 * The boundary is inclusive: hitting the threshold is the signal to reorder, not passing it
 * (FR-004). The server already computes this, so its answer wins when supplied; the local
 * calculation is a fallback for lists that carry only raw numbers.
 */
export function LowStockBadge({ quantityOnHand, minStockThreshold, isLowStock }: LowStockBadgeProps) {
  const low =
    isLowStock ??
    (minStockThreshold !== undefined && quantityOnHand <= minStockThreshold);

  if (!low) {
    return null;
  }

  const outOfStock = quantityOnHand === 0;

  return (
    <span
      className={`badge ${outOfStock ? 'badge--out' : 'badge--low'}`}
      role="status"
      aria-label={outOfStock ? 'Out of stock' : 'Low stock'}
    >
      {outOfStock ? 'Out of stock' : 'Low stock'}
    </span>
  );
}
