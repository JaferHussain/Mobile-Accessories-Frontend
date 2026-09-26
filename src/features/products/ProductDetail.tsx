import { LowStockBadge } from '@/components/LowStockBadge';
import { formatPkr } from '@/lib/money';
import { ProductPicture } from './ProductPicture';
import type { Product } from './productApi';

export interface ProductDetailProps {
  product: Product;
  onClose: () => void;
  /** Offered to anyone — Staff can sell just as well as the owner can. */
  onSell: () => void;
  /** Present only for an Admin — matches the actions already offered from the table. */
  onEdit?: () => void;
  onRetire?: () => void;
}

/**
 * One product, with its picture at full size.
 *
 * The only screen that loads the full image — everywhere else shows the thumbnail. Cost and
 * the Retail Price are shown when present, and only an Admin is sent them at all (FR-040), so
 * this renders what it was given rather than deciding for itself who may see what.
 *
 * Shows the STICKER price (`retailPrice`), not the counter's `salePrice` — a discounted sale
 * this week must not be mistaken here for what the item is normally priced at. A Staff
 * response carries no `retailPrice`, so it falls back to `salePrice`, the one price a
 * salesman is ever shown.
 */
export function ProductDetail({ product, onClose, onSell, onEdit, onRetire }: ProductDetailProps) {
  const retailPrice = product.retailPrice ?? product.salePrice;

  return (
    <div className="product-detail" data-testid="product-detail">
      <header className="product-detail__header">
        <h3>{product.name}</h3>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      <ProductPicture
        imagePath={product.imagePath}
        name={product.name}
        size="full"
        className="product-detail__picture"
      />

      <dl className="product-detail__facts">
        <div>
          <dt>Brand</dt>
          <dd>{product.brand ?? 'Unbranded'}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{product.category}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{product.model || '—'}</dd>
        </div>
        <div>
          <dt>Barcode</dt>
          <dd>{product.barcode || '—'}</dd>
        </div>
        <div>
          <dt>Retail Price</dt>
          <dd>{formatPkr(retailPrice)}</dd>
        </div>
        <div>
          <dt>Stock</dt>
          <dd>
            {product.quantityOnHand}
            <LowStockBadge
              quantityOnHand={product.quantityOnHand}
              minStockThreshold={product.minStockThreshold}
              isLowStock={product.isLowStock}
            />
          </dd>
        </div>
      </dl>

      {/* This view is for finding and identifying a product, not costing it — cost/margin
          belong on the reports and purchase screens, so it is left out here entirely rather
          than shown conditionally. */}

      <div className="product-detail__actions">
        <button type="button" className="product-detail__sell" onClick={onSell}>
          Sell
        </button>
        {onEdit && (
          <button type="button" onClick={onEdit}>
            Edit
          </button>
        )}
        {onRetire && (
          <button type="button" onClick={onRetire}>
            Retire
          </button>
        )}
      </div>
    </div>
  );
}
