import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateCart, CartError, type CartLine } from '@/lib/cart';
import { useCart } from './CartProvider';
import { formatPkr } from '@/lib/money';
import { ApiError } from '@/types/api';
import type { Product } from '@/features/products/productApi';
import { ProductPicture } from '@/features/products/ProductPicture';
import { StockCount } from '@/components/StockCount';
import { CheckoutModal, type CheckoutDetails } from './CheckoutModal';
import { ShareButtons } from '@/features/documents/ShareButtons';
import type { DocumentType, ShareLink } from '@/features/documents/documentApi';
import {
  SALE_TYPES,
  type CreateInvoicePayload,
  type ProductLookup,
  type CreateInvoiceResult,
  type CustomerSummary,
  type PaymentMethod,
  type SaleType,
} from './posApi';

export interface PosScreenProps {
  /**
   * Looks a product up by search text or scanned barcode, priced for the sale being made — a
   * wholesale sale is quoted the wholesale price.
   */
  onFindProduct: (term: string, saleType: SaleType) => Promise<ProductLookup>;

  /**
   * Re-reads one product's price for a different sale type. Used when the salesman switches
   * between retail and wholesale with items already in the cart.
   */
  onRepriceProduct: (productId: number, saleType: SaleType) => Promise<number | null>;
  onSave: (payload: CreateInvoicePayload) => Promise<CreateInvoiceResult>;
  onCreateCustomer: (name: string, mobileNumber: string | null) => Promise<{ id: number; name: string }>;

  /**
   * Finds customers already on file, for the checkout modal's picker. Without it the counter
   * could only CREATE customers, so every repeat udhaar sale made a second record with a second
   * balance and the owner chasing a debt saw half of it.
   */
  onSearchCustomers: (term: string) => Promise<CustomerSummary[]>;

  /**
   * Whether this user may complete a sale that leaves money outstanding. Only the shop owner
   * may (FR-051). Passed in rather than read from auth here so this component stays a pure
   * function of its props, which is what makes the cart maths testable in isolation.
   */
  canSellOnCredit: boolean;
  /** A field salesman: udhaar only to the owner's udhaar customers. */
  udhaarCustomersOnly?: boolean;
  /** The counter shopkeeper: part payments, never the whole bill on udhaar. */
  canTakePartPayment?: boolean;

  /**
   * Attaches the screenshot behind a non-cash payment to the sale just saved (feature 008).
   * Addressed to an invoice id, which is why it can only be offered after the save.
   */
  onUploadPaymentProof?: (invoiceId: number, picture: File) => Promise<void>;

  /**
   * How long a cash sale's confirmation stays before fading. Injectable so a test can assert the
   * fading without waiting six seconds for it.
   */
  confirmationVisibleMs?: number;

  /** Fetches the invoice document, so the customer can be handed their bill on the spot. */
  onFetchDocument?: (documentType: DocumentType, referenceId: number) => Promise<Blob>;

  /** Mints the link the WhatsApp and SMS messages carry. */
  onCreateShareLink?: (
    documentType: DocumentType,
    referenceId: number,
    mobileNumber?: string | null,
  ) => Promise<ShareLink>;

  /**
   * Opens the Products list to shop from the catalogue. The cart survives the trip, which is
   * the whole reason this is offered at all.
   */
  onBrowseProducts?: () => void;

  /**
   * Arrived here from a product's Sell button (feature 005): search this immediately, once,
   * without waiting for the salesman to press Enter a second time for something already chosen.
   */
  initialTerm?: string;
}

/**
 * The counter.
 *
 * Totals shown here come from the same pure functions the server mirrors, so the number the
 * shopkeeper reads is the number that gets stored — but the server still recomputes everything
 * on save and its answer is final (FR-013).
 */
/** How long a cash sale's confirmation stays before fading. Long enough to read, short enough
 *  not to sit in the way of the next customer. */
const ConfirmationVisibleMs = 6000;

