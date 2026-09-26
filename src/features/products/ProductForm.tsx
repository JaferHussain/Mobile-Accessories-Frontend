import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/types/api';
import { brandApi, categoryApi } from '@/features/taxonomy/taxonomyApi';
import type { Product, ProductUpsert } from './productApi';

export interface ProductFormProps {
  initial?: Product;

  /**
   * The picture arrives separately from the fields because its upload is addressed to a
   * product id that does not exist until this save succeeds. The caller sequences
   * create-then-upload; the form's job is only to hand over a file it has already checked.
   */
  onSubmit: (product: ProductUpsert, picture?: File | null) => Promise<void>;
  onCancel?: () => void;
}

/** Mirrors the server's own list (`ImageStorageService.AllowedTypes`). */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Mirrors `Storage:MaxImageBytes`. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type Errors = Partial<Record<keyof ProductUpsert, string>>;

const EMPTY: ProductUpsert = {
  name: '',
  categoryId: 0,
  brandId: null,
  model: '',
  barcode: '',
  minStockThreshold: 0,
  supplierId: null,
};

/**
 * Create/edit form for one product variant.
 *
 * Validation here mirrors the server's so an obvious mistake costs no round trip, but the
 * server remains the authority. Note that quantity and cost are only editable when creating:
 * afterwards stock moves through purchases, sales and audited adjustments, and cost moves
 * through a purchase (FR-011a) — the API ignores them on update.
 */
