import { useEffect, useState } from 'react';

/**
 * The one place a product picture is turned into an <img>, on every screen that shows one.
 *
 * Two rules live here and nowhere else:
 *
 *  1. **The thumbnail's address is derived, not stored.** The server applies the identical rule
 *     (`ProductImagePaths.ThumbnailFor`): insert `_thumb` before the extension. Because neither
 *     side stores the result, the two can never drift apart.
 *  2. **A list never loads a full-size photograph.** Lists and search results pass the default
 *     size; only a product's own detail view asks for `full`. Getting this wrong is invisible
 *     on a developer's machine and ruinous over the shop's connection.
 */

/** Images are static files at the API's origin, but they do not live under `/api`. */
function staticOrigin(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

  return base.replace(/\/api\/?$/, '');
}

/**
 * The thumbnail path for a stored image path, or `null` when the product has no picture.
 * Mirrors `MoizPos.Application.Calculations.ProductImagePaths.ThumbnailFor`.
 */
export function thumbnailPathFor(imagePath: string | null | undefined): string | null {
  if (!imagePath || !imagePath.trim()) {
    return null;
  }

  const trimmed = imagePath.trim();
  const lastDot = trimmed.lastIndexOf('.');

  // The LAST dot, so "a.b.c.webp" keeps "a.b.c" instead of losing everything after the first.
  if (lastDot <= 0) {
    return `${trimmed}_thumb`;
  }

  return `${trimmed.slice(0, lastDot)}_thumb${trimmed.slice(lastDot)}`;
}

export interface ProductPictureProps {
  imagePath: string | null | undefined;
  /** Used as the alt text — a salesman using a screen reader still needs to know what this is. */
  name: string;
  /** `thumb` (the default) for any list; `full` only when the picture is the subject. */
  size?: 'thumb' | 'full';
  className?: string;
}

export function ProductPicture({ imagePath, name, size = 'thumb', className }: ProductPictureProps) {
  const path = size === 'full' ? (imagePath?.trim() || null) : thumbnailPathFor(imagePath);

  // A picture whose file went missing must degrade to the placeholder, not leave a broken-image
  // icon sitting on the counter screen.
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [path]);

  if (!path || failed) {
    return (
      <span
        className={`product-picture product-picture--empty ${className ?? ''}`.trim()}
        data-testid="product-picture-placeholder"
      >
        {/* Only the detail view has room to say so in words; a card's placeholder is the icon
            alone, which is why this is conditional rather than always rendered. */}
        {size === 'full' && <span className="product-picture__caption">No picture yet</span>}
      </span>
    );
  }

  return (
    <img
      className={`product-picture ${className ?? ''}`.trim()}
      src={`${staticOrigin()}/${path}`}
      alt={name}
      // Hundreds of cards can be on the page; fetching every picture up front would stall the
      // screen the shopkeeper is waiting on.
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
