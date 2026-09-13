import { PosScreen } from './PosScreen';
import { posApi, type CreateInvoicePayload, type SaleType } from './posApi';
import { productApi, type Product } from '@/features/products/productApi';
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
  const { isAdmin } = useAuth();

  async function findProduct(term: string, saleType: SaleType): Promise<Product | null> {
    // A scanner produces an exact barcode, so try that first — it is unambiguous. The sale type
    // travels with the lookup so the price quoted is the one this sale will charge.
    try {
      return await productApi.byBarcode(term, saleType);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
    }

    const page = await productApi.search({ search: term, saleType, pageSize: 1 });

    return page.items[0] ?? null;
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
      canSellOnCredit={isAdmin}
    />
  );
}
