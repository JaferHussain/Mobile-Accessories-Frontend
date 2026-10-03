import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { ApiError } from '@/types/api';
import { productApi, type Product } from '@/features/products/productApi';
import { formatTime } from '@/features/team/TeamPage';
import { salesmanStockApi, type SalesmanStockLine, type SalesmanStockReason } from './salesmanStockApi';

const REASON_LABELS: Record<SalesmanStockReason, string> = {
  Issued: 'Issued to him',
  Returned: 'Brought back',
  Sold: 'Sold',
  CustomerReturn: 'Customer returned it to him',
};

interface IssueLine {
  productId: number;
  name: string;
  quantity: number;
}

function errorText(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.message : fallback;
}

/**
 * The stock a field salesman carries out of the shop, and brings back — every unit tracked.
 *
 * <p>Issuing moves goods from the shelf into his bag; bringing back moves them onto the shelf
 * again. Neither changes what the shop OWNS — his goods are still the shop's. He can sell only what
 * is in his bag, and the counter only what is on the shelf. Admin only.</p>
 */
export function SalesmanStockPage() {
  const userId = Number(useParams().userId);
  const queryClient = useQueryClient();

  const statement = useQuery({
    queryKey: ['salesman-stock', userId],
    queryFn: () => salesmanStockApi.statement(userId),
  });

  // ---- issuing
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Product[] | null>(null);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [issueNote, setIssueNote] = useState('');
  const [issueError, setIssueError] = useState<string | null>(null);

  // ---- bringing back: a quantity per product he carries, blank meaning none
  const [back, setBack] = useState<Record<number, string>>({});
  const [backError, setBackError] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['salesman-stock', userId] }),
      queryClient.invalidateQueries({ queryKey: ['team'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
    ]);

  const issue = useMutation({
    mutationFn: () =>
      salesmanStockApi.issue(
        userId,
        lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        issueNote.trim() || null,
      ),
    onSuccess: async () => {
      setLines([]);
      setIssueNote('');
      setResults(null);
      setSearch('');
      await refresh();
    },
    onError: (caught) => setIssueError(errorText(caught, 'Could not issue the stock.')),
  });

  const takeBack = useMutation({
    mutationFn: (items: SalesmanStockLine[]) => salesmanStockApi.returnToShop(userId, items, null),
    onSuccess: async () => {
      setBack({});
      await refresh();
    },
    onError: (caught) => setBackError(errorText(caught, 'Could not record what came back.')),
  });

  async function find(event: FormEvent) {
    event.preventDefault();

    if (search.trim().length < 2) {
      return;
    }

    const found = await productApi.search({ search: search.trim(), pageSize: 8 });
    setResults(found.items);
  }

  function add(product: Product) {
    setLines((current) =>
      current.some((line) => line.productId === product.id)
        ? current
        : [...current, { productId: product.id, name: product.name, quantity: 1 }],
    );
  }

  function submitIssue(event: FormEvent) {
    event.preventDefault();
    setIssueError(null);

    if (lines.length === 0) {
      setIssueError('Find a product and add it first.');
      return;
    }

    if (lines.some((line) => !(line.quantity > 0))) {
      setIssueError('Each quantity must be more than zero.');
      return;
    }

    issue.mutate();
  }

  function submitBack(event: FormEvent) {
    event.preventDefault();
    setBackError(null);

    const items = Object.entries(back)
      .map(([productId, quantity]) => ({ productId: Number(productId), quantity: Number(quantity) }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      setBackError('Enter how many of each product he brought back.');
      return;
    }

    takeBack.mutate(items);
  }

  const data = statement.data;

  return (
    <section>
      <Link className="link-button" to="/team">
        ← Team
      </Link>

      <QueryState isLoading={statement.isPending} error={statement.error}>
        {data && (
          <>
            <header className="page-header">
              <h2>{data.fullName} — stock with him</h2>
            </header>

            <p className="page-intro">
              Goods he has taken out of the shop. They are still the shop&apos;s stock, but only he can sell them —
              the counter sells what is on the shelf.
            </p>

            <dl className="ledger__summary">
              <dt>Units with him</dt>
              <dd data-testid="total-units">{data.totalUnits}</dd>
            </dl>

            <form className="card inline-form" onSubmit={submitBack} noValidate>
              <h3>Stock with him</h3>

              {backError && (
                <p className="form-error" role="alert">
                  {backError}
                </p>
              )}

              {data.items.length === 0 ? (
                <p className="empty-state">He is carrying nothing.</p>
              ) : (
                <>
                  <table className="data-table">
                    <caption className="visually-hidden">Stock with him</caption>
                    <thead>
                      <tr>
                        <th scope="col">Product</th>
                        <th scope="col">With him</th>
                        <th scope="col">Brought back</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item) => (
                        <tr key={item.productId}>
                          <td>{item.productName}</td>
                          <td className="numeric">{item.quantity}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max={item.quantity}
                              inputMode="numeric"
                              aria-label={`Bring back ${item.productName}`}
                              value={back[item.productId] ?? ''}
                              onChange={(event) => setBack((current) => ({ ...current, [item.productId]: event.target.value }))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <button type="submit" disabled={takeBack.isPending}>
                    Take back into the shop
                  </button>
                </>
              )}
            </form>

            <div className="card inline-form">
              <h3>Issue stock to {data.fullName}</h3>

              {issueError && (
                <p className="form-error" role="alert">
                  {issueError}
                </p>
              )}

              <form className="filters" onSubmit={(event) => void find(event)}>
                <div className="field">
                  <label htmlFor="issueSearch">Find product</label>
                  <input
                    id="issueSearch"
                    value={search}
                    placeholder="Name, model or barcode"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <button type="submit">Find</button>
              </form>

              {results && results.length === 0 && <p className="empty-state">No product matches that.</p>}

              {results && results.length > 0 && (
                <ul className="stock-lines">
                  {results.map((product) => (
                    <li key={product.id} data-testid={`issue-result-${product.id}`}>
                      <span>{product.name}</span>
                      <span className="field__hint"> · {product.atShop ?? product.quantityOnHand} in shop to issue</span>
                      <button type="button" onClick={() => add(product)}>
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={submitIssue} noValidate>
                {lines.length > 0 && (
                  <ul className="stock-lines">
                    {lines.map((line) => (
                      <li key={line.productId}>
                        <label htmlFor={`issueQty${line.productId}`}>{line.name}</label>
                        <input
                          id={`issueQty${line.productId}`}
                          type="number"
                          min="1"
                          inputMode="numeric"
                          aria-label={`How many ${line.name}`}
                          value={String(line.quantity)}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((existing) =>
                                existing.productId === line.productId
                                  ? { ...existing, quantity: Number(event.target.value) }
                                  : existing,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setLines((current) => current.filter((existing) => existing.productId !== line.productId))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="field">
                  <label htmlFor="issueNote">Note</label>
                  <input id="issueNote" maxLength={255} value={issueNote} onChange={(event) => setIssueNote(event.target.value)} />
                </div>

                <button type="submit" disabled={issue.isPending}>
                  Issue to {data.fullName}
                </button>
              </form>
            </div>

            <h3>Stock movements</h3>

            {data.movements.length === 0 ? (
              <p className="empty-state">Nothing yet — stock you issue to him appears here.</p>
            ) : (
              <table className="data-table">
                <caption className="visually-hidden">Stock movements</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">What</th>
                    <th scope="col">Product</th>
                    <th scope="col">Units</th>
                    <th scope="col">With him after</th>
                    <th scope="col">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movements.map((movement) => (
                    <tr key={movement.id}>
                      <td>{formatTime(movement.createdAtUtc)}</td>
                      <td>
                        {REASON_LABELS[movement.reason] ?? movement.reason}
                        {movement.note && <small className="field__hint"> · {movement.note}</small>}
                      </td>
                      <td>{movement.productName}</td>
                      <td className="numeric">
                        {movement.changeQty > 0 ? '+' : '−'}
                        {Math.abs(movement.changeQty)}
                      </td>
                      <td className="numeric">{movement.resultingQty}</td>
                      <td>{movement.reference ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </QueryState>
    </section>
  );
}
