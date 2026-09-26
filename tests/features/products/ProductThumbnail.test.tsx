import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ProductPicture,
  thumbnailPathFor,
} from '@/features/products/ProductPicture';

/**
 * Feature 005 — the one component every screen shows a product picture through.
 *
 * The thumbnail's address is DERIVED from the full image's, by the same rule the server
 * applies (`ProductImagePaths.ThumbnailFor`). Keeping that rule in one place on each side is
 * what stops a list quietly downloading full-size photographs.
 */

describe('thumbnailPathFor', () => {
  it('inserts _thumb before the extension', () => {
    expect(thumbnailPathFor('content/products/abc.jpg')).toBe('content/products/abc_thumb.jpg');
    expect(thumbnailPathFor('content/products/abc.png')).toBe('content/products/abc_thumb.png');
  });

  it('keeps every dot but the last — a filename may contain them', () => {
    expect(thumbnailPathFor('content/products/a.b.c.webp')).toBe(
      'content/products/a.b.c_thumb.webp',
    );
  });

  it('has nothing to derive when there is no picture', () => {
    // "Never had a picture" and "has one" are different facts; only the first is a placeholder.
    expect(thumbnailPathFor(null)).toBeNull();
    expect(thumbnailPathFor(undefined)).toBeNull();
    expect(thumbnailPathFor('   ')).toBeNull();
  });
});

describe('ProductPicture', () => {
  it('shows a placeholder, not a broken image, when the product has no picture', () => {
    render(<ProductPicture imagePath={null} name="Type-C Cable" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-picture-placeholder')).toBeInTheDocument();
  });

  it('requests the thumbnail, never the full image, in list mode', () => {
    render(<ProductPicture imagePath="content/products/abc.jpg" name="Type-C Cable" />);

    const image = screen.getByRole('img');

    expect(image).toHaveAttribute('src', expect.stringContaining('abc_thumb.jpg'));
    expect(image.getAttribute('src')).not.toContain('abc.jpg?');
  });

  it('requests the full image only when asked for the full size', () => {
    render(<ProductPicture imagePath="content/products/abc.jpg" name="Cable" size="full" />);

    const image = screen.getByRole('img');

    expect(image.getAttribute('src')).toContain('abc.jpg');
    expect(image.getAttribute('src')).not.toContain('_thumb');
  });

  it('lazy-loads thumbnails so a long list does not fetch every picture at once', () => {
    render(<ProductPicture imagePath="content/products/abc.jpg" name="Cable" />);

    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy');
  });

  it('names the product for anyone who cannot see the picture', () => {
    render(<ProductPicture imagePath="content/products/abc.jpg" name="Type-C Cable" />);

    expect(screen.getByRole('img')).toHaveAccessibleName('Type-C Cable');
  });

  it('falls back to the placeholder if the file is missing on disk', () => {
    render(<ProductPicture imagePath="content/products/gone.jpg" name="Cable" />);

    // A picture whose file was lost must not leave a broken-image icon on the counter screen.
    fireEvent.error(screen.getByRole('img'));

    expect(screen.getByTestId('product-picture-placeholder')).toBeInTheDocument();
  });
});
