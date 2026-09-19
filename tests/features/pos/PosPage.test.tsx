import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PosPage } from '@/features/pos/PosPage';
import { productApi } from '@/features/products/productApi';
import { AuthProvider } from '@/features/auth/AuthContext';
import { tokenStore } from '@/api/tokenStore';
import { ApiError, type AuthUser } from '@/types/api';

/**
 * T014 — the counter's lookup and the server's one-letter rule (research R3, R6).
 *
 * The server now refuses a search made only of one-letter words. At the POS that is not an error
 * the salesman needs to read: a barcode scanner or a stray key press produced something that is not
 * a product, and the honest answer is "No product found".
 */

vi.mock('@/features/products/productApi', () => ({
  productApi: {
    byBarcode: vi.fn(),
    search: vi.fn(),
    get: vi.fn(),
  },
}));

const salesman: AuthUser = { id: 2, username: 'salesman', fullName: 'Bilal', role: 'Staff' };

const notFound = () => new ApiError('NOT_FOUND', 'No product found.', 404);

function renderPos() {
  return render(
    <AuthProvider initialUser={salesman}>
      <PosPage />
    </AuthProvider>,
  );
}

async function lookUp(term: string) {
  const user = userEvent.setup();
  renderPos();

  await user.type(screen.getByLabelText(/scan or search/i), `${term}{Enter}`);
}

describe('PosPage lookup', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(productApi.byBarcode).mockRejectedValue(notFound());
  });

  it('treats a one-letter search the server refuses as no product found', async () => {
    vi.mocked(productApi.search).mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 'Type at least 2 letters to search.', 400),
    );

    await lookUp('c');

    expect(await screen.findByText(/no product found/i)).toBeInTheDocument();
    // Not the server's validation wording — that is a message for the Products screen, not a
    // scanner that produced one character.
    expect(screen.queryByText(/at least 2 letters/i)).not.toBeInTheDocument();
  });

  it('still reports a genuine server failure as an error', async () => {
    // Only the "too short" refusal is swallowed. Anything else the salesman should see.
    vi.mocked(productApi.search).mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500),
    );

    await lookUp('cable');

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('adds the product when the improved search finds one', async () => {
    vi.mocked(productApi.search).mockResolvedValue({
      items: [
        {
          id: 1,
          name: 'Type-C Braided Cable',
          categoryId: 1,
          category: 'Cables',
          salePrice: 1100,
          quantityOnHand: 10,
          isLowStock: false,
          isActive: true,
        },
      ],
      page: 1,
      pageSize: 1,
      totalItems: 1,
      totalPages: 1,
    });

    await lookUp('c type');

    expect(await screen.findByText('Type-C Braided Cable')).toBeInTheDocument();
    expect(productApi.search).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'c type', pageSize: 1 }),
    );
  });
});
