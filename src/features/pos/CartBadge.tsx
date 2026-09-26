import { useNavigate } from 'react-router-dom';
import { formatPkr, roundMoney } from '@/lib/money';
import { useCart } from './CartProvider';

/**
 * A sale in progress, and the way back to it.
 *
 * Adding items from the Products list is only half the flow: without something showing that a
 * cart exists, the salesman has no reason to believe the items went anywhere, and no route back
 * to the counter except the menu. Hidden entirely when the cart is empty — a permanent
 * "0 items" on every screen is noise.
 */
export function CartBadge() {
  const { lines } = useCart();
  const navigate = useNavigate();

  if (lines.length === 0) {
    return null;
  }

  // Units, not lines: three of one thing and two of another is five items to the shopkeeper.
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);

  // Indicative only — the counter and then the server decide the real figure. Discounts are
  // deliberately left out: this is "what is in the basket", not a quote.
  const value = roundMoney(
    lines.reduce((sum, line) => sum + line.unitSalePrice * line.quantity, 0),
  );

  return (
    <button
      type="button"
      className="cart-badge"
      data-testid="cart-badge"
      onClick={() => navigate('/pos')}
    >
      Cart · {count} {count === 1 ? 'item' : 'items'} · {formatPkr(value)}
    </button>
  );
}
