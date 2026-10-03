/** The stock figures the server sends with every product. The split is absent on older responses. */
export interface StockFigures {
  /** What the shop OWNS — shelf and salesmen's bags together. */
  quantityOnHand: number;
  /** On the shelf: what the counter can sell. */
  atShop?: number;
  /** Carried by field salesmen between them. */
  withSalesmen?: number;
  /** For a field salesman only: what HE carries. Null for everyone else. */
  inYourBag?: number | null;
}

/**
 * How many this person can actually sell: his own bag for a field salesman, the shelf for anyone
 * at the counter. Every number is the server's; this only chooses which.
 */
export function sellableQuantity(product: StockFigures): number {
  if (product.inYourBag !== null && product.inYourBag !== undefined) {
    return product.inYourBag;
  }

  return product.atShop ?? product.quantityOnHand;
}

/**
 * The stock figure each person needs, led by the one they can sell from.
 *
 * <ul>
 *   <li>Salesman: "3 with you" — nothing else, because nothing else is his to sell.</li>
 *   <li>Counter: "6 in shop · +4 with salesman" — the note says why the shelf is short.</li>
 *   <li>Owner's catalogue (<c>owned</c>): "10 owned · 6 in shop · 4 with salesman".</li>
 * </ul>
 */
export function StockCount({ product, owned = false }: { product: StockFigures; owned?: boolean }) {
  const withSalesmen = product.withSalesmen ?? 0;
  const atShop = product.atShop ?? product.quantityOnHand;

  if (product.inYourBag !== null && product.inYourBag !== undefined) {
    return <span data-testid="stock-count">{product.inYourBag} with you</span>;
  }

  if (owned) {
    return (
      <span data-testid="stock-count">
        {product.quantityOnHand} owned
        {withSalesmen > 0 && (
          <small className="stock-count__note">
            {' '}
            · {atShop} in shop · {withSalesmen} with salesman
          </small>
        )}
      </span>
    );
  }

  return (
    <span data-testid="stock-count">
      {atShop} in shop
      {withSalesmen > 0 && <small className="stock-count__note"> · +{withSalesmen} with salesman</small>}
    </span>
  );
}
