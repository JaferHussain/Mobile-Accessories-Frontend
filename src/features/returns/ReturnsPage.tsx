import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SaleReturnForm } from './SaleReturnForm';
import { PurchaseReturnForm } from './PurchaseReturnForm';
import { returnApi, type ReturnableLine } from './returnApi';
import { purchaseApi, supplierApi, type Purchase } from '@/features/suppliers/supplierApi';
import { formatPkr } from '@/lib/money';
import { QueryState } from '@/components/QueryState';
import { PAYMENT_METHODS } from '@/features/pos/posApi';
import { ProofAttachment } from '@/features/proofs/ProofAttachment';
import { needsProof } from '@/features/proofs/proofApi';

function methodLabel(method: string): string {
  return PAYMENT_METHODS.find((option) => option.value === method)?.label ?? method;
}

/**
 * Where a return happens — the front door to two endpoints that already existed
 * (`/sale-returns`, `/purchase-returns`) but had no screen sending anything to them.
 *
 * Two screens under two headings — Sale return under Sell, Purchase return under Purchasing — at
 * the owner's request; they used to be two tabs of one Returns screen. They look up different
 * things (an invoice vs. a purchase), are shaped differently (several lines vs. one product) and
 * carry different authority: supplier returns expose cost and payables, so that route is
 * Admin-only on the server (`PurchaseReturnsController`) and guarded in the router to match.
 */

