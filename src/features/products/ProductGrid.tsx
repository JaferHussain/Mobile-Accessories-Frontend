import { LowStockBadge } from '@/components/LowStockBadge';
import { formatPkr } from '@/lib/money';
import { ProductPicture } from './ProductPicture';
import type { Product } from './productApi';

export interface ProductGridProps {
  products: Product[];
  onOpen: (product: Product) => void;
}

/**
 * The Products screen drawn as picture cards.
 *
 * This is a second PRESENTATION of the list, never a second source of it: the rows arrive
 * already searched and filtered by the same query the table uses, so the two can never show
 * different stock.
 *
 * Every card loads the thumbnail. A shelf of look-alike cases is exactly the case this view
 * exists for, and it is also exactly the case where loading full-size photographs would stall
 * the screen.
 */
export function ProductGrid({ products, onOpen }: ProductGridProps) {
  return (
    <ul className="product-grid" data-testid="product-grid">
      {products.map((product) => (
        <li key={product.id}>
          <button
            type="button"
            className="product-card"
            data-testid={`product-card-${product.id}`}
            onClick={() => onOpen(product)}
          >
            <ProductPicture imagePath={product.imagePath} name={product.name} />

            <span className="product-card__name">{product.name}</span>

            <span className="product-card__meta">
              {product.brand ?? 'Unbranded'} · {product.category}
            </span>

            <span className="product-card__price">{formatPkr(product.salePrice)}</span>

            <span className="product-card__stock">
              {product.quantityOnHand}
              <LowStockBadge
                quantityOnHand={product.quantityOnHand}
                minStockThreshold={product.minStockThreshold}
                isLowStock={product.isLowStock}
              />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
