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
  salePrice: number;
  quantityOnHand: number;
  isLowStock: boolean;
  isActive: boolean;

  // Present only for an Admin (FR-040).
  costPrice?: number;
  wholesalePrice?: number;
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
  costPrice: number;
  wholesalePrice: number;
  retailPrice: number;
  salePrice: number;
  quantityOnHand: number;
  minStockThreshold: number;
  supplierId?: number | null;
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
};
