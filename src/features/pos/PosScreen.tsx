import { useMemo, useState } from 'react';
import { calculateCart, CartError, requiresCustomer, type CartLine } from '@/lib/cart';
import { formatPkr } from '@/lib/money';
import { ApiError } from '@/types/api';
import type { Product } from '@/features/products/productApi';
import { QuickCreateCustomer } from './QuickCreateCustomer';
import {
  FULLY_PAID_METHODS,
  paymentMethodsFor,
  SALE_TYPES,
  type CreateInvoicePayload,
  type CreateInvoiceResult,
  type PaymentMethod,
  type SaleType,
} from './posApi';

export interface PosScreenProps {
  /**
   * Looks a product up by search text or scanned barcode, priced for the sale being made — a
   * wholesale sale is quoted the wholesale price.
   */
  onFindProduct: (term: string, saleType: SaleType) => Promise<Product | null>;

  /**
   * Re-reads one product's price for a different sale type. Used when the salesman switches
   * between retail and wholesale with items already in the cart.
   */
  onRepriceProduct: (productId: number, saleType: SaleType) => Promise<number | null>;
  onSave: (payload: CreateInvoicePayload) => Promise<CreateInvoiceResult>;
  onCreateCustomer: (name: string, mobileNumber: string | null) => Promise<{ id: number; name: string }>;

  /**
   * Whether this user may complete a sale that leaves money outstanding. Only the shop owner
   * may (FR-051). Passed in rather than read from auth here so this component stays a pure
   * function of its props, which is what makes the cart maths testable in isolation.
   */
  canSellOnCredit: boolean;
}

/**
 * The counter.
 *
 * Totals shown here come from the same pure functions the server mirrors, so the number the
 * shopkeeper reads is the number that gets stored — but the server still recomputes everything
 * on save and its answer is final (FR-013).
 */
