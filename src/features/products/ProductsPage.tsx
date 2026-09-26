import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productApi, type Product, type ProductUpsert } from './productApi';
import { ProductForm } from './ProductForm';
import { ProductGrid } from './ProductGrid';
import { ProductDetail } from './ProductDetail';
import { LowStockBadge } from '@/components/LowStockBadge';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { useAuth } from '@/features/auth/AuthContext';
import { isTooShortSearch } from '@/lib/searchTerms';
import { brandApi, categoryApi, type TaxonomyItem } from '@/features/taxonomy/taxonomyApi';
import { useCart } from '@/features/pos/CartProvider';
import { CartBadge } from '@/features/pos/CartBadge';

/** Active rows, A to Z (FR-085). The API already orders them; sorting here keeps the list stable. */
function alphabetical(items: TaxonomyItem[] | undefined): TaxonomyItem[] {
  return [...(items ?? [])]
    .filter((item) => item.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const VIEW_PREFERENCE_KEY = 'moizpos.products.view';

export function ProductsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Brand and category filters (FR-082). Empty string means "all" — the value an unset <select>
  // holds — and is sent to the server as no filter at all.
  const [brandId, setBrandId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  // Local brands only (FR-087) — a tick, like low stock beside it, because it is on or off.
  const hasFilters = brandId !== '' || categoryId !== '';
  // Shopping from the catalogue. The counter can only be searched one term at a time, which is
  // the wrong tool for "show me everything Oppo and let me pick three".
  const { addItem, saleType } = useCart();
  const [added, setAdded] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  /**
   * Adds one unit to the sale in progress.
   *
   * The price is RE-READ from the server rather than taken from the row: this list is priced at
   * the counter rate, and the sale being built may be a wholesale one — adding the row's own
   * price would quietly sell wholesale goods at retail.
   */
  async function addToCart(product: Product) {
    setAddError(null);

    try {
      const priced = await productApi.get(product.id, saleType);

      addItem({
        productId: priced.id,
        productName: priced.name,
        unitSalePrice: priced.salePrice,
      });

      setAdded(priced.name);
    } catch {
      // Adding at an unknown price is worse than not adding at all.
      setAddError(`Could not add ${product.name} — its price could not be read.`);
    }
  }

  const [editing, setEditing] = useState<Product | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Which view, remembered per browser (FR-008). The table is the default: it is the denser,
  // faster read, and the one the shop has been using. localStorage can throw or come back
  // empty in a private window, so a failure here simply means "no preference yet".
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try {
      return localStorage.getItem(VIEW_PREFERENCE_KEY) === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });

  const [viewing, setViewing] = useState<Product | null>(null);

  function chooseView(next: 'list' | 'grid') {
    setView(next);
    // Switching views while a detail panel is open left it stranded beneath the newly-drawn
    // table, with its picture no longer next to the card it came from — closing it is the only
    // reading that makes sense once the view underneath has changed.
    setViewing(null);

    try {
      localStorage.setItem(VIEW_PREFERENCE_KEY, next);
    } catch {
      // A remembered preference is a convenience; losing it must never break the screen.
    }
  }

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
    queryKey: ['products', appliedSearch, lowStockOnly, brandId, categoryId],
    queryFn: () =>
      productApi.search({
        search: appliedSearch || undefined,
        brandId: brandId ? Number(brandId) : undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        lowStockOnly,
        pageSize: 100,
      }),
  });

  /** Resets every filter but leaves the search box alone (FR-084). */
  function clearFilters() {
    setBrandId('');
    setCategoryId('');
  }

  const save = useMutation({
    mutationFn: async ({ product, picture }: { product: ProductUpsert; picture?: File | null }) => {
      const saved = editing
        ? await productApi.update(editing.id, product)
        : await productApi.create(product);

      // Second call on purpose: the upload is addressed to the product's id, which a create
      // does not have until it has returned. The product is saved either way — a picture that
      // fails to upload must not throw away the fields the shopkeeper just typed.
      if (picture) {
        await productApi.uploadImage(saved.id, picture);
      }

      return saved;
    },
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
        onSubmit={async (product, picture) => {
          await save.mutateAsync({ product, picture });
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

        <div className="page-header__actions">
          {/* The way back to a sale in progress, and the proof that the Add clicks went
              somewhere. Hidden entirely while the cart is empty. */}
          <CartBadge />

          {/* Presentation only. Both views read the one query below. */}
          <div className="view-toggle" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={view === 'list'}
              onClick={() => chooseView('list')}
            >
              List
            </button>
            <button
              type="button"
              aria-pressed={view === 'grid'}
              onClick={() => chooseView('grid')}
            >
              Pictures
            </button>
          </div>

          {isAdmin && (
            <button type="button" onClick={() => setIsCreating(true)}>
              New product
            </button>
          )}
        </div>
      </header>

      {added && (
        <p className="form-success" role="status">
          {added} added to the sale.
        </p>
      )}

      {addError && (
        <p className="form-error" role="alert">
          {addError}
        </p>
      )}

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
        {view === 'grid' ? (
          <ProductGrid products={data?.items ?? []} onOpen={setViewing} />
        ) : (
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
              <th scope="col">
                <span className="visually-hidden">Add to sale</span>
              </th>
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
                <td>
                  {/* Out of stock is disabled rather than hidden: the server would refuse the
                      sale anyway, and saying so here saves a trip to the counter. */}
                  <button
                    type="button"
                    disabled={product.quantityOnHand <= 0}
                    aria-label={`Add ${product.name} to cart`}
                    onClick={() => void addToCart(product)}
                  >
                    Add to cart
                  </button>
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
        )}
      </QueryState>

      {viewing && (
        <ProductDetail
          product={viewing}
          onClose={() => setViewing(null)}
          onSell={() =>
            navigate('/pos', {
              // A barcode is unambiguous, so it takes priority; otherwise the counter's own
              // search does the matching, same as if the salesman had typed the name.
              state: { prefillTerm: viewing.barcode || viewing.name },
            })
          }
          onEdit={
            isAdmin
              ? () => {
                  setEditing(viewing);
                  setViewing(null);
                }
              : undefined
          }
          onRetire={
            isAdmin
              ? () => {
                  if (window.confirm(`Retire "${viewing.name}"? Past invoices keep it.`)) {
                    deactivate.mutate(viewing.id);
                    setViewing(null);
                  }
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