export function PosScreen({
  onFindProduct,
  onRepriceProduct,
  onSave,
  onCreateCustomer,
  onSearchCustomers,
  canSellOnCredit,
  udhaarCustomersOnly = false,
  canTakePartPayment = false,
  initialTerm,
  onUploadPaymentProof,
  onBrowseProducts,
  onFetchDocument,
  onCreateShareLink,
  confirmationVisibleMs = ConfirmationVisibleMs,
}: PosScreenProps) {
  const [term, setTerm] = useState(initialTerm ?? '');

  // The cart is held above the router so it survives a walk to the Products list and back, and
  // a refresh. Without a provider this is ordinary local state, which is how the counter's
  // maths stays testable on its own.
  const { lines, setLines, addItem, saleType, setSaleType, needsReprice, markRepriced } = useCart();

  const [orderDiscount, setOrderDiscount] = useState(0);
  const [showCheckout, setShowCheckout] = useState(false);
  const [isRepricing, setIsRepricing] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [results, setResults] = useState<Product[]>([]);
  // The search behind the cards on screen — re-run when the sale type changes, so a card never
  // offers a product at the rate of the other sale type.
  const [resultsQuery, setResultsQuery] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CreateInvoiceResult | null>(null);
  const [proofState, setProofState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle');

  // The method the SAVED sale used, kept beside the receipt. resetSale() puts the live control
  // back to Cash for the next customer, so reading `paymentMethod` here would hide the proof
  // box on the very bank transfer that needs it.
  const [receiptMethod, setReceiptMethod] = useState<PaymentMethod>('Cash');

  // The number the SAVED sale's customer had, kept beside the receipt for the same reason
  // receiptMethod is: the checkout has closed and the counter has moved on, so reading it live
  // would offer the next customer's details against the previous customer's bill.
  const [receiptCustomerMobile, setReceiptCustomerMobile] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // What the goods come to. How it is paid for is settled in the checkout modal, once, at the
  // end — so nothing here needs to know about payment at all.
  const totals = useMemo(() => {
    if (lines.length === 0) {
      return null;
    }

    try {
      return calculateCart(lines, orderDiscount, 0);
    } catch {
      return null;
    }
  }, [lines, orderDiscount]);

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

  // Runs the hand-off from a product's Sell button exactly once. The ref, not state, is what
  // makes it once: this component can re-render many times afterward (a save, a re-price)
  // without a stale `initialTerm` prop somehow searching again.
  const ranInitialLookup = useRef(false);

  useEffect(() => {
    if (initialTerm && !ranInitialLookup.current) {
      ranInitialLookup.current = true;
      void handleLookup();
    }
    // handleLookup closes over `term`/`saleType`, both fixed at mount time for this one-shot
    // call — re-running this effect on their change would defeat the "once" guarantee above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTerm]);

  // A cart restored from storage still carries the prices it was saved with. Re-read them once,
  // before anything can be sold. Lines the salesman just added are not re-priced: the lookup
  // that put them there priced them moments ago.
  const repricedRestoredCart = useRef(false);

  useEffect(() => {
    if (!needsReprice || lines.length === 0 || repricedRestoredCart.current) {
      return;
    }

    repricedRestoredCart.current = true;

    void repriceAll(saleType).finally(markRepriced);
    // Deliberately keyed on the restore flag alone: this is a one-shot correction at mount,
    // not something that should re-run as the salesman edits the cart it produced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsReprice, lines.length]);

  async function handleLookup() {
    const query = term.trim();

    if (!query) {
      return;
    }

    setLookupError(null);

    try {
      const found = await onFindProduct(query, saleType);

      if (found.kind === 'barcode') {
        // A scan names one item and cannot mean another. Straight in, as it always has been.
        addProduct(found.product);
        setResults([]);
        setTerm('');

        return;
      }

      if (found.products.length === 0) {
        setResults([]);
        setLookupError(`No product found for "${query}".`);

        return;
      }

      // Typed searches stop here. Even a single match is offered rather than taken: "the only
      // thing matching what I typed" is not the same as "the thing in the customer's hand",
      // and an unnoticed wrong line is found later at the till, or not at all.
      setResults(found.products);
      setResultsQuery(query);
    } catch (error) {
      setLookupError(
        error instanceof ApiError ? error.message : 'Could not search for that product.',
      );
    }
  }

  // The merge rule lives in the cart store, shared with the Products list: the server refuses
  // two lines for one product, so a repeat scan increments the quantity.
  function addProduct(product: Product) {
    addItem({
      productId: product.id,
      productName: product.name,
      unitSalePrice: product.salePrice,
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
    await repriceAll(next);

    // The cards on screen were priced for the sale type being left. Switching to Wholesale and
    // pressing Add on a card fetched at retail used to put the item in at the RETAIL price — the
    // owner's "wholesale selected, but no wholesale price". Re-read them at the new rate.
    if (results.length > 0 && resultsQuery) {
      try {
        const found = await onFindProduct(resultsQuery, next);
        setResults(found.kind === 'matches' ? found.products : []);
      } catch {
        setResults([]);
      }
    }
  }

  /**
   * Re-reads every line's price from the server.
   *
   * Used for two different reasons that need the same thing: switching between retail and
   * wholesale, and restoring a cart from storage. The second matters because the server takes
   * the unit price from the client, so a cart carrying a price from before a purchase changed
   * it would sell at the old figure with nothing to flag it.
   */
  async function repriceAll(forSaleType: SaleType) {
    if (lines.length === 0) {
      return;
    }

    setIsRepricing(true);

    try {
      const prices = await Promise.all(
        lines.map(async (line) => {
          try {
            return [line.productId, await onRepriceProduct(line.productId, forSaleType)] as const;
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
    // Sale type deliberately survives a completed sale: a wholesale customer is usually
    // followed by more wholesale, and re-selecting it every time invites a misfiled sale.
    // Customer and payment need no reset — the checkout modal is created fresh each time.
    setShowCheckout(false);
    setSaveError(null);
    setResults([]);
    setTerm('');
    setLookupError(null);
  }

  // A cash sale is finished the moment it is saved: the money is in the drawer and there is
  // nothing left to attach or send that the salesman must be kept looking at. So its confirmation
  // fades by itself, and the counter is ready with no click at all.
  //
  // A non-cash banner stays. It carries the payment-proof upload and the sharing actions, and a
  // timer that removes an unfinished job from under the salesman is worse than one more click.
  useEffect(() => {
    if (!receipt || receiptMethod !== 'Cash') {
      return;
    }

    const timer = setTimeout(() => setReceipt(null), confirmationVisibleMs);

    return () => clearTimeout(timer);
  }, [receipt, receiptMethod, confirmationVisibleMs]);


  /**
   * Completes the sale with what the checkout modal collected.
   *
   * Errors are re-thrown rather than swallowed: the modal stays open and shows them, so a
   * refusal (no stock, a credit sale a salesman may not make) leaves the cart intact and the
   * salesman on the screen that can fix it.
   */
  async function handleConfirm(details: CheckoutDetails) {
    if (!totals) {
      return;
    }

    setSaveError(null);
    setIsSaving(true);

    try {
      const result = await onSave({
        customerId: details.customerId,
        orderDiscount,
        amountPaid: details.amountPaid,
        paymentMethod: details.paymentMethod,
        paymentAccountNumber: details.paymentAccountNumber,
        paymentTransactionId: details.paymentTransactionId,
        saleType,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitSalePrice: line.unitSalePrice,
          lineDiscount: line.lineDiscount,
        })),
      });

      setReceipt(result);
      setReceiptMethod(details.paymentMethod);
      setReceiptCustomerMobile(details.customerMobile);
      setProofState('idle');
      setShowCheckout(false);
      resetSale();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="pos">
      <h2>Point of sale</h2>

      {receipt && (
        <div className="pos__receipt" role="status">
          <p>
            Saved {receipt.invoiceNumber} — total {formatPkr(receipt.total)}, paid{' '}
            {formatPkr(receipt.amountPaid)}
            {receipt.amountRemaining > 0 && <>, balance {formatPkr(receipt.amountRemaining)}</>}.
          </p>

          {/* Non-cash only: cash was counted into the drawer, so there is nothing to evidence
              and an unused control on the busiest screen is noise. */}
          {receiptMethod !== 'Cash' && onUploadPaymentProof && (
            <div className="pos__proof">
              <label htmlFor="paymentProof">Payment proof</label>
              <input
                id="paymentProof"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={proofState === 'sending'}
                onChange={(event) => {
                  const picture = event.target.files?.[0];

                  if (!picture) {
                    return;
                  }

                  setProofState('sending');

                  // The sale is already recorded and stays recorded whatever happens here —
                  // a failed screenshot must never read as a failed sale.
                  void onUploadPaymentProof(receipt.invoiceId, picture)
                    .then(() => setProofState('done'))
                    .catch(() => setProofState('failed'));
                }}
              />

              {proofState === 'done' && <span className="pos__proof-ok">Proof attached.</span>}
              {proofState === 'failed' && (
                <span className="pos__proof-failed">
                  Could not attach the proof. The sale is saved — try again.
                </span>
              )}
            </div>
          )}

          {/* The customer is still standing there — this is the moment to hand over the bill. */}
          {onFetchDocument && onCreateShareLink && (
            <ShareButtons
              documentType="Invoice"
              referenceId={receipt.invoiceId}
              customerMobile={receiptCustomerMobile}
              hasCustomer={receipt.customerId !== null}
              onFetchDocument={onFetchDocument}
              onCreateShareLink={onCreateShareLink}
            />
          )}

          {/* Only a lingering banner needs dismissing; a cash confirmation fades on its own. */}
          {receiptMethod !== 'Cash' && (
            <div className="form-actions">
              <button type="button" className="pos__dismiss" onClick={() => setReceipt(null)}>
                Dismiss
              </button>
            </div>
          )}
        </div>
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
        {/* "Search", not "Add": since feature 005 this button no longer puts anything in the
            cart — it looks the term up and offers what it found. Only a scan adds directly. */}
        <button type="button" onClick={() => void handleLookup()}>
          Search
        </button>

        {/* The other half of shopping from the catalogue. The cart lives above the router, so
            this walk no longer destroys the sale in progress. */}
        {onBrowseProducts && (
          <button type="button" className="pos__browse" onClick={onBrowseProducts}>
            Add more items
          </button>
        )}
      </div>

      {lookupError && (
        <p className="form-error" role="alert">
          {lookupError}
        </p>
      )}

      {results.length > 0 && (
        <ul className="pos__results" data-testid="pos-results">
          {results.map((product) => (
            <li key={product.id} className="pos__result" data-testid={`pos-result-${product.id}`}>
              <ProductPicture imagePath={product.imagePath} name={product.name} />

              <span className="pos__result-name">{product.name}</span>

              <span className="pos__result-meta">
                {product.brand ?? 'Unbranded'} · {product.category}
              </span>

              {/* Priced for the sale type chosen at the top — a wholesale sale quotes the
                  wholesale price, resolved by the server, not worked out here. */}
              <span className="pos__result-price">{formatPkr(product.salePrice)}</span>

              {/* Said, never silent: a wholesale sale of a product with no wholesale price set is
                  charged the retail price, and the screen must not look like it ignored the choice. */}
              {product.quotedAtRetail && (
                <span className="badge badge--low pos__result-fallback">No wholesale price — retail rate</span>
              )}

              {/* The number this seller can sell from: the shelf at the counter, his own bag in the market. */}
              <span className="pos__result-stock">
                <StockCount product={product} />
              </span>

              <button
                type="button"
                onClick={() => {
                  addProduct(product);
                  setResults([]);
                  setTerm('');
                }}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
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
                <tr key={line.productId} data-testid={`cart-line-${line.productId}`}>
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

        {/* Payment moved into the checkout modal: who is paying and how is asked once, at the
            end, not while the cart is still being built. */}
        <dl className="pos__summary">
          <dt>Subtotal</dt>
          <dd data-testid="subtotal">{formatPkr(totals?.subtotal ?? 0)}</dd>

          <dt>Discount</dt>
          <dd data-testid="discount">{formatPkr(totals?.totalDiscount ?? 0)}</dd>

          <dt>Total</dt>
          <dd data-testid="total">{formatPkr(totals?.total ?? 0)}</dd>
        </dl>
      </div>

      {saveError && (
        <p className="form-error" role="alert">
          {saveError}
        </p>
      )}

      <div className="form-actions">
        <button type="button" onClick={() => setShowCheckout(true)} disabled={!totals || isSaving}>
          Proceed to sale
        </button>

        {/* Says why the button is unavailable. It is disabled whenever there is nothing to
            sell, which is the correct behaviour — but unexplained it reads as a fault, and
            that is precisely how the screen felt after a sale emptied the cart. */}
        {!totals && !isSaving && (
          <small className="field__hint" data-testid="save-hint">
            {lines.length === 0
              ? 'Scan or search for a product to start a sale.'
              : 'Check the cart — these totals are not valid yet.'}
          </small>
        )}
      </div>

      {showCheckout && totals && (
        <CheckoutModal
          total={totals.total}
          canSellOnCredit={canSellOnCredit}
          udhaarCustomersOnly={udhaarCustomersOnly}
          canTakePartPayment={canTakePartPayment}
          onSearchCustomers={onSearchCustomers}
          onCreateCustomer={onCreateCustomer}
          onConfirm={handleConfirm}
          onCancel={() => setShowCheckout(false)}
        />
      )}
    </section>
  );
}
