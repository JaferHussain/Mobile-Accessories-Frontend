import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult } from '@/types/api';

/** Staff shape. An Admin response additionally carries the cost fields below. */
export interface Product {
  id: number;
  name: string;
  categoryId: number;
  /** The category's name, resolved by the server for display. */
  category: string;
  brandId?: number | null;
  brand?: string | null;
  /** Whether the brand is marked local. False for an unbranded product. */
  brandIsLocal?: boolean;
  model?: string | null;
  barcode?: string | null;
  imagePath?: string | null;
  /**
   * The price that applies to THIS request — retailPrice or wholesalePrice, whichever the
   * saleType asked for. Resolved by the server per request; it is not a stored column.
   */
  salePrice: number;
  /** What the shop OWNS — shelf and salesmen's bags together. Low stock is judged on this. */
  quantityOnHand: number;
  /** On the shelf: what the counter can sell. Owned, less what salesmen carry. */
  atShop?: number;
  /** Carried by field salesmen between them. */
  withSalesmen?: number;
  /** For a field salesman only: what HE carries — all he can sell. Null for everyone else. */
  inYourBag?: number | null;
  /**
   * A wholesale quote that fell back to the retail price — the product has no wholesale price set.
   * Says only THAT it fell back, never the wholesale price itself.
   */
  quotedAtRetail?: boolean;
  isLowStock: boolean;
  isActive: boolean;

  // Present only for an Admin (FR-040).
  // The shop's three stored prices. Admin only — a Staff principal receives `salePrice` alone,
  // so the salesman is told the one price that applies rather than handed the price list.
  /** What we paid the supplier. */
  costPrice?: number;
  /** What a bulk buyer pays. */
  wholesalePrice?: number;
  /** What a walk-in pays. */
  retailPrice?: number;
  minStockThreshold?: number;
  supplierId?: number | null;
  supplierName?: string | null;
}

export interface ProductSearchParams {
  search?: string;
  categoryId?: number;
  brandId?: number;
  /** Which price to quote. 'Wholesale' returns the wholesale price as salePrice. */
  saleType?: 'Retail' | 'Wholesale';
  /** Only products whose brand is marked local. Unbranded products are never included. */
  localOnly?: boolean;
  lowStockOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductUpsert {
  name: string;
  /** Chosen from the Categories module. Free text is no longer accepted. */
  categoryId: number;
  /** Chosen from the Brands module, or null for unbranded stock. */
  brandId?: number | null;
  model?: string | null;
  barcode?: string | null;
  minStockThreshold: number;
  supplierId?: number | null;

  // No prices and no quantity. A product is a catalogue entry — what the thing IS. What it
  // costs, what it sells for and how many are on the shelf all arrive with its first purchase,
  // and the server refuses to take them here.
}

export const productApi = {
  search(params: ProductSearchParams = {}): Promise<PagedResult<Product>> {
    return unwrap(api.get<ApiEnvelope<PagedResult<Product>>>('/products', { params }));
  },

  get(id: number, saleType: 'Retail' | 'Wholesale' = 'Retail'): Promise<Product> {
    return unwrap(api.get<ApiEnvelope<Product>>(`/products/${id}`, { params: { saleType } }));
  },

  byBarcode(barcode: string, saleType: 'Retail' | 'Wholesale' = 'Retail'): Promise<Product> {
    return unwrap(
      api.get<ApiEnvelope<Product>>(`/products/by-barcode/${encodeURIComponent(barcode)}`, {
        params: { saleType },
      }),
    );
  },

  create(product: ProductUpsert): Promise<Product> {
    return unwrap(api.post<ApiEnvelope<Product>>('/products', product));
  },

  update(id: number, product: ProductUpsert): Promise<Product> {
    return unwrap(api.put<ApiEnvelope<Product>>(`/products/${id}`, product));
  },

  deactivate(id: number): Promise<void> {
    return api.delete(`/products/${id}`).then(() => undefined);
  },

  /**
   * Deletes the product from the database for good. The server refuses (422) one with stock or
   * any sales, purchase or stock history — that one is retired instead.
   */
  remove(id: number): Promise<void> {
    return api.delete(`/products/${id}/permanent`).then(() => undefined);
  },

  /**
   * Attaches a picture to a product that already exists — the upload is addressed to its id,
   * so this always follows a create or update, never accompanies one. The server generates the
   * thumbnail and removes any previous picture.
   */
  uploadImage(id: number, picture: File): Promise<{ productId: number; imagePath: string }> {
    const body = new FormData();
    body.append('file', picture);

    return unwrap(
      api.post<ApiEnvelope<{ productId: number; imagePath: string }>>(
        `/products/${id}/image`,
        body,
      ),
    );
  },
};
