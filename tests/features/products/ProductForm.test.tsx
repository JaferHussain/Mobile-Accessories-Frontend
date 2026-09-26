import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductForm, type ProductFormProps } from '@/features/products/ProductForm';
import type { Product } from '@/features/products/productApi';
import { brandApi, categoryApi } from '@/features/taxonomy/taxonomyApi';
import { ApiError } from '@/types/api';

// Category and brand are chosen from the taxonomy modules, so the form fetches both lists.
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
  brandId: 5,
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

  it('carries no price or quantity field at all', async () => {
    await renderForm({ onSubmit: vi.fn() });

    // Replaces the old price-validation tests. A product is a catalogue entry now: cost, both
    // selling prices and the quantity are set by its first purchase, on the Purchases screen.
    expect(screen.queryByLabelText('Sale price')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cost price')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Wholesale price')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Retail price')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quantity in stock')).not.toBeInTheDocument();
  });

  it('says where the prices are set instead', async () => {
    await renderForm({ onSubmit: vi.fn() });

    // An absent field with no explanation reads as a broken form, so the form names the screen
    // that does set them.
    expect(await screen.findByText(/record a purchase/i)).toBeInTheDocument();
  });

  it('submits a trimmed product', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), '  Type-C Cable  ');
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.selectOptions(screen.getByLabelText('Brand'), '5');

    await user.click(screen.getByRole('button', { name: /save product/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Type-C Cable',
          categoryId: 1,
        }),
        // Feature 005: the picture travels as a second argument, null when none was chosen.
        null,
      ),
    );
  });

  it('sends null rather than empty strings for optional fields', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Cable');
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.selectOptions(screen.getByLabelText('Brand'), '5');
    await user.click(screen.getByRole('button', { name: /save product/i }));

    // Brand is NOT in this list — it is required, so "blank" is not a state it has.
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: 5, model: null, barcode: null }),
        null,
      ),
    );
  });

  it('requires a brand, and says where generic stock goes', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Cable');
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.click(screen.getByRole('button', { name: /save product/i }));

    // "A brand is required" alone would strand the shopkeeper on an item that genuinely has no
    // maker printed on it, so the message names the way out.
    expect(await screen.findByText(/Brand is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('offers every category, not a subset', async () => {
    await renderForm({ onSubmit: vi.fn() });

    // A category is no longer tied to the chosen brand — the whole list is always available.
    expect(screen.getByRole('option', { name: 'Cables' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Chargers' })).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).not.toBeDisabled();
  });

  it('prefills when editing', async () => {
    await renderForm({ initial: existing, onSubmit: vi.fn() });

    expect(screen.getByLabelText('Name')).toHaveValue('Type-C Braided 2m');
    expect(screen.getByLabelText('Reorder at')).toHaveValue(3);
  });

  it('shows no price or stock field when editing either', async () => {
    await renderForm({ initial: existing, onSubmit: vi.fn() });

    // They used to be present-but-disabled. Absent is stronger: a disabled field still invites
    // the question "why can I not change this?", and the answer is that it is not this form's.
    expect(screen.queryByLabelText('Cost price')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quantity in stock')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sale price')).not.toBeInTheDocument();
  });

  it('shows the server message when saving fails', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError('BUSINESS_RULE_VIOLATION', "Barcode '123' is already used.", 422));

    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Cable');
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.selectOptions(screen.getByLabelText('Brand'), '5');
    await user.click(screen.getByRole('button', { name: /save product/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already used/i);
  });

  it('maps server field errors onto the right inputs', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 'One or more fields are invalid.', 400, [
        { field: 'Name', message: 'That product name is already used.' },
      ]),
    );

    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Cable');
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.selectOptions(screen.getByLabelText('Brand'), '5');
    await user.click(screen.getByRole('button', { name: /save product/i }));

    expect(await screen.findByText('That product name is already used.')).toBeInTheDocument();
  });

  it('disables the button while saving', async () => {
    let resolve: () => void = () => {};
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((r) => (resolve = r)));

    const user = userEvent.setup();
    await renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Cable');
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await user.selectOptions(screen.getByLabelText('Brand'), '5');
    await user.click(screen.getByRole('button', { name: /save product/i }));

    expect(await screen.findByRole('button', { name: /saving/i })).toBeDisabled();

    resolve();
  });
});
