import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PurchaseForm, type PurchaseFormValues } from './PurchaseForm';
import { ProductForm } from '@/features/products/ProductForm';
import { productApi, type Product, type ProductUpsert } from '@/features/products/productApi';
import { purchaseApi, supplierApi } from '@/features/suppliers/supplierApi';
import { QueryState } from '@/components/QueryState';
import { isTooShortSearch } from '@/lib/searchTerms';
import { formatPkr } from '@/lib/money';

export function PurchasesPage() {
  const queryClient = useQueryClient();

  const [productSearch, setProductSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Buying stock the shop has never sold before used to dead-end at "No products match": the
  // owner had to leave for the Products screen and come back. Created here, the product drops
  // straight into the purchase that prompted it.
  const createProduct = useMutation({
    mutationFn: async ({ product, picture }: { product: ProductUpsert; picture?: File | null }) => {
      const saved = await productApi.create(product);

      if (picture) {
        await productApi.uploadImage(saved.id, picture);
      }

      return saved;
    },
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });

      setIsCreatingProduct(false);
      setSelected(product);
    },
  });

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => supplierApi.search() });

  // The server refuses a search made only of one-letter words (FR-079). Sending it anyway
  // produced a 400 here and, worse, buried the "create a new product" offer behind an error —
  // precisely when the owner is trying to buy something that does not exist yet.
  const searchTooShort = isTooShortSearch(productSearch);
  const [appliedSearch, setAppliedSearch] = useState('');

  useEffect(() => {
    if (!searchTooShort) {
      setAppliedSearch(productSearch);
    }
  }, [productSearch, searchTooShort]);

  const products = useQuery({
    queryKey: ['products', appliedSearch],
    queryFn: () => productApi.search({ search: appliedSearch || undefined, pageSize: 25 }),
    enabled: appliedSearch.length > 0,
  });

  const purchases = useQuery({ queryKey: ['purchases'], queryFn: () => purchaseApi.search() });

  const record = useMutation({
    mutationFn: (values: PurchaseFormValues) => purchaseApi.record(values),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['purchases'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
      ]);

      // State the consequence of the cost rule plainly, so it is never a surprise.
      setConfirmation(
        `Recorded. Stock is now ${result.newQuantityOnHand}, and every unit on hand is costed at ${formatPkr(result.newCostPrice)}.`,
      );

      setSelected(null);
      setProductSearch('');
    },
  });

  return (
    <section>
      <header className="page-header">
        <h2>Purchases</h2>
      </header>

      {confirmation && (
        <p className="form-success" role="status">
          {confirmation}
        </p>
      )}

      {isCreatingProduct ? (
        <>
          <button
            type="button"
            className="link-button"
            onClick={() => setIsCreatingProduct(false)}
          >
            ← Back to the search
          </button>

          {/* The Products screen's own form, not a copy of it: same fields, same validation,
              same optional picture. A simplified second form here would drift the moment
              either one changed. */}
          <ProductForm
            onSubmit={async (product, picture) => {
              await createProduct.mutateAsync({ product, picture });
            }}
            onCancel={() => setIsCreatingProduct(false)}
          />
        </>
      ) : selected && suppliers.data ? (
        <>
          <button type="button" className="link-button" onClick={() => setSelected(null)}>
            ← Choose a different product
          </button>

          <PurchaseForm
            product={selected}
            suppliers={suppliers.data.items.map((s) => ({ id: s.id, name: s.name }))}
            onSubmit={async (values) => {
              await record.mutateAsync(values);
            }}
          />
        </>
      ) : (
        <>
          <div className="filters">
            <div className="field">
              <label htmlFor="purchaseProductSearch">Which product did you buy?</label>
              <input
                id="purchaseProductSearch"
                value={productSearch}
                placeholder="Search by name, brand or barcode"
                onChange={(event) => setProductSearch(event.target.value)}
              />
              {searchTooShort && (
                <small className="field__hint">Type at least 2 letters to search.</small>
              )}
            </div>
          </div>

          {suppliers.data?.items.length === 0 && (
            <p className="form-error" role="alert">
              Add a supplier before recording a purchase.
            </p>
          )}

          {appliedSearch && !searchTooShort && (
            <>
            {products.data?.items.length === 0 && (
              <p className="pick-list__none">
                No products match that search.{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setIsCreatingProduct(true)}
                >
                  Create a new product
                </button>
              </p>
            )}

            <QueryState
              isLoading={products.isPending}
              error={products.error}
              isEmpty={false}
              emptyMessage="No products match that search."
            >
              <ul className="pick-list">
                {products.data?.items.map((product) => (
                  <li key={product.id}>
                    <button type="button" onClick={() => setSelected(product)}>
                      {product.name}
                      <span className="pick-list__meta">
                        {product.quantityOnHand} in stock ·{' '}
                        {product.costPrice === undefined ? '' : `cost ${formatPkr(product.costPrice)}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </QueryState>
            </>
          )}
        </>
      )}

      <h3>Recent purchases</h3>

      <QueryState
        isLoading={purchases.isPending}
        error={purchases.error}
        isEmpty={purchases.data?.items.length === 0}
        emptyMessage="No purchases recorded yet."
      >
        <table className="data-table">
          <caption className="visually-hidden">Recent purchases</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Supplier</th>
              <th scope="col">Qty</th>
              <th scope="col">Unit cost</th>
              <th scope="col">Total</th>
              <th scope="col">Returned</th>
            </tr>
          </thead>
          <tbody>
            {purchases.data?.items.map((purchase) => (
              <tr key={purchase.id}>
                <td>{new Date(purchase.purchaseDateUtc).toLocaleDateString('en-PK')}</td>
                <td>
                  {suppliers.data?.items.find((s) => s.id === purchase.supplierId)?.name ?? '—'}
                </td>
                <td className="numeric">{purchase.quantity}</td>
                <td className="numeric">{formatPkr(purchase.unitCost)}</td>
                <td className="numeric">{formatPkr(purchase.total)}</td>
                <td className="numeric">{purchase.returnedQty > 0 ? purchase.returnedQty : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
    </section>
  );
}