export function ProductForm({ initial, onSubmit, onCancel }: ProductFormProps) {
  const isEdit = initial !== undefined;

  const [values, setValues] = useState<ProductUpsert>(
    initial
      ? {
          name: initial.name,
          categoryId: initial.categoryId,
          brandId: initial.brandId ?? null,
          model: initial.model ?? '',
          barcode: initial.barcode ?? '',
          minStockThreshold: initial.minStockThreshold ?? 0,
          supplierId: initial.supplierId ?? null,
        }
      : EMPTY,
  );

  // Only active rows are offered: a retired category is one the owner has stopped using, and
  // the server refuses it anyway.
  const categories = useQuery({
    queryKey: ['categories', '', false],
    queryFn: () => categoryApi.search({ pageSize: 200 }),
  });

  const brands = useQuery({
    queryKey: ['brands', '', false],
    queryFn: () => brandApi.search({ pageSize: 200 }),
  });

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [picture, setPicture] = useState<File | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);

  // Checked here as well as on the server: the shopkeeper finds out while still looking at the
  // form, instead of after a save that stored the product but not its picture.
  function choosePicture(file: File | null) {
    if (!file) {
      setPicture(null);
      setPictureError(null);

      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setPicture(null);
      setPictureError('Only JPEG, PNG or WebP pictures can be used.');

      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setPicture(null);
      setPictureError('That picture is too large. The limit is 2 MB.');

      return;
    }

    setPicture(file);
    setPictureError(null);
  }

  function set<K extends keyof ProductUpsert>(key: K, value: ProductUpsert[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function validate(): boolean {
    const next: Errors = {};

    if (!values.name.trim()) {
      next.name = 'Product name is required.';
    }

    if (!values.brandId) {
      next.brandId = 'Brand is required. Use your local-goods brand for generic stock.';
    }

    if (!values.categoryId) {
      next.categoryId = 'Category is required.';
    }

    const nonNegative: Array<[keyof ProductUpsert, string]> = [
      ['minStockThreshold', 'Minimum stock cannot be negative.'],
    ];

    for (const [field, message] of nonNegative) {
      const value = values[field];

      if (typeof value === 'number' && (Number.isNaN(value) || value < 0)) {
        next[field] = message;
      }
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!validate() || pictureError) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(
        {
          ...values,
          name: values.name.trim(),
          model: values.model?.trim() || null,
          barcode: values.barcode?.trim() || null,
        },
        picture,
      );
    } catch (error) {
      if (error instanceof ApiError) {
        // Surface field-level messages the server flagged.
        const fieldErrors: Errors = {};

        for (const detail of error.details) {
          const key = detail.field.split('.').pop()?.replace(/^./, (c) => c.toLowerCase());

          if (key && key in values) {
            fieldErrors[key as keyof ProductUpsert] = detail.message;
          }
        }

        setErrors(fieldErrors);
        setFormError(error.message);
      } else {
        setFormError('Could not save the product. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function numberField(
    key: keyof ProductUpsert,
    label: string,
    options: { disabled?: boolean; hint?: string } = {},
  ) {
    const id = String(key);

    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type="number"
          step="0.01"
          min="0"
          disabled={options.disabled}
          value={String(values[key] ?? 0)}
          onChange={(event) => set(key, Number(event.target.value) as never)}
          aria-invalid={errors[key] !== undefined}
          aria-describedby={errors[key] ? `${id}-error` : undefined}
        />
        {options.hint && <small className="field__hint">{options.hint}</small>}
        {errors[key] && (
          <span id={`${id}-error`} className="field-error">
            {errors[key]}
          </span>
        )}
      </div>
    );
  }

  return (
    <form className="product-form" onSubmit={handleSubmit} noValidate>
      <h2>{isEdit ? 'Edit product' : 'New product'}</h2>

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={values.name}
          onChange={(event) => set('name', event.target.value)}
          aria-invalid={errors.name !== undefined}
          aria-describedby={errors.name ? 'name-error' : undefined}
        />
        {errors.name && (
          <span id="name-error" className="field-error">
            {errors.name}
          </span>
        )}
      </div>

      <div className="field">
        <label htmlFor="categoryId">Category</label>
        <select
          id="categoryId"
          value={String(values.categoryId || '')}
          onChange={(event) => set('categoryId', Number(event.target.value))}
          aria-invalid={errors.categoryId !== undefined}
          aria-describedby={errors.categoryId ? 'categoryId-error' : undefined}
        >
          <option value="">Select a category…</option>
          {categories.data?.items.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <small className="field__hint">Maintained on the Categories screen.</small>
        {errors.categoryId && (
          <span id="categoryId-error" className="field-error">
            {errors.categoryId}
          </span>
        )}
      </div>

      <div className="field">
        <label htmlFor="brandId">Brand</label>
        <select
          id="brandId"
          value={String(values.brandId ?? '')}
          onChange={(event) =>
            set('brandId', event.target.value ? Number(event.target.value) : null)
          }
          aria-invalid={errors.brandId !== undefined}
          aria-describedby={errors.brandId ? 'brandId-error' : undefined}
        >
          {/* Required: the owner files goods with no well-known maker under a brand created for
              them rather than leaving the field blank. */}
          <option value="">Select a brand…</option>
          {brands.data?.items.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
        <small className="field__hint">
          Maintained on the Brands screen. Generic stock goes under your local-goods brand.
        </small>
        {errors.brandId && (
          <span id="brandId-error" className="field-error">
            {errors.brandId}
          </span>
        )}
      </div>

      <div className="field">
        <label htmlFor="model">Model</label>
        <input id="model" value={values.model ?? ''} onChange={(e) => set('model', e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="barcode">Barcode</label>
        <input
          id="barcode"
          value={values.barcode ?? ''}
          onChange={(e) => set('barcode', e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="picture">Picture</label>
        <input
          id="picture"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          onChange={(e) => choosePicture(e.target.files?.[0] ?? null)}
        />
        <p className="field__hint">
          Optional. A photo makes look-alike stock easier to tell apart at the counter.
        </p>
        {pictureError ? <p className="field-error">{pictureError}</p> : null}
      </div>

      {numberField('minStockThreshold', 'Reorder at')}

      {/* Said plainly, because the prices the shopkeeper expects to type are genuinely not here.
          Without this the form reads as unfinished rather than deliberate. */}
      <p className="field__hint">
        {isEdit
          ? 'Prices and stock are set when you record a purchase, on the Purchases screen.'
          : 'Next: record a purchase for this product. That is where its cost, selling prices and quantity are set — and what makes it ready to sell.'}
      </p>

      <div className="form-actions">
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save product'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
