import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult } from '@/types/api';

export interface InvoiceItemForReturn {
  id: number;
  productName: string;
  quantity: number;
  returnedQty: number;
  unitSalePrice: number;
}

export interface InvoiceForReturn {
  invoice: {
    id: number;
    invoiceNumber: string;
    amountRemaining: number;
  };
  items: InvoiceItemForReturn[];
}

export interface PurchaseForReturn {
  id: number;
  productId: number;
  quantity: number;
  returnedQty: number;
  unitCost: number;
}

export interface SaleReturnRow {
  returnId: number;
  returnNumber: string;
  returnDateUtc: string;
  invoiceId: number;
  invoiceNumber: string;
  productName: string;
  quantity: number;
  /** What the goods were billed at. */
  billedTotal: number;
  /** The adjustment between billed and refunded. */
  discountTotal: number;
  /** What was actually given back. */
  lineTotal: number;
  refundDue: number;
  reason: string | null;
}

export interface PurchaseReturnRow {
  returnId: number;
  returnNumber: string;
  returnDateUtc: string;
  supplierId: number;
  supplierName: string;
  productName: string;
  quantity: number;
  total: number;
  reason: string | null;
}

/**
 * "Return item": a returnable sale line found by product name, no invoice number needed.
 *
 * Every amount arrives already worked out by the server (`ReturnableSaleLine`), so what the
 * screen shows is exactly what the return will pay. The client never re-derives a price.
 */
export interface ReturnableLine {
  invoiceId: number;
  invoiceNumber: string;
  invoiceItemId: number;
  productName: string;
  /** How many were sold on this line. */
  quantitySold: number;
  /** How many have already come back. */
  quantityReturned: number;
  /** How many can still be returned. */
  quantityAvailable: number;
  /** What the receipt shows per unit, before any discount. */
  unitSalePrice: number;
  /** What one unit is worth back — the billed price less its share of the invoice's discount. */
  refundPerUnit: number;
  /** Billed price less refund price. Zero on an undiscounted sale. */
  discountPerUnit: number;
  /** Returning everything still available is worth this much. */
  maxRefund: number;
  /** Still owed on the sale — decides refund versus balance reduction. */
  amountRemaining: number;
}

/** What the confirmation popup names — the exact product and its updated stock. */
export interface ReturnedProductUpdate {
  productName: string;
  newQuantityOnHand: number;
}

export interface SaleReturnResult {
  returnId: number;
  returnNumber: string;
  /** What the returned goods were listed at. */
  totalBilled: number;
  /** The adjustment the shopkeeper explains to the customer. */
  totalDiscount: number;
  /** What is actually given back. */
  totalReturned: number;
  refundDue: number;
  customerBalance: number | null;
  items: ReturnedProductUpdate[];
}

export interface PurchaseReturnResult {
  returnId: number;
  returnNumber: string;
  productName: string;
  totalReturned: number;
  newQuantityOnHand: number;
  newSupplierPayable: number;
}

export const returnApi = {
  /** Looked up by id — the number printed on the receipt the customer brings back. */
  getInvoice(invoiceId: number): Promise<InvoiceForReturn> {
    return unwrap(api.get<ApiEnvelope<InvoiceForReturn>>(`/invoices/${invoiceId}`));
  },

  /** "Return item": find a returnable sale by product name instead of an invoice number. */
  findReturnableLines(search: string): Promise<ReturnableLine[]> {
    return unwrap(api.get<ApiEnvelope<ReturnableLine[]>>('/sale-returns/find', { params: { search } }));
  },

  recordSaleReturn(
    invoiceId: number,
    items: Array<{ invoiceItemId: number; quantity: number }>,
    reason: string | null,
  ): Promise<SaleReturnResult> {
    return unwrap(
      api.post<ApiEnvelope<SaleReturnResult>>('/sale-returns', { invoiceId, items, reason }),
    );
  },

  /** The general/detail history of customer returns — product, quantity, value, refund. */
  listSaleReturns(): Promise<PagedResult<SaleReturnRow>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<SaleReturnRow>>>('/sale-returns', {
        params: { pageSize: 50 },
      }),
    );
  },

  /**
   * The history of returns to suppliers. Scoped to one supplier when given — the everyday
   * case, since a return goes back to whichever supplier the goods came from.
   */
  listPurchaseReturns(supplierId?: number): Promise<PagedResult<PurchaseReturnRow>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<PurchaseReturnRow>>>('/purchase-returns', {
        params: { supplierId, pageSize: 50 },
      }),
    );
  },

  /** Admin-only on the server — this route exposes cost and supplier payables. */
  recordPurchaseReturn(
    purchaseId: number,
    quantity: number,
    reason: string | null,
  ): Promise<PurchaseReturnResult> {
    return unwrap(
      api.post<ApiEnvelope<PurchaseReturnResult>>('/purchase-returns', {
        purchaseId,
        quantity,
        reason,
      }),
    );
  },
};
