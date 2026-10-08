import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PosScreen } from '@/features/pos/PosScreen';
import type { Product } from '@/features/products/productApi';
import type { ProductLookup } from '@/features/pos/posApi';

/**
 * Feature 005, US3 — choosing the right product at the counter.
 *
 * The behaviour being changed here is the most time-critical in the software, so the change is
 * deliberate and narrow:
 *
 *  - A **typed search** now shows up to 8 cards and adds NOTHING until Add is pressed. This
 *    costs one click per sale and buys back the wrong-item mistakes that a shelf of look-alike
 *    cables and cases produces.
 *  - A **scanned barcode** is unchanged: unambiguous, so it still goes straight into the cart.
 *    A scanner that suddenly required a confirming click would slow every sale down for no
 *    safety gained, which is the regression these tests exist to prevent.
 */

const cable: Product = {
  id: 1,
  name: 'Type-C Braided Cable',
  categoryId: 7,
  category: 'Cables',
  brandId: 3,
  brand: 'Baseus',
  model: 'CATZ-01',
  barcode: '8901234567890',
  imagePath: 'content/products/cable.jpg',
  salePrice: 1100,
  quantityOnHand: 12,
  isLowStock: false,
  isActive: true,
};

const similar: Product = {
  ...cable,
  id: 2,
  name: 'Type-C Braided Cable 2m',
  imagePath: null,
  barcode: '8901234567891',
};

function renderPos(overrides: Partial<Parameters<typeof PosScreen>[0]> = {}) {
  const onFindProduct = vi.fn<(term: string, saleType: 'Retail' | 'Wholesale') =>
    Promise<ProductLookup>>();

  const props = {
    onFindProduct,
    onRepriceProduct: vi.fn().mockResolvedValue(1100),
    onSave: vi.fn(),
    onCreateCustomer: vi.fn(),
    onSearchCustomers: vi.fn(async () => []),
    canSellOnCredit: true,
    ...overrides,
  };

  render(<PosScreen {...props} />);

  return props;
}

async function searchFor(term: string) {
  await userEvent.type(screen.getByLabelText(/scan or search/i), term);
  await userEvent.keyboard('{Enter}');
}

function cartRows() {
  return screen.queryAllByTestId(/^cart-line-/);
}

beforeEach(() => vi.clearAllMocks());

