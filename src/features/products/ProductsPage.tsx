import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productApi, type Product, type ProductUpsert } from './productApi';
import { ProductForm } from './ProductForm';
import { LowStockBadge } from '@/components/LowStockBadge';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { useAuth } from '@/features/auth/AuthContext';
import { isTooShortSearch } from '@/lib/searchTerms';
import { brandApi, categoryApi, type TaxonomyItem } from '@/features/taxonomy/taxonomyApi';

/** Active rows, A to Z (FR-085). The API already orders them; sorting here keeps the list stable. */
function alphabetical(items: TaxonomyItem[] | undefined): TaxonomyItem[] {
  return [...(items ?? [])]
    .filter((item) => item.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function ProductsPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Brand and category filters (FR-082). Empty string means "all" — the value an unset <select>
  // holds — and is sent to the server as no filter at all.
  const [brandId, setBrandId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  // Local brands only (FR-087) — a tick, like low stock beside it, because it is on or off.
  const [localOnly, setLocalOnly] = useState(false);
  const hasFilters = brandId !== '' || categoryId !== '' || localOnly;
  const [editing, setEditing] = useState<Product | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // A search made only of one-letter words is refused by the server (FR-079). Rather than send it,
  // the screen shows a hint and keeps searching for the last thing that was long enough, so the
  // list the shopkeeper was looking at does not vanish mid-word.
  const searchTooShort = isTooShortSearch(search);
  const [appliedSearch, setAppliedSearch] = useState('');

  useEffect(() => {
    if (!searchTooShort) {
      setAppliedSearch(search);
    }
  }, [search, searchTooShort]);

  const brands = useQuery({
    queryKey: ['brands', '', false],
    queryFn: () => brandApi.search({ pageSize: 200 }),
  });

  const categories = useQuery({
    queryKey: ['categories', '', false],
    queryFn: () => categoryApi.search({ pageSize: 200 }),
  });

  // Every filter is part of the key, so each combination is cached on its own and the server —
  // not this screen — decides what matches (FR-083).
  const { data, isPending, error } = useQuery({
    queryKey: ['products', appliedSearch, lowStockOnly, brandId, categoryId, localOnly],
    queryFn: () =>
      productApi.search({
        search: appliedSearch || undefined,
        brandId: brandId ? Number(brandId) : undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        localOnly: localOnly || undefined,
        lowStockOnly,
        pageSize: 100,
      }),
  });

  /** Resets every filter but leaves the search box alone (FR-084). */
  function clearFilters() {
    setBrandId('');
    setCategoryId('');
    setLocalOnly(false);
  }

  const save = useMutation({
    mutationFn: (product: ProductUpsert) =>
      editing ? productApi.update(editing.id, product) : productApi.create(product),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditing(null);
      setIsCreating(false);
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => productApi.deactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  if (isCreating || editing) {
    return (
      <ProductForm
        initial={editing ?? undefined}
        onSubmit={async (product) => {
          await save.mutateAsync(product);
        }}
        onCancel={() => {
          setEditing(null);
          setIsCreating(false);
        }}
      />
    );
  }

  return (
    <section>
      <header className="page-header">
        <h2>Products</h2>
        {isAdmin && (
          <button type="button" onClick={() => setIsCreating(true)}>
            New product
          </button>
        )}
      </header>

      <div className="filters">
        <div className="field">
          <label htmlFor="productSearchBox">Search</label>
          <input
            id="productSearchBox"
            value={search}
            placeholder="e.g. oppo charger, c type, or scan a barcode"
            onChange={(event) => setSearch(event.target.value)}
            aria-describedby={searchTooShort ? 'productSearchHint' : undefined}
          />
          {searchTooShort && (
            <small id="productSearchHint" className="field__hint">
              Type at least 2 letters to search.
            </small>
          )}
        </div>

        <div className="field">
          <label htmlFor="productBrandFilter">Brand</label>
          <select
            id="productBrandFilter"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
          >
            <option value="">All brands</option>
            {alphabetical(brands.data?.items).map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="productCategoryFilter">Category</label>
          <select
            id="productCategoryFilter"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">All categories</option>
            {alphabetical(categories.data?.items).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(event) => setLowStockOnly(event.target.checked)}
          />
          Only items needing reorder
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={localOnly}
            onChange={(event) => setLocalOnly(event.target.checked)}
          />
          Local brands only
        </label>

        {hasFilters && (
          <button type="button" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <QueryState
        isLoading={isPending}
        error={error}
        isEmpty={data?.items.length === 0}
        // FR-086: say *why* the list is empty, so an empty table is never a mystery.
        emptyMessage={
          hasFilters
            ? 'No products match the chosen filters.'
            : 'No products match that search.'
        }
      >
        <table className="data-table">
          <caption className="visually-hidden">Products</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Category</th>
              <th scope="col">Brand</th>
              <th scope="col">Price</th>
              {isAdmin && <th scope="col">Cost</th>}
              <th scope="col">Stock</th>
              {isAdmin && (
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{product.category}</td>
                <td>{product.brand ?? '—'}</td>
                <td className="numeric">{formatPkr(product.salePrice)}</td>
                {/* Only rendered for an Admin — and the API does not send it to Staff at all. */}
                {isAdmin && (
                  <td className="numeric">
                    {product.costPrice === undefined ? '—' : formatPkr(product.costPrice)}
                  </td>
                )}
                <td className="numeric">
                  {product.quantityOnHand}{' '}
                  <LowStockBadge
                    quantityOnHand={product.quantityOnHand}
                    isLowStock={product.isLowStock}
                  />
                </td>
                {isAdmin && (
                  <td>
                    <button type="button" onClick={() => setEditing(product)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Retire "${product.name}"? Past invoices keep it.`)) {
                          deactivate.mutate(product.id);
                        }
                      }}
                    >
                      Retire
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
    </section>
  );
}
