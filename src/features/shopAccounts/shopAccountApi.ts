import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';
import type { PaymentMethod } from '@/features/pos/posApi';

/** What kind of account it is — which decides the payment methods it can carry. */
export type ShopAccountType = 'Bank' | 'JazzCash' | 'EasyPaisa';

export interface ShopAccount {
  id: number;
  /** What the owner calls it: "HBL Current", "JazzCash 0300". */
  name: string;
  accountType: ShopAccountType;
  accountNumber: string | null;
  accountTitle: string | null;
  /** False once hidden: kept for the payments that name it, offered for no new ones. */
  isActive: boolean;
}

export interface ShopAccountInput {
  name: string;
  accountType: ShopAccountType;
  accountNumber: string | null;
  accountTitle: string | null;
}

export const SHOP_ACCOUNT_TYPES: ReadonlyArray<{ value: ShopAccountType; label: string }> = [
  { value: 'Bank', label: 'Bank' },
  { value: 'JazzCash', label: 'JazzCash' },
  { value: 'EasyPaisa', label: 'EasyPaisa' },
];

/**
 * The accounts a payment made this way could have left. Mirrors the server's ShopAccountRules —
 * the server checks the choice regardless; this only keeps impossible accounts out of the list.
 */
export function accountsFor(accounts: ShopAccount[], method: PaymentMethod | ''): ShopAccount[] {
  const type: ShopAccountType | null =
    method === 'BankTransfer' || method === 'Raast'
      ? 'Bank'
      : method === 'JazzCash'
        ? 'JazzCash'
        : method === 'EasyPaisa'
          ? 'EasyPaisa'
          : null;

  return type === null ? [] : accounts.filter((account) => account.isActive && account.accountType === type);
}

/** "HBL Current · 8989" — the account as a dropdown shows it. */
export function accountLabel(account: ShopAccount): string {
  return account.accountNumber ? `${account.name} · ${account.accountNumber}` : account.name;
}

export const shopAccountApi = {
  list(includeInactive = false): Promise<ShopAccount[]> {
    return unwrap(api.get<ApiEnvelope<ShopAccount[]>>('/shop-accounts', { params: { includeInactive } }));
  },

  create(input: ShopAccountInput): Promise<ShopAccount> {
    return unwrap(api.post<ApiEnvelope<ShopAccount>>('/shop-accounts', input));
  },

  update(id: number, input: ShopAccountInput): Promise<ShopAccount> {
    return unwrap(api.put<ApiEnvelope<ShopAccount>>(`/shop-accounts/${id}`, input));
  },

  /** Hides it. Never deleted: past payments keep naming it. */
  retire(id: number): Promise<void> {
    return api.delete(`/shop-accounts/${id}`).then(() => undefined);
  },

  reactivate(id: number): Promise<ShopAccount> {
    return unwrap(api.post<ApiEnvelope<ShopAccount>>(`/shop-accounts/${id}/reactivate`, {}));
  },
};
