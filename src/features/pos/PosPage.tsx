import { useLocation, useNavigate } from 'react-router-dom';
import { PosScreen } from './PosScreen';
import {
  MAX_SEARCH_RESULTS,
  posApi,
  type CreateInvoicePayload,
  type ProductLookup,
  type SaleType,
} from './posApi';
import { productApi } from '@/features/products/productApi';
import { documentApi } from '@/features/documents/documentApi';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/types/api';

/**
 * Wires the counter to the API.
 *
 * A fresh idempotency key per save protects against a double-tap creating two sales; the server
 * returns the original invoice if the same key arrives twice.
 */
export function PosPage() {
  // Only the owner may let goods leave against a debt (FR-051). The server enforces this too.
  const { isAdmin, user } = useAuth();

  // The Products screen's Sell button hands over what to look up via navigation state, so the
  // salesman does not have to type it again. Read once, at the price this history entry was
  // created — a later re-render of this same page (a re-price, a save) must not use the state
  // to search a second time.
  const prefillTerm = (useLocation().state as { prefillTerm?: string } | null)?.prefillTerm;

  const navigate = useNavigate();

  async function findProduct(term: string, saleType: SaleType): Promise<ProductLookup> {
    // A scanner produces an exact barcode, so try that first — it is unambiguous. The sale type
    // travels with the lookup so the price quoted is the one this sale will charge.
    try {
      return { kind: 'barcode', product: await productApi.byBarcode(term, saleType) };
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
    }

    try {
      // Several candidates, not one: a typed search among look-alike stock is a guess, and the
      // salesman is the one who can see which item the customer is holding.
      const page = await productApi.search({
        search: term,
        saleType,
        pageSize: MAX_SEARCH_RESULTS,
      });

      return { kind: 'matches', products: page.items };
    } catch (error) {
      // The server refuses a search made only of one-letter words. At the counter that is a
      // scanner or stray key press producing something that is not a product, so the honest
      // answer is "No product found" rather than a validation message. Anything else — a real
      // failure — still surfaces.
      if (error instanceof ApiError && error.status === 400 && error.code === 'VALIDATION_FAILED') {
        return { kind: 'matches', products: [] };
      }

      throw error;
    }
  }

  async function repriceProduct(productId: number, saleType: SaleType): Promise<number | null> {
    const product = await productApi.get(productId, saleType);

    return product.salePrice;
  }

  function save(payload: CreateInvoicePayload) {
    return posApi.createInvoice(payload, crypto.randomUUID());
  }

  async function createCustomer(name: string, mobileNumber: string | null) {
    const customer = await posApi.createCustomer(name, mobileNumber);

    return { id: customer.id, name: customer.name };
  }

  return (
    <PosScreen
      onFindProduct={findProduct}
      onRepriceProduct={repriceProduct}
      onSave={save}
      onCreateCustomer={createCustomer}
      onSearchCustomers={posApi.searchCustomers}
      canSellOnCredit={isAdmin}
      // The salesman in the market may give udhaar — but only to the owner's udhaar customers.
      udhaarCustomersOnly={user?.job === 'FieldSales'}
      // The shopkeeper at the counter may take part payments — the owner's decision.
      canTakePartPayment={!isAdmin && user?.job !== 'FieldSales'}
      initialTerm={prefillTerm}
      onUploadPaymentProof={posApi.uploadPaymentProof}
      onBrowseProducts={() => navigate('/products')}
      // The customer is still at the counter — this is the moment to hand over the bill.
      onFetchDocument={(_documentType, referenceId) => documentApi.invoicePdf(referenceId)}
      onCreateShareLink={documentApi.createShareLink}
    />
  );
}
