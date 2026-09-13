import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PurchaseForm, type PurchaseFormValues } from './PurchaseForm';
import { productApi, type Product } from '@/features/products/productApi';
import { purchaseApi, supplierApi } from '@/features/suppliers/supplierApi';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';

export function PurchasesPage() {
  const queryClient = useQueryClient();

  const [productSearch, setProductSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => supplierApi.search() });

  const products = useQuery({
    queryKey: ['products', productSearch],
    queryFn: () => productApi.search({ search: productSearch || undefined, pageSize: 25 }),
    enabled: productSearch.length > 0,
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

      {selected && suppliers.data ? (
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
            </div>
          </div>

          {suppliers.data?.items.length === 0 && (
            <p className="form-error" role="alert">
              Add a supplier before recording a purchase.
            </p>
          )}

          {productSearch && (
            <QueryState
              isLoading={products.isPending}
              error={products.error}
              isEmpty={products.data?.items.length === 0}
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