describe('POS search results', () => {
  it('tells the counter how many are on the shelf, and how many are out with the salesman', async () => {
    const { onFindProduct } = renderPos();
    vi.mocked(onFindProduct).mockResolvedValue({
      kind: 'matches',
      products: [{ ...cable, quantityOnHand: 12, atShop: 8, withSalesmen: 4, inYourBag: null }],
    });

    await searchFor('type-c');

    const card = await screen.findByTestId('pos-result-1');
    expect(within(card).getByTestId('stock-count')).toHaveTextContent('8 in shop · +4 with salesman');
  });

  it('tells the salesman in the market how many are in his own bag', async () => {
    const { onFindProduct } = renderPos();
    vi.mocked(onFindProduct).mockResolvedValue({
      kind: 'matches',
      products: [{ ...cable, quantityOnHand: 12, atShop: 8, withSalesmen: 4, inYourBag: 3 }],
    });

    await searchFor('type-c');

    const card = await screen.findByTestId('pos-result-1');
    expect(within(card).getByTestId('stock-count')).toHaveTextContent(/^3 with you$/);
  });

  it('shows a card per match, and adds nothing on its own', async () => {
    const { onFindProduct } = renderPos();

    vi.mocked(onFindProduct).mockResolvedValue({ kind: 'matches', products: [cable, similar] });

    await searchFor('type-c');

    const results = await screen.findByTestId('pos-results');

    expect(within(results).getByText('Type-C Braided Cable')).toBeInTheDocument();
    expect(within(results).getByText('Type-C Braided Cable 2m')).toBeInTheDocument();
    expect(cartRows()).toHaveLength(0);
  });

  it('shows the picture, brand, category, price and stock on each card', async () => {
    const { onFindProduct } = renderPos();

    vi.mocked(onFindProduct).mockResolvedValue({ kind: 'matches', products: [cable] });

    await searchFor('type-c');

    const card = within(await screen.findByTestId('pos-results')).getByTestId('pos-result-1');

    expect(within(card).getByText(/Baseus/)).toBeInTheDocument();
    expect(within(card).getByText(/Cables/)).toBeInTheDocument();
    expect(within(card).getByText(/1,100/)).toBeInTheDocument();
    expect(within(card).getByText(/12/)).toBeInTheDocument();
    expect(within(card).getByRole('img').getAttribute('src')).toContain('cable_thumb.jpg');
  });

  it('adds to the cart only when Add is pressed', async () => {
    const { onFindProduct } = renderPos();

    vi.mocked(onFindProduct).mockResolvedValue({ kind: 'matches', products: [cable, similar] });

    await searchFor('type-c');

    const card = within(await screen.findByTestId('pos-results')).getByTestId('pos-result-2');
    await userEvent.click(within(card).getByRole('button', { name: /add/i }));

    await waitFor(() => expect(cartRows()).toHaveLength(1));
    expect(screen.getByText('Type-C Braided Cable 2m')).toBeInTheDocument();
  });

  it('still shows a card when exactly one product matches', async () => {
    const { onFindProduct } = renderPos();

    vi.mocked(onFindProduct).mockResolvedValue({ kind: 'matches', products: [cable] });

    await searchFor('braided');

    // The whole point: a single result is no longer auto-added, because "only one match" is
    // not the same as "the one the customer is holding".
    expect(await screen.findByTestId('pos-result-1')).toBeInTheDocument();
    expect(cartRows()).toHaveLength(0);
  });

  it('says so when nothing matches', async () => {
    const { onFindProduct } = renderPos();

    vi.mocked(onFindProduct).mockResolvedValue({ kind: 'matches', products: [] });

    await searchFor('nonsense');

    expect(await screen.findByText(/no product found/i)).toBeInTheDocument();
  });

  it('clears the results once something is added', async () => {
    const { onFindProduct } = renderPos();

    vi.mocked(onFindProduct).mockResolvedValue({ kind: 'matches', products: [cable] });

    await searchFor('type-c');

    const card = await screen.findByTestId('pos-result-1');
    await userEvent.click(within(card).getByRole('button', { name: /add/i }));

    // The next customer's search starts clean, and the cards do not sit there inviting a
    // second accidental press.
    await waitFor(() => expect(screen.queryByTestId('pos-results')).not.toBeInTheDocument());
  });
});

describe('POS barcode scan', () => {
  it('adds the scanned product straight to the cart, with no cards', async () => {
    const { onFindProduct } = renderPos();

    vi.mocked(onFindProduct).mockResolvedValue({ kind: 'barcode', product: cable });

    await searchFor('8901234567890');

    // Unchanged from before this feature: a scan is unambiguous, so a confirming click would
    // cost every sale time and prevent nothing.
    await waitFor(() => expect(cartRows()).toHaveLength(1));
    expect(screen.queryByTestId('pos-results')).not.toBeInTheDocument();
  });
});

describe('POS sale type', () => {
  it('is chosen once for the sale, not per product', async () => {
    const { onFindProduct } = renderPos();

    vi.mocked(onFindProduct).mockResolvedValue({ kind: 'matches', products: [cable, similar] });
    await searchFor('type-c');
    await screen.findByTestId('pos-results');

    // One control for the whole sale — not a choice repeated on every result card.
    expect(screen.getAllByRole('radio', { name: /retail/i })).toHaveLength(1);
    expect(screen.getAllByRole('radio', { name: /wholesale/i })).toHaveLength(1);
  });

  it('re-prices what is already in the cart when it changes', async () => {
    const onRepriceProduct = vi.fn().mockResolvedValue(900);
    const { onFindProduct } = renderPos({ onRepriceProduct });

    vi.mocked(onFindProduct).mockResolvedValue({ kind: 'barcode', product: cable });
    await searchFor('8901234567890');
    await waitFor(() => expect(cartRows()).toHaveLength(1));

    await userEvent.click(screen.getByRole('radio', { name: /wholesale/i }));

    // Existing behaviour, guarded because the refactor above touches this same component.
    await waitFor(() => expect(onRepriceProduct).toHaveBeenCalledWith(cable.id, 'Wholesale'));
  });
});
