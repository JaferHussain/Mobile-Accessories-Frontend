import { describe, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductForm } from '@/features/products/ProductForm';
import { brandApi, categoryApi } from '@/features/taxonomy/taxonomyApi';

/**
 * Feature 005, US1 — attaching a picture while creating a product.
 *
 * The picture cannot travel with the rest of the form: the upload is addressed to a product
 * that does not exist until the save succeeds. So the form hands the chosen file to its caller
 * alongside the fields, and the caller sequences create-then-upload. These tests pin that
 * hand-off, and pin that a product with no picture still saves — the picture is optional, and
 * a shop that has not photographed its stock yet must not be blocked from using the software.
 */

vi.mock('@/features/taxonomy/taxonomyApi', () => ({
  categoryApi: { search: vi.fn() },
  brandApi: { search: vi.fn() },
}));

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 100,
  totalItems: items.length,
  totalPages: 1,
});

type Submit = (product: unknown, picture?: File | null) => Promise<void>;

function renderForm(onSubmit: Mock<Submit> = vi.fn<Submit>().mockResolvedValue(undefined)) {
  vi.mocked(categoryApi.search).mockResolvedValue(
    page([{ id: 7, name: 'Cables', isActive: true }]) as never,
  );
  vi.mocked(brandApi.search).mockResolvedValue(
    page([{ id: 3, name: 'Baseus', isLocal: false, isActive: true }]) as never,
  );

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ProductForm onSubmit={onSubmit} />
    </QueryClientProvider>,
  );

  return onSubmit;
}

async function fillRequiredFields() {
  await userEvent.type(screen.getByLabelText(/name/i), 'Type-C Cable');

  await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByLabelText(/category/i), '7');

  // Still required, even though it no longer decides which categories are offered.
  await userEvent.selectOptions(screen.getByLabelText('Brand'), '3');
}

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', {
  type: 'image/jpeg',
});

describe('ProductForm picture field', () => {
  it('offers a picture field', async () => {
    renderForm();

    expect(await screen.findByLabelText(/picture/i)).toBeInTheDocument();
  });

  it('hands the chosen file to the caller alongside the fields', async () => {
    const onSubmit = renderForm();

    await fillRequiredFields();

    const file = jpeg();
    fireEvent.change(screen.getByLabelText(/picture/i), { target: { files: [file] } });

    await userEvent.click(screen.getByRole('button', { name: /save|create/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const [fields, picture] = onSubmit.mock.calls[0]!;

    expect(fields).toMatchObject({ name: 'Type-C Cable', categoryId: 7 });
    expect(picture).toBe(file);
  });

  it('saves a product with no picture at all', async () => {
    const onSubmit = renderForm();

    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: /save|create/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const [fields, picture] = onSubmit.mock.calls[0]!;

    // A shop mid-way through photographing its catalogue must still be able to add stock.
    expect(fields).toMatchObject({ name: 'Type-C Cable' });
    expect(picture ?? null).toBeNull();
  });

  it('refuses a file that is not an image before any upload is attempted', async () => {
    const onSubmit = renderForm();

    await fillRequiredFields();

    const pdf = new File([new Uint8Array([1, 2, 3])], 'invoice.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/picture/i), { target: { files: [pdf] } });

    expect(await screen.findByText(/JPEG, PNG or WebP/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save|create/i }));

    // Rejected on this side, so the shopkeeper is told immediately rather than after a
    // round trip that saved the product but not the picture.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a picture larger than the server would accept', async () => {
    const onSubmit = renderForm();

    await fillRequiredFields();

    const huge = new File([new Uint8Array(3 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText(/picture/i), { target: { files: [huge] } });

    expect(await screen.findByText(/2 MB/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save|create/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
