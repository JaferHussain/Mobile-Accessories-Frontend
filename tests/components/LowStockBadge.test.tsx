import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LowStockBadge } from '@/components/LowStockBadge';

/** T071 — the reorder signal. The boundary is inclusive (FR-004). */
describe('LowStockBadge', () => {
  it('shows nothing when stock is above the threshold', () => {
    const { container } = render(<LowStockBadge quantityOnHand={11} minStockThreshold={10} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows at the threshold, because hitting it is the signal to reorder', () => {
    render(<LowStockBadge quantityOnHand={10} minStockThreshold={10} />);

    expect(screen.getByText('Low stock')).toBeInTheDocument();
  });

  it('shows below the threshold', () => {
    render(<LowStockBadge quantityOnHand={2} minStockThreshold={10} />);

    expect(screen.getByText('Low stock')).toBeInTheDocument();
  });

  it('distinguishes out of stock from merely low', () => {
    render(<LowStockBadge quantityOnHand={0} minStockThreshold={10} />);

    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.queryByText('Low stock')).not.toBeInTheDocument();
  });

  it('shows nothing for a product with a zero threshold and stock on hand', () => {
    const { container } = render(<LowStockBadge quantityOnHand={5} minStockThreshold={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("prefers the server's verdict when supplied", () => {
    // Staff responses carry isLowStock but no threshold.
    render(<LowStockBadge quantityOnHand={50} isLowStock />);

    expect(screen.getByText('Low stock')).toBeInTheDocument();
  });

  it('shows nothing when the server says stock is fine', () => {
    const { container } = render(
      <LowStockBadge quantityOnHand={1} minStockThreshold={10} isLowStock={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('is announced to assistive technology', () => {
    render(<LowStockBadge quantityOnHand={0} minStockThreshold={5} />);

    expect(screen.getByRole('status')).toHaveAccessibleName('Out of stock');
  });
});
