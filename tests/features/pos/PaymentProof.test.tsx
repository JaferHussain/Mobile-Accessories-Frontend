import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PosScreen, type PosScreenProps } from '@/features/pos/PosScreen';
import type { Product } from '@/features/products/productApi';

/**
 * Feature 008 — attaching the screenshot behind a non-cash payment.
 *
 * Offered only once the sale is saved, because the upload is addressed to an invoice id that
 * does not exist until then — and never offered on a Cash sale, where the money was taken at
 * the counter and a "proof" would be evidence of nothing.
 */

const cable: Product = {
  id: 1,
  name: 'Type-C Braided Cable',
  categoryId: 7,
  category: 'Cables',
  brandId: null,
  brand: null,
  model: null,
  barcode: '8901234567890',
  imagePath: null,
  salePrice: 1000,
  quantityOnHand: 10,
  isLowStock: false,
  isActive: true,
};

const savedInvoice = {
  invoiceId: 77,
  invoiceNumber: 'INV-0077',
  total: 1000,
  amountPaid: 1000,
  amountRemaining: 0,
  customerId: null,
  customerBalance: null,
};

function renderPos(overrides: Partial<PosScreenProps> = {}) {
  const props: PosScreenProps = {
    onFindProduct: vi.fn().mockResolvedValue({ kind: 'barcode', product: cable }),
    onRepriceProduct: vi.fn().mockResolvedValue(1000),
    onSave: vi.fn().mockResolvedValue(savedInvoice),
    onCreateCustomer: vi.fn(),
    onSearchCustomers: vi.fn(async () => []),
    onUploadPaymentProof: vi.fn().mockResolvedValue(undefined),
    canSellOnCredit: true,
    ...overrides,
  };

  render(<PosScreen {...props} />);

  return props;
}

/** Sells one item, settling with the given method, and returns once the receipt is shown. */
async function sellWith(method: string) {
  await userEvent.type(screen.getByLabelText(/scan or search/i), '8901234567890');
  await userEvent.keyboard('{Enter}');
  await screen.findByTestId('cart-line-1');

  // Selling is two steps now, and the payment method is chosen in the checkout modal —
  // which is also where the sale learns whether there is anything to evidence.
  await userEvent.click(screen.getByRole('button', { name: /proceed to sale/i }));
  await userEvent.click(await screen.findByRole('radio', { name: method }));
  await userEvent.click(screen.getByRole('button', { name: /complete sale/i }));

  await screen.findByText(/INV-0077/);
}

const jpeg = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], 'transfer.jpg', { type: 'image/jpeg' });

beforeEach(() => vi.clearAllMocks());

describe('payment proof after a sale', () => {
  it('is offered for a bank transfer', async () => {
    renderPos();
    await sellWith('Bank transfer');

    expect(screen.getByLabelText(/payment proof/i)).toBeInTheDocument();
  });

  it('is never offered for a cash sale', async () => {
    renderPos();
    await sellWith('Cash');

    // Nothing to prove, and an unused control on the busiest screen is noise.
    expect(screen.queryByLabelText(/payment proof/i)).not.toBeInTheDocument();
  });

  it('sends the chosen picture against the invoice just saved', async () => {
    const { onUploadPaymentProof } = renderPos();
    await sellWith('Bank transfer');

    const file = jpeg();
    fireEvent.change(screen.getByLabelText(/payment proof/i), { target: { files: [file] } });

    await waitFor(() =>
      expect(onUploadPaymentProof).toHaveBeenCalledWith(savedInvoice.invoiceId, file),
    );
  });

  it('confirms once the proof is attached', async () => {
    renderPos();
    await sellWith('Bank transfer');

    fireEvent.change(screen.getByLabelText(/payment proof/i), { target: { files: [jpeg()] } });

    expect(await screen.findByText(/proof attached/i)).toBeInTheDocument();
  });

  it('says so when the upload fails, without pretending the sale went wrong', async () => {
    const onUploadPaymentProof = vi.fn().mockRejectedValue(new Error('network'));
    renderPos({ onUploadPaymentProof });
    await sellWith('Bank transfer');

    fireEvent.change(screen.getByLabelText(/payment proof/i), { target: { files: [jpeg()] } });

    // The sale is already recorded and must still read as saved — only the picture failed.
    expect(await screen.findByText(/could not attach/i)).toBeInTheDocument();
    expect(screen.getByText(/INV-0077/)).toBeInTheDocument();
  });
});
