import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/types/api';
import { formatPkr, roundMoney } from '@/lib/money';
import { shopToday } from '@/lib/shopDay';
import { isTooShortSearch } from '@/lib/searchTerms';
import { QueryState } from '@/components/QueryState';
import { ProductForm } from '@/features/products/ProductForm';
import { productApi, type Product, type ProductUpsert } from '@/features/products/productApi';
import { PAYMENT_METHODS, type PaymentMethod } from '@/features/pos/posApi';
import { ProofFileField } from '@/features/proofs/ProofFileField';
import { needsProof } from '@/features/proofs/proofApi';
import { accountsFor, accountLabel, shopAccountApi } from '@/features/shopAccounts/shopAccountApi';
import { BillLineForm, type BillLineValues } from './BillLineForm';
import type { RecordPurchaseBillInput } from './purchaseBillApi';

type PayMode = 'full' | 'part' | 'later';

/** What the bill builder hands the page: the bill, and the two pictures to attach once it is saved. */
export interface PurchaseBillSubmission {
  bill: RecordPurchaseBillInput;
  billPhoto: File | null;
  paymentProof: File | null;
}

export interface PurchaseBillFormProps {
  suppliers: Array<{ id: number; name: string }>;
  onSubmit: (submission: PurchaseBillSubmission) => Promise<void>;
}

/** The real ways to pay a supplier. Credit and Partial describe an unpaid sale. */
const SUPPLIER_PAYMENT_METHODS = PAYMENT_METHODS.filter((method) => method.value !== 'Credit' && method.value !== 'Partial');

/**
 * A supplier's bill, from top to bottom: who and when, what came, how it was paid, and the
 * pictures — saved at once. On the server the stock goes in first and the payment follows it.
 *
 * <p>Payment starts unanswered on purpose — "Pay in full", "Pay part" or "Pay later" — and so does
 * how it was paid: a Cash default would quietly put a bank transfer into the drawer count. The date
 * paid starts at the bill's date and can never be earlier, nor later than today.</p>
 */