function CustomerReturns() {
  const queryClient = useQueryClient();
  // The picked line IS the whole state: it already carries its invoice, its discount and what
  // each unit is worth back, so picking one needs no second lookup — and only the item the
  // shopkeeper searched for is offered, not the rest of that invoice.
  const [invoice, setInvoice] = useState<ReturnableLine | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // One box, one search: product name, invoice number or the customer's mobile number all go
  // through the same field and the same query — the shopkeeper should not have to decide in
  // advance which kind of thing they are typing.
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<ReturnableLine[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const history = useQuery({
    queryKey: ['sale-returns'],
    queryFn: () => returnApi.listSaleReturns(),
  });

  async function search() {
    if (searchText.trim().length < 2) {
      setSearchError('Type at least 2 letters to search.');
      return;
    }

    setSearchError(null);
    setIsSearching(true);

    try {
      const found = await returnApi.findReturnableLines(searchText.trim());

      setResults(found);

      if (found.length === 0) {
        setSearchError(`No returnable sale found for "${searchText.trim()}".`);
      }
    } catch {
      setResults(null);
      setSearchError('Could not search for that. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }

  if (invoice) {
    return (
      <>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setInvoice(null);
            setConfirmation(null);
          }}
        >
          ← Search again
        </button>

        <SaleReturnForm
          invoiceNumber={invoice.invoiceNumber}
          amountRemaining={invoice.amountRemaining}
          lines={[
            {
              invoiceItemId: invoice.invoiceItemId,
              productName: invoice.productName,
              quantitySold: invoice.quantitySold,
              quantityReturned: invoice.quantityReturned,
              quantityAvailable: invoice.quantityAvailable,
              unitSalePrice: invoice.unitSalePrice,
              refundPerUnit: invoice.refundPerUnit,
              discountPerUnit: invoice.discountPerUnit,
            },
          ]}
          onSubmit={async (items, reason, refundMethod) => {
            const result = await returnApi.recordSaleReturn(invoice.invoiceId, items, reason, refundMethod);

            // Names the exact product and its updated stock — "it worked" is not enough; the
            // shopkeeper needs to see what changed.
            const stockLine = result.items
              .map((item) => `${item.productName} (stock now ${item.newQuantityOnHand})`)
              .join(', ');

            // The adjustment is named in the confirmation too, so what the customer was told
            // at the counter matches what was written down.
            const adjustment =
              result.totalDiscount > 0
                ? ` (${formatPkr(result.totalBilled)} less ${formatPkr(result.totalDiscount)} discount)`
                : '';

            setConfirmation(
              `Recorded ${result.returnNumber}. ${stockLine} — returned ` +
                `${formatPkr(result.totalReturned)}${adjustment}` +
                (result.refundDue > 0 ? `, refund owed ${formatPkr(result.refundDue)}.` : '.'),
            );
            setInvoice(null);
            setResults(null);
            setSearchText('');
            await queryClient.invalidateQueries({ queryKey: ['sale-returns'] });
          }}
        />
      </>
    );
  }

  return (
    <>
      {confirmation && (
        <p className="form-success" role="status">
          {confirmation}
        </p>
      )}

      <div className="inline-form">
        <div className="field">
          <label htmlFor="returnSearch">Search</label>
          <input
            id="returnSearch"
            value={searchText}
            placeholder="Product name, invoice number, or mobile number"
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void search();
              }
            }}
          />
        </div>

        <button type="button" disabled={isSearching} onClick={() => void search()}>
          {isSearching ? 'Searching…' : 'Find'}
        </button>
      </div>

      {searchError && (
        <p className="form-error" role="alert">
          {searchError}
        </p>
      )}

      {results && results.length > 0 && (
        <ul className="pick-list">
          {results.map((line) => (
            <li key={line.invoiceItemId}>
              <button type="button" onClick={() => setInvoice(line)}>
                {line.productName}
                {/* The amount comes with the item, before anyone opens the return: it is what
                    a unit is worth BACK, after the discount, not the price on the receipt. */}
                <span className="pick-list__meta">
                  {line.invoiceNumber} · {line.quantityAvailable} available ·{' '}
                  {formatPkr(line.refundPerUnit)} each
                  {line.discountPerUnit > 0 && ` (${formatPkr(line.discountPerUnit)} discount)`} ·{' '}
                  up to {formatPkr(line.maxRefund)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Recent returns</h3>

      <QueryState
        isLoading={history.isPending}
        error={history.error}
        isEmpty={history.data?.items.length === 0}
        emptyMessage="No returns recorded yet."
      >
        {/* Centred: a return row is read across — product, quantity, what came back — rather
            than scanned down a column of totals, so the figures sit under their headings. */}
        <table className="data-table data-table--centred">
          <caption className="visually-hidden">Recent customer returns</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Invoice</th>
              <th scope="col">Product</th>
              <th scope="col">Qty</th>
              <th scope="col">Item value</th>
              <th scope="col">Discount</th>
              <th scope="col">Returned</th>
              <th scope="col">Refund</th>
              <th scope="col">Reason</th>
              <th scope="col">Proof</th>
            </tr>
          </thead>
          <tbody>
            {history.data?.items.map((row) => (
              <tr key={row.returnId}>
                <td>{new Date(row.returnDateUtc).toLocaleDateString('en-PK')}</td>
                <td>{row.invoiceNumber}</td>
                <td>{row.productName}</td>
                <td className="numeric">{row.quantity}</td>
                <td className="numeric">{formatPkr(row.billedTotal)}</td>
                <td className="numeric">
                  {row.discountTotal > 0 ? `− ${formatPkr(row.discountTotal)}` : '—'}
                </td>
                <td className="numeric">{formatPkr(row.lineTotal)}</td>
                <td className="numeric">
                  {row.refundDue > 0 ? formatPkr(row.refundDue) : '—'}
                  {row.refundMethod && (
                    <small className="field__hint"> {methodLabel(row.refundMethod)}</small>
                  )}
                </td>
                <td>{row.reason ?? '—'}</td>
                <td>
                  {/* A transfer refund carries its screenshot; cash and no-refund rows need none. */}
                  {needsProof(row.refundMethod) ? (
                    <ProofAttachment
                      kind="refund"
                      id={row.returnId}
                      hasProof={row.hasRefundProof}
                      onAttached={() => void queryClient.invalidateQueries({ queryKey: ['sale-returns'] })}
                    />
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
    </>
  );
}

function SupplierReturns() {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // "Return item": find the purchase by product name instead of scrolling the table.
  const [productSearchText, setProductSearchText] = useState('');
  const [isSearchingByProduct, setIsSearchingByProduct] = useState(false);

  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => supplierApi.search(),
  });

  // Scoped to the chosen supplier once one is picked: a return goes back to whichever supplier
  // the goods came from, and "every purchase from every supplier in one list" is exactly the
  // haystack that made finding the right one slow before this filter existed.
  const purchases = useQuery({
    queryKey: ['purchases', supplierId, productSearchText],
    queryFn: () => purchaseApi.search(supplierId || undefined, productSearchText.trim() || undefined),
  });

  const history = useQuery({
    queryKey: ['purchase-returns', supplierId],
    queryFn: () => returnApi.listPurchaseReturns(supplierId || undefined),
  });

  const recordReturn = useMutation({
    mutationFn: ({ quantity, reason }: { quantity: number; reason: string | null }) =>
      returnApi.recordPurchaseReturn(selected!.id, quantity, reason),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['purchases'] });
      await queryClient.invalidateQueries({ queryKey: ['purchase-returns'] });
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });

      setConfirmation(
        `Recorded ${result.returnNumber}. ${result.productName} — stock now ` +
          `${result.newQuantityOnHand}, payable now ${formatPkr(result.newSupplierPayable)}.`,
      );
      setSelected(null);
    },
  });

  if (selected) {
    return (
      <>
        <button type="button" className="link-button" onClick={() => setSelected(null)}>
          ← Choose a different purchase
        </button>

        <PurchaseReturnForm
          purchase={{
            id: selected.id,
            productName: selected.productName,
            quantity: selected.quantity,
            returnedQty: selected.returnedQty,
            unitCost: selected.unitCost,
          }}
          onSubmit={async (quantity, reason) => {
            await recordReturn.mutateAsync({ quantity, reason });
            setIsSearchingByProduct(false);
            setProductSearchText('');
          }}
        />
      </>
    );
  }

  return (
    <>
      {confirmation && (
        <p className="form-success" role="status">
          {confirmation}
        </p>
      )}

      <div className="filters">
        <div className="field">
          <label htmlFor="returnSupplier">Supplier</label>
          <select
            id="returnSupplier"
            value={supplierId}
            onChange={(event) =>
              setSupplierId(event.target.value ? Number(event.target.value) : '')
            }
          >
            <option value="">All suppliers</option>
            {suppliers.data?.items.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>

        {/* Finds the purchase by product name instead of scrolling the table. */}
        <button type="button" onClick={() => setIsSearchingByProduct((current) => !current)}>
          Return item
        </button>

        {isSearchingByProduct && (
          <div className="field">
            <label htmlFor="returnPurchaseProductSearch">Product name</label>
            <input
              id="returnPurchaseProductSearch"
              value={productSearchText}
              placeholder="e.g. Oppo Charger"
              onChange={(event) => setProductSearchText(event.target.value)}
            />
          </div>
        )}
      </div>

      <QueryState
        isLoading={purchases.isPending}
        error={purchases.error}
        isEmpty={purchases.data?.items.length === 0}
        emptyMessage="No purchases recorded yet."
      >
        <table className="data-table">
          <caption className="visually-hidden">Purchases available to return</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Qty</th>
              <th scope="col">Returned</th>
              <th scope="col">Unit cost</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {purchases.data?.items.map((purchase) => (
              <tr key={purchase.id}>
                <td>{new Date(purchase.purchaseDateUtc).toLocaleDateString('en-PK')}</td>
                <td className="numeric">{purchase.quantity}</td>
                <td className="numeric">{purchase.returnedQty > 0 ? purchase.returnedQty : '—'}</td>
                <td className="numeric">{formatPkr(purchase.unitCost)}</td>
                <td>
                  <button
                    type="button"
                    disabled={purchase.returnedQty >= purchase.quantity}
                    onClick={() => setSelected(purchase)}
                  >
                    Return {purchase.productName}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>

      <h3>Recent returns</h3>

      <QueryState
        isLoading={history.isPending}
        error={history.error}
        isEmpty={history.data?.items.length === 0}
        emptyMessage="No returns recorded yet."
      >
        {/* Centred to match the customer-return history beside it. */}
        <table className="data-table data-table--centred">
          <caption className="visually-hidden">Recent supplier returns</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Supplier</th>
              <th scope="col">Product</th>
              <th scope="col">Qty</th>
              <th scope="col">Value</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {history.data?.items.map((row) => (
              <tr key={row.returnId}>
                <td>{new Date(row.returnDateUtc).toLocaleDateString('en-PK')}</td>
                <td>{row.supplierName}</td>
                <td>{row.productName}</td>
                <td className="numeric">{row.quantity}</td>
                <td className="numeric">{formatPkr(row.total)}</td>
                <td>{row.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
    </>
  );
}

/**
 * Taking goods back from a customer. Under **Sell**, beside the counter — the owner's layout:
 * a return is the other half of a sale. Open to Staff, who take returns at the counter.
 */
export function SaleReturnsPage() {
  return (
    <section>
      <header className="page-header">
        <h2>Sale return</h2>
      </header>

      <CustomerReturns />
    </section>
  );
}

/**
 * Sending goods back to a supplier. Under **Purchasing**, beside the purchases it goes back
 * against. Admin-only: the route is guarded, and the server refuses Staff regardless, because
 * this screen shows purchase cost and the supplier's payable balance.
 */
export function PurchaseReturnsPage() {
  return (
    <section>
      <header className="page-header">
        <h2>Purchase return</h2>
      </header>

      <SupplierReturns />
    </section>
  );
}
