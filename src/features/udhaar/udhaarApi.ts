import { api, fetchBlob, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';

/**
 * A customer's udhaar standing. Says whether each side of the ID card is on file, never where —
 * the photos themselves only ever come through {@link udhaarApi.idCard}. Owner only.
 */
export interface UdhaarCustomer {
  id: number;
  name: string;
  mobileNumber: string | null;
  outstandingBalance: number;
  isUdhaarCustomer: boolean;
  hasIdCardFront: boolean;
  hasIdCardBack: boolean;
  /** Marked before ID cards were asked for — still eligible, but the card should be completed. */
  idCardMissing: boolean;
}

export type IdCardSide = 'front' | 'back';

export interface NewUdhaarCustomer {
  name: string;
  mobileNumber: string;
  idCardFront: File;
  idCardBack: File;
}

/** For an existing customer: a side already on file need not be sent again. */
export interface UdhaarRegistration {
  mobileNumber?: string | null;
  idCardFront?: File | null;
  idCardBack?: File | null;
}

function form(fields: Record<string, string | File | null | undefined>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined && value !== '') {
      data.append(key, value);
    }
  }

  return data;
}

export const udhaarApi = {
  list(search?: string): Promise<UdhaarCustomer[]> {
    return unwrap(api.get<ApiEnvelope<UdhaarCustomer[]>>('/udhaar-customers', { params: { search: search || undefined } }));
  },

  status(customerId: number): Promise<UdhaarCustomer> {
    return unwrap(api.get<ApiEnvelope<UdhaarCustomer>>(`/udhaar-customers/${customerId}`));
  },

  register(customer: NewUdhaarCustomer): Promise<UdhaarCustomer> {
    return unwrap(api.post<ApiEnvelope<UdhaarCustomer>>('/udhaar-customers', form({ ...customer })));
  },

  registerExisting(customerId: number, registration: UdhaarRegistration): Promise<UdhaarCustomer> {
    return unwrap(
      api.post<ApiEnvelope<UdhaarCustomer>>(`/udhaar-customers/${customerId}/register`, form({ ...registration })),
    );
  },

  /** Takes the mark away. What they owe is untouched; the ID card is kept as evidence. */
  remove(customerId: number): Promise<UdhaarCustomer> {
    return unwrap(api.delete<ApiEnvelope<UdhaarCustomer>>(`/udhaar-customers/${customerId}`));
  },

  /** One side of the ID card, streamed to a signed-in owner — never a link to the file. */
  idCard(customerId: number, side: IdCardSide): Promise<Blob> {
    return fetchBlob(api, `/udhaar-customers/${customerId}/id-card/${side}`);
  },
};