export function PurchaseBillForm({ suppliers, onSubmit }: PurchaseBillFormProps) {
  const queryClient = useQueryClient();
  const today = shopToday();

  // 1. Supplier and bill
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [billDate, setBillDate] = useState(today);
  const [billNumber, setBillNumber] = useState('');

  // 2. Items
  const [lines, setLines] = useState<BillLineValues[]>([]);
  const [editing, setEditing] = useState<{ product: Product; initial?: BillLineValues } | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  // 3. Payment
  const [payMode, setPayMode] = useState<PayMode | ''>('');
  const [partAmount, setPartAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [paidOn, setPaidOn] = useState(today);
  const [shopAccountId, setShopAccountId] = useState<number | ''>('');
  const [reference, setReference] = useState('');

  // 4. Attachments
  const [billPhoto, setBillPhoto] = useState<File | null>(null);
  const [paymentProof, setPaymentProof] = useState<File | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // The server refuses a search made only of one-letter words; never send one.
  const searchTooShort = isTooShortSearch(productSearch);

  useEffect(() => {
    if (!searchTooShort) {
      setAppliedSearch(productSearch);
    }
  }, [productSearch, searchTooShort]);

  // A payment cannot predate the bill: moving the bill later carries the payment date with it.
  useEffect(() => {
    if (paidOn < billDate) {
      setPaidOn(billDate);
    }
  }, [billDate, paidOn]);

  const products = useQuery({
    queryKey: ['products', appliedSearch],
    queryFn: () => productApi.search({ search: appliedSearch || undefined, pageSize: 25 }),
    enabled: appliedSearch.length > 0,
  });

  const accounts = useQuery({ queryKey: ['shop-accounts', 'active'], queryFn: () => shopAccountApi.list() });
  const offeredAccounts = accountsFor(accounts.data ?? [], method);

  // Buying something the shop has never sold: created here, it drops straight into the bill.
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
      setEditing({ product });
    },
  });

  const total = useMemo(() => roundMoney(lines.reduce((sum, line) => sum + roundMoney(line.unitCost * line.quantity), 0)), [lines]);
  const payingNow = payMode === 'full' ? total : payMode === 'part' ? roundMoney(partAmount) : 0;
  const leftOwing = roundMoney(total - payingNow);
  const isPaying = payMode === 'full' || payMode === 'part';

  function addLine(line: BillLineValues) {
    setLines((current) => {
      const others = current.filter((existing) => existing.product.id !== line.product.id);
      return [...others, line];
    });
    setEditing(null);
    setProductSearch('');
  }

  function validate(): string | null {
    if (!supplierId) {
      return 'Choose the supplier this bill is from.';
    }

    if (billDate > today) {
      return 'A bill cannot be dated in the future.';
    }

    if (lines.length === 0) {
      return 'Add at least one product to the bill.';
    }

    if (payMode === '') {
      return 'Say how this bill is paid — in full now, part now, or later.';
    }

    if (isPaying) {
      if (payMode === 'part' && !(partAmount > 0 && partAmount < total)) {
        return 'A part payment must be more than zero and less than the bill.';
      }

      if (!method) {
        return 'Say how the supplier was paid — cash, bank transfer, JazzCash…';
      }

      if (paidOn < billDate || paidOn > today) {
        return 'The date paid must be between the bill date and today.';
      }
    }

    return null;
  }

  async function submit() {
    const problem = validate();

    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      await onSubmit({
        bill: {
          supplierId: Number(supplierId),
          billNumber: billNumber.trim() || null,
          billDate,
          lines: lines.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
            unitCost: line.unitCost,
            newRetailPrice: line.newRetailPrice,
            newWholesalePrice: line.newWholesalePrice,
          })),
          payment: isPaying
            ? {
                amount: payingNow,
                paymentMethod: method as PaymentMethod,
                paidOn,
                shopAccountId: needsProof(method) && shopAccountId !== '' ? shopAccountId : null,
                reference: reference.trim() || null,
              }
            : null,
        },
        billPhoto,
        paymentProof: isPaying && needsProof(method) ? paymentProof : null,
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the bill. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="purchase-bill">
      <div className="purchase-bill__main">
        <h3>New purchase bill</h3>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {/* 1 ---------------------------------------------------------------- */}
        <section className="purchase-bill__step" aria-labelledby="bill-step-1">
          <h4 id="bill-step-1">
            <span className="step-number">1</span> Supplier &amp; bill
          </h4>
          <div className="purchase-bill__row">
            <div className="field">
              <label htmlFor="billSupplier">Supplier</label>
              <select id="billSupplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value ? Number(event.target.value) : '')}>
                <option value="">Choose…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="billDate">Bill date</label>
              <input id="billDate" type="date" max={today} value={billDate} onChange={(event) => setBillDate(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="billNumber">Supplier&apos;s bill no.</label>
              <input
                id="billNumber"
                maxLength={60}
                placeholder="Optional"
                value={billNumber}
                onChange={(event) => setBillNumber(event.target.value)}
              />
            </div>
          </div>
        </section>

      {/* 2 — the line editor and the product form are forms of their own, so nothing here is one. */}
      <section className="purchase-bill__step purchase-bill__items" aria-labelledby="bill-step-2">
        <h4 id="bill-step-2">
          <span className="step-number">2</span> Items
        </h4>

        {lines.length > 0 && (
          <table className="data-table">
            <caption className="visually-hidden">Items on this bill</caption>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Qty</th>
                <th scope="col">Cost</th>
                <th scope="col">Line total</th>
                <th scope="col">Retail</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.product.id}>
                  <td>{line.product.name}</td>
                  <td className="numeric">{line.quantity}</td>
                  <td className="numeric">{formatPkr(line.unitCost)}</td>
                  <td className="numeric">{formatPkr(roundMoney(line.unitCost * line.quantity))}</td>
                  <td className="numeric">{formatPkr(line.newRetailPrice)}</td>
                  <td className="row-actions">
                    <button type="button" onClick={() => setEditing({ product: line.product, initial: line })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${line.product.name}`}
                      onClick={() => setLines((current) => current.filter((existing) => existing.product.id !== line.product.id))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {editing ? (
          <BillLineForm
            key={editing.product.id}
            product={editing.product}
            initial={editing.initial}
            onAdd={addLine}
            onCancel={() => setEditing(null)}
          />
        ) : isCreatingProduct ? (
          <>
            <button type="button" className="link-button" onClick={() => setIsCreatingProduct(false)}>
              ← Back to the search
            </button>
            {/* The Products screen's own form, not a copy: same fields, same validation. */}
            <ProductForm
              onSubmit={async (product, picture) => {
                await createProduct.mutateAsync({ product, picture });
              }}
              onCancel={() => setIsCreatingProduct(false)}
            />
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="purchaseProductSearch">{lines.length === 0 ? 'Which product did you buy?' : 'Add another product'}</label>
              <input
                id="purchaseProductSearch"
                value={productSearch}
                placeholder="Search by name, brand or barcode"
                onChange={(event) => setProductSearch(event.target.value)}
              />
              {searchTooShort && <small className="field__hint">Type at least 2 letters to search.</small>}
            </div>

            {appliedSearch && !searchTooShort && (
              <>
                {products.data?.items.length === 0 && (
                  <p className="pick-list__none">
                    No products match that search.{' '}
                    <button type="button" className="link-button" onClick={() => setIsCreatingProduct(true)}>
                      Create a new product
                    </button>
                  </p>
                )}

                <QueryState isLoading={products.isPending} error={products.error} isEmpty={false} emptyMessage="">
                  <ul className="pick-list">
                    {products.data?.items.map((product) => (
                      <li key={product.id}>
                        <button type="button" onClick={() => setEditing({ product })}>
                          {product.name}
                          <span className="pick-list__meta">
                            {product.quantityOnHand} owned
                            {product.costPrice === undefined ? '' : ` · cost ${formatPkr(product.costPrice)}`}
                            {lines.some((line) => line.product.id === product.id) ? ' · already on this bill' : ''}
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
      </section>

      <section className="purchase-bill__step" aria-labelledby="bill-step-3">
        <h4 id="bill-step-3">
          <span className="step-number">3</span> Payment
        </h4>

        <div className="segmented" role="radiogroup" aria-label="How is this bill paid?">
          {(
            [
              ['full', 'Pay in full now'],
              ['part', 'Pay part now'],
              ['later', 'Pay later'],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className={`segmented__option${payMode === mode ? ' is-active' : ''}`}>
              <input type="radio" name="billPayMode" checked={payMode === mode} onChange={() => setPayMode(mode)} />
              {label}
            </label>
          ))}
        </div>

        {payMode === 'later' && (
          <p className="field__hint">The whole bill is added to what you owe this supplier. Pay it from the bills list when you do.</p>
        )}

        {isPaying && (
          <div className="purchase-bill__row">
            {payMode === 'part' && (
              <div className="field">
                <label htmlFor="billPartAmount">Amount paid</label>
                <input
                  id="billPartAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={String(partAmount)}
                  onChange={(event) => setPartAmount(Number(event.target.value))}
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="billPaidBy">Paid by</label>
              <select id="billPaidBy" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod | '')}>
                <option value="">Choose…</option>
                {SUPPLIER_PAYMENT_METHODS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {method === 'Cash' && <small className="field__hint">Comes out of the drawer on the day it is paid.</small>}
            </div>

            <div className="field">
              <label htmlFor="billPaidOn">Date paid</label>
              <input id="billPaidOn" type="date" min={billDate} max={today} value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
            </div>

            {needsProof(method) && offeredAccounts.length > 0 && (
              <div className="field">
                <label htmlFor="billFromAccount">From account</label>
                <select
                  id="billFromAccount"
                  value={shopAccountId}
                  onChange={(event) => setShopAccountId(event.target.value ? Number(event.target.value) : '')}
                >
                  <option value="">Not recorded</option>
                  {offeredAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {accountLabel(account)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label htmlFor="billReference">Reference</label>
              <input
                id="billReference"
                maxLength={255}
                placeholder="Cheque or transaction number"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
          </div>
        )}
      </section>

      <section className="purchase-bill__step" aria-labelledby="bill-step-4">
        <h4 id="bill-step-4">
          <span className="step-number">4</span> Bill &amp; proof
        </h4>
        <div className="purchase-bill__row">
          <div className="field proof-field">
            <label htmlFor="billPhoto">Supplier&apos;s bill (photo)</label>
            <input
              id="billPhoto"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setBillPhoto(event.target.files?.[0] ?? null)}
            />
            <small className="field__hint">Optional — it can be added later from the bills list.</small>
          </div>
          {isPaying && <ProofFileField id="billPaymentProof" method={method} onFile={setPaymentProof} label="Payment screenshot" />}
        </div>
      </section>

      </div>

      <aside className="purchase-bill__summary" aria-label="Bill summary">
        <dl>
          <dt>Items</dt>
          <dd data-testid="bill-items">{lines.length}</dd>
          <dt>Bill total</dt>
          <dd data-testid="bill-total">{formatPkr(total)}</dd>
          <dt>Paying now</dt>
          <dd data-testid="bill-paying">{formatPkr(payingNow)}</dd>
          <dt>Left owing</dt>
          <dd data-testid="bill-owing" className={leftOwing > 0 ? 'owing' : undefined}>
            {formatPkr(leftOwing)}
          </dd>
        </dl>
        <button type="button" className="button--primary" disabled={isSaving} onClick={() => void submit()}>
          {isSaving ? 'Saving…' : 'Save bill'}
        </button>
        <small className="field__hint">Stock goes in first, then the payment — all saved together.</small>
      </aside>
    </div>
  );
}
