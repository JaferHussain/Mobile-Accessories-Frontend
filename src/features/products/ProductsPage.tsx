import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productApi, type Product, type ProductUpsert } from './productApi';
import { ProductForm } from './ProductForm';
import { LowStockBadge } from '@/components/LowStockBadge';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { useAuth } from '@/features/auth/AuthContext';

export function ProductsPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ['products', search, lowStockOnly],
    queryFn: () => productApi.search({ search: search || undefined, lowStockOnly, pageSize: 100 }),
  });

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
            placeholder="Name, brand, model, category or barcode"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(event) => setLowStockOnly(event.target.checked)}
          />
          Only items needing reorder
        </label>
      </div>

      <QueryState
        isLoading={isPending}
        error={error}
        isEmpty={data?.items.length === 0}
        emptyMessage="No products match that search."
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
