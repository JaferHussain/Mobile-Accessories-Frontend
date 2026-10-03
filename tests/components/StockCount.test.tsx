import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StockCount, sellableQuantity } from '@/components/StockCount';

/**
 * Each person reads the number they can actually sell from. Every figure is the server's — this
 * only chooses which one to lead with, and words it.
 */

const withSalesman = { quantityOnHand: 10, atShop: 6, withSalesmen: 4, inYourBag: null };

describe('StockCount', () => {
  it('shows the counter what is on the shelf, and why it is short', () => {
    render(<StockCount product={withSalesman} />);

    expect(screen.getByTestId('stock-count')).toHaveTextContent('6 in shop');
    expect(screen.getByTestId('stock-count')).toHaveTextContent('+4 with salesman');
  });

  it('says nothing about salesmen when none carry it', () => {
    render(<StockCount product={{ quantityOnHand: 10, atShop: 10, withSalesmen: 0, inYourBag: null }} />);

    expect(screen.getByTestId('stock-count')).toHaveTextContent(/^10 in shop$/);
  });

  it('shows the salesman only his own bag', () => {
    render(<StockCount product={{ ...withSalesman, inYourBag: 3 }} />);

    expect(screen.getByTestId('stock-count')).toHaveTextContent(/^3 with you$/);
  });

  it('shows the owner what the shop owns, with where it is', () => {
    render(<StockCount product={withSalesman} owned />);

    expect(screen.getByTestId('stock-count')).toHaveTextContent('10 owned');
    expect(screen.getByTestId('stock-count')).toHaveTextContent('6 in shop · 4 with salesman');
  });

  it('reads the owned figure when an older response carries no split', () => {
    render(<StockCount product={{ quantityOnHand: 7 }} />);

    expect(screen.getByTestId('stock-count')).toHaveTextContent(/^7 in shop$/);
  });
});

describe('sellableQuantity', () => {
  it('is his bag for the salesman, and the shelf for everyone else', () => {
    expect(sellableQuantity({ ...withSalesman, inYourBag: 3 })).toBe(3);
    expect(sellableQuantity(withSalesman)).toBe(6);
    expect(sellableQuantity({ quantityOnHand: 7 })).toBe(7);
  });
});
