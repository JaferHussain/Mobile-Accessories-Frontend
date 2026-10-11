import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';

/** A product in the salesman's bag, at the shop's retail price. Never cost or wholesale. */
export interface MyProduct {
  productId: number;
  productName: string;
  quantity: number;
  price: number;
  value: number;
  /** The fixed commission the owner promised on each unit. 0 = none. */
  commissionPerUnit?: number;
}

/** One product he sold in the period, net of returns, after the bill discount. */
export interface MySoldProduct {
  productId: number;
  productName: string;
  quantitySold: number;
  amount: number;
}

export interface MyProducts {
  assigned: MyProduct[];
  assignedUnits: number;
  assignedValue: number;
  sold: MySoldProduct[];
  soldUnits: number;
  soldAmount: number;
}

export const myProductsApi = {
  /** Always the signed-in person's own. `from`/`to` are shop days; today when left out. */
  mine(from?: string, to?: string): Promise<MyProducts> {
    return unwrap(api.get<ApiEnvelope<MyProducts>>('/my-products', { params: { from, to } }));
  },
};
