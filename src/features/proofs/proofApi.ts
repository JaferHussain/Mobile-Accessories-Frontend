import { api, fetchBlob, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';

/** The transactions that can carry a proof, as the server names them in the URL. */
export type ProofKind = 'sale' | 'customer-payment' | 'supplier-payment' | 'refund' | 'expense';

/** The ways money moves that leave a screenshot. Cash is its own proof. */
const TRANSFER_METHODS: readonly string[] = ['BankTransfer', 'JazzCash', 'EasyPaisa', 'Raast'];

/**
 * Whether a transaction paid this way takes a proof. Cash was counted into or out of the drawer;
 * Credit took no money; Partial is counted as cash at this counter.
 */
export function needsProof(method: string | null | undefined): boolean {
  return method != null && TRANSFER_METHODS.includes(method);
}

/** One non-cash transaction still without a proof — a line on the owner's list. */
export interface MissingProof {
  kind: 'Sale' | 'CustomerPayment' | 'SupplierPayment' | 'Refund' | 'Expense';
  referenceId: number;
  /** Invoice, receipt or return number; a supplier payment's note; an expense's category. */
  reference: string | null;
  entryDateUtc: string;
  /** Who the money came from or went to. Null for a walk-in sale. */
  party: string | null;
  method: string | null;
  amount: number;
}

/** The server's kind name to its URL name. */
export const PROOF_KIND_SLUGS: Record<MissingProof['kind'], ProofKind> = {
  Sale: 'sale',
  CustomerPayment: 'customer-payment',
  SupplierPayment: 'supplier-payment',
  Refund: 'refund',
  Expense: 'expense',
};

export const proofApi = {
  /** Attaches (or replaces) the screenshot behind one transaction. */
  attach(kind: ProofKind, id: number, picture: File): Promise<void> {
    const body = new FormData();
    body.append('file', picture);

    return unwrap(api.post<ApiEnvelope<unknown>>(`/proofs/${kind}/${id}`, body)).then(() => undefined);
  },

  /** The screenshot itself — raw bytes, no envelope, so `fetchBlob`. */
  view(kind: ProofKind, id: number): Promise<Blob> {
    return fetchBlob(api, `/proofs/${kind}/${id}`);
  },

  /** Admin only. Every non-cash transaction still without a proof, newest first. */
  missing(from?: string, to?: string): Promise<MissingProof[]> {
    return unwrap(api.get<ApiEnvelope<MissingProof[]>>('/proofs/missing', { params: { from, to } }));
  },
};