export function PosScreen({
  onFindProduct,
  onRepriceProduct,
  onSave,
  onCreateCustomer,
  canSellOnCredit,
}: PosScreenProps) {
  const [term, setTerm] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [saleType, setSaleType] = useState<SaleType>('Retail');
  const [isRepricing, setIsRepricing] = useState(false);
  const [amountPaid, setAmountPaid] = useState(0);
  const [customer, setCustomer] = useState<{ id: number; name: string } | null>(null);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CreateInvoiceResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fullyPaidMethod = FULLY_PAID_METHODS.includes(paymentMethod);

  // A cash-type method always settles the bill; Credit pays nothing; Partial is whatever the
  // shopkeeper typed. Deriving this stops the two controls contradicting each other.
  const totals = useMemo(() => {
    if (lines.length === 0) {
      return null;
    }

    try {
      const gross = calculateCart(lines, orderDiscount, 0);
      const paid =
        paymentMethod === 'Credit' ? 0 : fullyPaidMethod ? gross.total : Math.min(amountPaid, gross.total);

      return calculateCart(lines, orderDiscount, paid);
    } catch {
      return null;
    }
  }, [lines, orderDiscount, amountPaid, paymentMethod, fullyPaidMethod]);

  const cartError = useMemo(() => {
    if (lines.length === 0) {
      return null;
    }

    try {
      calculateCart(lines, orderDiscount, 0);
      return null;
    } catch (error) {
      return error instanceof CartError ? error.message : 'The cart totals are not valid.';
    }
  }, [lines, orderDiscount]);

  async function handleLookup() {
    const query = term.trim();

    if (!query) {
      return;
    }

    setLookupError(null);

    try {
      const product = await onFindProduct(query, saleType);

      if (!product) {
        setLookupError(`No product found for "${query}".`);
        return;
      }

      addProduct(product);
      setTerm('');
    } catch (error) {
      setLookupError(
        error instanceof ApiError ? error.message : 'Could not search for that product.',
      );
    }
  }

  function addProduct(product: Product) {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);

      // The server refuses two lines for one product, so a repeat scan increments the quantity.
      if (existing) {
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }

      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitSalePrice: product.salePrice,
          lineDiscount: 0,
        },
      ];
    });
  }

  /**
   * Switching between retail and wholesale re-prices what is already in the cart.
   *
   * Every line is re-read, including any the salesman had typed a price into: a deliberate switch
   * means "price this sale the other way", and silently keeping a retail price on a line in a
   * wholesale sale is the mistake worth preventing. A line whose product cannot be re-read keeps
   * the price it has rather than dropping to zero.
   */
  async function changeSaleType(next: SaleType) {
    setSaleType(next);

    if (lines.length === 0) {
      return;
    }

    setIsRepricing(true);

    try {
      const prices = await Promise.all(
        lines.map(async (line) => {
          try {
            return [line.productId, await onRepriceProduct(line.productId, next)] as const;
          } catch {
            return [line.productId, null] as const;
          }
        }),
      );

      const byId = new Map(prices);

      setLines((current) =>
        current.map((line) => {
          const price = byId.get(line.productId);

          return price === null || price === undefined
            ? line
            : { ...line, unitSalePrice: price };
        }),
      );
    } finally {
      setIsRepricing(false);
    }
  }

  function updateLine(productId: number, patch: Partial<CartLine>) {
    setLines((current) =>
      current.map((line) => (line.productId === productId ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(productId: number) {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }

  function resetSale() {
    setLines([]);
    setOrderDiscount(0);
    setAmountPaid(0);
    setPaymentMethod('Cash');
    // Sale type deliberately survives a completed sale: a wholesale customer is usually
    // followed by more wholesale, and re-selecting it every time invites a misfiled sale.
    setCustomer(null);
    setSaveError(null);
  }

  async function handleSave() {
    if (!totals) {
      return;
    }

    setSaveError(null);

    if (requiresCustomer(totals) && !customer) {
      setShowQuickCreate(true);
      return;
    }

    setIsSaving(true);

    try {
      const result = await onSave({
        customerId: customer?.id ?? null,
        orderDiscount,
        amountPaid: totals.amountPaid,
        paymentMethod,
        saleType,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitSalePrice: line.unitSalePrice,
          lineDiscount: line.lineDiscount,
        })),
      });

      setReceipt(result);
      resetSale();
    } catch (error) {
      setSaveError(
        error instanceof ApiError ? error.message : 'Could not save the sale. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleQuickCreate(name: string, mobileNumber: string | null) {
    const created = await onCreateCustomer(name, mobileNumber);
    setCustomer(created);
    setShowQuickCreate(false);
  }

  return (
    <section className="pos">
      <h2>Point of sale</h2>

      {receipt && (
        <p className="pos__receipt" role="status">
          Saved {receipt.invoiceNumber} — total {formatPkr(receipt.total)}, paid{' '}
          {formatPkr(receipt.amountPaid)}
          {receipt.amountRemaining > 0 && <>, balance {formatPkr(receipt.amountRemaining)}</>}.
        </p>
      )}

      <fieldset className="pos__sale-type">
        <legend>Sale type</legend>
        {SALE_TYPES.map((type) => (
          <label key={type.value} className="radio">
            <input
              type="radio"
              name="saleType"
              value={type.value}
              checked={saleType === type.value}
              disabled={isRepricing}
              onChange={() => void changeSaleType(type.value)}
            />
            {type.label}
          </label>
        ))}
        <small className="field__hint">
          {saleType === 'Wholesale'
            ? 'Items are priced at the wholesale rate.'
            : 'Items are priced at the counter rate.'}
        </small>
      </fieldset>

      <div className="pos__lookup">
        <label htmlFor="productSearch">Scan or search</label>
        <input
          id="productSearch"
          autoFocus
          value={term}
          placeholder="Barcode, name, brand or model"
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            // A barcode scanner types the code then presses Enter (spec assumption).
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleLookup();
            }
          }}
        />
        <button type="button" onClick={() => void handleLookup()}>
          Add
        </button>
      </div>

      {lookupError && (
        <p className="form-error" role="alert">
          {lookupError}
        </p>
      )}

      {lines.length === 0 ? (
        <p className="pos__empty">No items yet. Scan or search to begin.</p>
      ) : (
        <table className="pos__cart">
          <caption className="visually-hidden">Items in this sale</caption>
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Qty</th>
              <th scope="col">Price</th>
              <th scope="col">Discount</th>
              <th scope="col">Line total</th>
              <th scope="col">
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const priced = totals?.lines.find((l) => l.productId === line.productId);

              return (
                <tr key={line.productId}>
                  <td>{line.productName}</td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      aria-label={`Quantity for ${line.productName}`}
                      value={String(line.quantity)}
                      onChange={(e) => updateLine(line.productId, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Price for ${line.productName}`}
                      value={String(line.unitSalePrice)}
                      onChange={(e) =>
                        updateLine(line.productId, { unitSalePrice: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Discount for ${line.productName}`}
                      value={String(line.lineDiscount)}
                      onChange={(e) =>
                        updateLine(line.productId, { lineDiscount: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td data-testid={`line-total-${line.productId}`}>
                    {priced ? formatPkr(priced.lineTotal) : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label={`Remove ${line.productName}`}
                      onClick={() => removeLine(line.productId)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {cartError && (
        <p className="form-error" role="alert">
          {cartError}
        </p>
      )}

      <div className="pos__totals">
        <div className="field">
          <label htmlFor="orderDiscount">Whole-bill discount</label>
          <input
            id="orderDiscount"
            type="number"
            min="0"
            step="0.01"
            value={String(orderDiscount)}
            onChange={(event) => setOrderDiscount(Number(event.target.value))}
          />
        </div>

        <div className="field">
          <label htmlFor="paymentMethod">Payment</label>
          <select
            id="paymentMethod"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
          >
            {paymentMethodsFor(canSellOnCredit).map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
          {!canSellOnCredit && (
            <small className="field__hint">Only the owner can approve udhaar.</small>
          )}
        </div>

        {paymentMethod === 'Partial' && (
          <div className="field">
            <label htmlFor="amountPaid">Amount paid now</label>
            <input
              id="amountPaid"
              type="number"
              min="0"
              step="0.01"
              value={String(amountPaid)}
              onChange={(event) => setAmountPaid(Number(event.target.value))}
            />
          </div>
        )}

        <dl className="pos__summary">
          <dt>Subtotal</dt>
          <dd data-testid="subtotal">{formatPkr(totals?.subtotal ?? 0)}</dd>

          <dt>Discount</dt>
          <dd data-testid="discount">{formatPkr(totals?.totalDiscount ?? 0)}</dd>

          <dt>Total</dt>
          <dd data-testid="total">{formatPkr(totals?.total ?? 0)}</dd>

          <dt>Paid</dt>
          <dd data-testid="paid">{formatPkr(totals?.amountPaid ?? 0)}</dd>

          <dt>Balance</dt>
          <dd data-testid="remaining">{formatPkr(totals?.amountRemaining ?? 0)}</dd>
        </dl>
      </div>

      {customer && <p className="pos__customer">Customer: {customer.name}</p>}

      {saveError && (
        <p className="form-error" role="alert">
          {saveError}
        </p>
      )}

      <div className="form-actions">
        <button type="button" onClick={() => void handleSave()} disabled={!totals || isSaving}>
          {isSaving ? 'Saving…' : 'Save sale'}
        </button>
      </div>

      {showQuickCreate && (
        <QuickCreateCustomer
          onCreate={handleQuickCreate}
          onCancel={() => setShowQuickCreate(false)}
        />
      )}
    </section>
  );
}
