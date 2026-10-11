import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { myProductsApi } from './myProductsApi';

/**
 * The salesman's products: what the owner has given him to sell, at the shop's price, and what he
 * sold in the period with what it came to. Every figure is the server's; no cost, no wholesale price.
 */
export function MyProductsPanels({ from, to, periodLabel }: { from: string; to: string; periodLabel: string }) {
  const products = useQuery({
    queryKey: ['my-products', from, to],
    queryFn: () => myProductsApi.mine(from, to),
  });

  const data = products.data;

  return (
    <QueryState isLoading={products.isPending} error={products.error}>
      {data && (
        <>
          <section className="my-products" aria-labelledby="my-products-heading">
            <header className="my-products__head">
              <h3 id="my-products-heading">Products given to me</h3>
              <span className="my-products__total" data-testid="assigned-total">
                {data.assignedUnits} {data.assignedUnits === 1 ? 'item' : 'items'} · {formatPkr(data.assignedValue)}
              </span>
            </header>

            {data.assigned.length === 0 ? (
              <p className="empty-state">You are carrying nothing. The owner gives you stock before you go out.</p>
            ) : (
              <table className="data-table" data-testid="assigned-products">
                <caption className="visually-hidden">Products I am carrying</caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">With me</th>
                    <th scope="col">Price</th>
                    <th scope="col">Value</th>
                    <th scope="col">My commission / unit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assigned.map((row) => (
                    <tr key={row.productId}>
                      <td>{row.productName}</td>
                      <td className="numeric">{row.quantity}</td>
                      <td className="numeric">{formatPkr(row.price)}</td>
                      <td className="numeric">{formatPkr(row.value)}</td>
                      <td className="numeric" data-testid={`commission-per-unit-${row.productId}`}>
                        {row.commissionPerUnit ? formatPkr(row.commissionPerUnit) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <small className="field__hint">
              Price is the shop’s retail price — the least a retail sale may go for. My commission / unit is
              what the owner promised on each one you sell, on top of half of anything above the price.
            </small>
          </section>

          <section className="my-products" aria-labelledby="my-sold-heading">
            <header className="my-products__head">
              <h3 id="my-sold-heading">What I sold · {periodLabel}</h3>
              <span className="my-products__total" data-testid="sold-total">
                {data.soldUnits} {data.soldUnits === 1 ? 'item' : 'items'} · {formatPkr(data.soldAmount)}
              </span>
            </header>

            {data.sold.length === 0 ? (
              <p className="empty-state">Nothing sold {periodLabel.toLowerCase()} yet.</p>
            ) : (
              <table className="data-table" data-testid="sold-products">
                <caption className="visually-hidden">Products I sold</caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Sold</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sold.map((row) => (
                    <tr key={row.productId}>
                      <td>{row.productName}</td>
                      <td className="numeric">{row.quantitySold}</td>
                      <td className="numeric">{formatPkr(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="numeric">{data.soldUnits}</td>
                    <td className="numeric">{formatPkr(data.soldAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
            <small className="field__hint">After the bill discount, less anything the customer brought back.</small>
          </section>
        </>
      )}
    </QueryState>
  );
}
