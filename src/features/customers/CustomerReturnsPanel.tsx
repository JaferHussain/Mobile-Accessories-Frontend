import { useQuery } from '@tanstack/react-query';
import { returnApi } from '@/features/returns/returnApi';
import { formatPkr } from '@/lib/money';

/**
 * What this customer has brought back, newest first.
 *
 * A return that only reduced what they owed already shows in the ledger. One that was REFUNDED —
 * cash handed back — moved no balance, so the ledger has no line for it; this is where it shows.
 * Read from the returns themselves, so the ledger's running balance is untouched. Hidden when
 * there is nothing to show.
 */
export function CustomerReturnsPanel({ customerId }: { customerId: number }) {
  const returns = useQuery({
    queryKey: ['sale-returns', 'customer', customerId],
    queryFn: () => returnApi.listSaleReturns({ customerId }),
  });

  const rows = returns.data?.items ?? [];

  if (rows.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="customerReturnsHeading">
      <h3 id="customerReturnsHeading">Returns by this customer</h3>

      <table className="data-table" data-testid="customer-returns">
        <caption className="visually-hidden">Goods this customer returned</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Invoice</th>
            <th scope="col">Product</th>
            <th scope="col">Qty</th>
            <th scope="col">Returned</th>
            <th scope="col">Refunded</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.returnId}-${row.productName}`}>
              <td>{new Date(row.returnDateUtc).toLocaleDateString('en-PK')}</td>
              <td>{row.invoiceNumber}</td>
              <td>{row.productName}</td>
              <td className="numeric">{row.quantity}</td>
              <td className="numeric">{formatPkr(row.lineTotal)}</td>
              <td className="numeric">
                {row.refundDue > 0 ? `${formatPkr(row.refundDue)}${row.refundMethod ? ` (${row.refundMethod})` : ''}` : '—'}
              </td>
              <td>{row.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
