import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductForm, type ProductFormProps } from '@/features/products/ProductForm';
import type { Product } from '@/features/products/productApi';
import { brandApi, categoryApi } from '@/features/taxonomy/taxonomyApi';
import { ApiError } from '@/types/api';

// Category and brand are chosen from the taxonomy modules now, so the form fetches both lists.
vi.mock('@/features/taxonomy/taxonomyApi', () => ({
  categoryApi: { search: vi.fn() },
  brandApi: { search: vi.fn() },
}));

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 200,
  totalItems: items.length,
  totalPages: 1,
});

/** Renders inside a query client, and waits for the dropdowns to be populated. */
async function renderForm(props: ProductFormProps) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const result = render(
    <QueryClientProvider client={client}>
      <ProductForm {...props} />
    </QueryClientProvider>,
  );

  await screen.findByRole('option', { name: 'Cables' });

  return result;
}

/** T069 — product form validation and submission. */

const existing: Product = {
  id: 7,
  name: 'Type-C Braided 2m',
  categoryId: 1,
  category: 'Cables',
  brand: 'Baseus',
  model: 'CATZ-01',
  barcode: '8901234567890',
  salePrice: 1100,
  quantityOnHand: 10,
  isLowStock: false,
  isActive: true,
  costPrice: 800,
  wholesalePrice: 950,
  retailPrice: 1200,
  minStockThreshold: 3,
};

describe('ProductForm', () => {
  beforeEach(() => {
    vi.mocked(categoryApi.search).mockResolvedValue(
      page([
        { id: 1, name: 'Cables', description: null, isActive: true, productCount: 3 },
        { id: 2, name: 'Chargers', description: null, isActive: true, productCount: 1 },
      ]),
    );

    vi.mocked(brandApi.search).mockResolvedValue(
      page([{ id: 5, name: 'Baseus', description: null, isActive: true, productCount: 2 }]),
    );
  });

  it('requires a name', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.click(screen.getByRole('button', { name: /save product/i }));

    expect(await screen.findByText('Product name is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires a category', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Cable');
    await user.click(screen.getByRole('button', { name: /save product/i }));

    expect(await screen.findByText('Category is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a negative sale price', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Cable');
    await user.selectOptions(screen.getByLabelText('Category'), '1');

    // type="number" min="0" stops a negative being typed, so this guard exists for values that
    // arrive another way — a paste, or a browser that permits it. fireEvent reproduces that.
    fireEvent.change(screen.getByLabelText('Sale price'), { target: { value: '-5' } });

    await user.click(screen.getByRole('button', { name: /save product/i }));

    expect(await screen.findByText('Sale price cannot be negative.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a trimmed product', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), '  Type-C Cable  ');
    await user.selectOptions(screen.getByLabelText('Category'), '1');

    const salePrice = screen.getByLabelText('Sale price');
    await user.clear(salePrice);
    await user.type(salePrice, '1100');

    await user.click(screen.getByRole('button', { name: /save product/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Type-C Cable',
          categoryId: 1,
          salePrice: 1100,
        }),
      ),
    );
  });

  it('sends null rather than empty strings for optional fields', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Cable');
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.click(screen.getByRole('button', { name: /save product/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: null, model: null, barcode: null }),
      ),
    );
  });

  it('prefills when editing', async () => {
    await renderForm({ initial: existing, onSubmit: vi.fn() });

    expect(screen.getByLabelText('Name')).toHaveValue('Type-C Braided 2m');
    expect(screen.getByLabelText('Sale price')).toHaveValue(1100);
  });

  it('locks cost and quantity when editing, because they move elsewhere', async () => {
    await renderForm({ initial: existing, onSubmit: vi.fn() });

    // Stock moves through purchases, sales, returns and audited adjustments; cost moves through
    // a purchase (FR-011a). The API ignores both on update, so the form must not invite an edit.
    expect(screen.getByLabelText('Cost price')).toBeDisabled();
    expect(screen.getByLabelText('Quantity in stock')).toBeDisabled();
    expect(screen.getByText(/only when you record a purchase/i)).toBeInTheDocument();
    expect(screen.getByText(/use a stock adjustment/i)).toBeInTheDocument();
  });

  it('leaves cost and quantity editable when creating', async () => {
    await renderForm({ onSubmit: vi.fn() });

    expect(screen.getByLabelText('Cost price')).toBeEnabled();
    expect(screen.getByLabelText('Quantity in stock')).toBeEnabled();
  });

  it('shows the server message when saving fails', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError('BUSINESS_RULE_VIOLATION', "Barcode '123' is already used.", 422));

    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Cable');
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.click(screen.getByRole('button', { name: /save product/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already used/i);
  });

  it('maps server field errors onto the right inputs', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 'One or more fields are invalid.', 400, [
        { field: 'SalePrice', message: 'Sale price cannot be negative.' },
      ]),
    );

    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Cable');
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.click(screen.getByRole('button', { name: /save product/i }));

    expect(await screen.findByText('Sale price cannot be negative.')).toBeInTheDocument();
  });

  it('disables the button while saving', async () => {
    let resolve: () => void = () => {};
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((r) => (resolve = r)));

    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Cable');
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.click(screen.getByRole('button', { name: /save product/i }));

    expect(await screen.findByRole('button', { name: /saving/i })).toBeDisabled();

    resolve();
  });
});
