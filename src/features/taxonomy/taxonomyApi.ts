import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult } from '@/types/api';

/**
 * Categories and Brands.
 *
 * Two modules with the same shape, so they share this file rather than duplicating it. They stay
 * separate lists because the owner maintains them separately: "Cables" and "Samsung" answer
 * different questions about the same product.
 */
export interface TaxonomyItem {
  id: number;
  name: string;
  description?: string | null;
  isActive: boolean;
  /** How many products use it. Drives the warning before retiring one. */
  productCount: number;
  /**
   * Brands only: true for a locally made brand, false for an imported one (FR-087a). Absent on
   * categories, where "local" has no meaning.
   */
  isLocal?: boolean;
}

export interface TaxonomyUpsert {
  name: string;
  description?: string | null;
  /** Brands only. Omitted means Imported. */
  isLocal?: boolean;
}

export interface TaxonomySearchParams {
  search?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

function moduleFor(resource: 'categories' | 'brands') {
  return {
    search(params: TaxonomySearchParams = {}): Promise<PagedResult<TaxonomyItem>> {
      return unwrap(
        api.get<ApiEnvelope<PagedResult<TaxonomyItem>>>(`/${resource}`, { params }),
      );
    },

    get(id: number): Promise<TaxonomyItem> {
      return unwrap(api.get<ApiEnvelope<TaxonomyItem>>(`/${resource}/${id}`));
    },

    create(item: TaxonomyUpsert): Promise<TaxonomyItem> {
      return unwrap(api.post<ApiEnvelope<TaxonomyItem>>(`/${resource}`, item));
    },

    update(id: number, item: TaxonomyUpsert): Promise<TaxonomyItem> {
      return unwrap(api.put<ApiEnvelope<TaxonomyItem>>(`/${resource}/${id}`, item));
    },

    /** Retires it. Products already filed against it keep working. */
    deactivate(id: number): Promise<void> {
      return api.delete(`/${resource}/${id}`).then(() => undefined);
    },

    reactivate(id: number): Promise<void> {
      return api.post(`/${resource}/${id}/reactivate`).then(() => undefined);
    },
  };
}

export const categoryApi = moduleFor('categories');
export const brandApi = moduleFor('brands');
