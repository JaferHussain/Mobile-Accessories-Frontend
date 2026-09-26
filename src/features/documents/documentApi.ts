import { api, fetchBlob, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';

/** What a share link points at. One link resolves to exactly one of these. */
export type DocumentType = 'Invoice' | 'PaymentReceipt';

export interface ShareLink {
  shareUrl: string;
  /** Null when there is no usable number — the screen then disables sending and says why. */
  whatsAppUrl: string | null;
  /** The same link through the device's own SMS app. Null under the same condition. */
  smsUrl: string | null;
  /** Decided by the server. Shown to the shopkeeper rather than hardcoded. */
  expiresAtUtc: string;
}

/**
 * Reaching the documents a customer is entitled to.
 *
 * <p>Deliberately thin: this module decides the URL and the shape of the request, nothing more.
 * What a document may contain is a property of the server and is asserted there — a client-side
 * check would only prove that today's screen happens not to ask for the wrong thing.</p>
 *
 * <p>PDFs go through <code>fetchBlob</code>, never <code>unwrap</code>: they are raw bytes with
 * no response envelope.</p>
 */
/**
 * One share link, as the owner sees it when deciding what to withdraw.
 *
 * <b>No token here, ever.</b> Only the hash is stored, and showing a live link on an
 * authenticated screen would turn a bystander into a link holder. Revoke by id.
 */
export interface ShareLinkSummary {
  id: number;
  createdAtUtc: string;
  createdByUserName: string;
  expiresAtUtc: string;
  revokedAtUtc: string | null;
  /** Null when never opened — itself the answer to "did this get out?". */
  lastAccessedAtUtc: string | null;
  accessCount: number;
  isUsable: boolean;
}

export const documentApi = {
  invoicePdf(invoiceId: number): Promise<Blob> {
    // NOT /documents/invoices/... — the PDF routes have sat directly under /api since feature
    // 001, and it was this client that was written against a contract document that never
    // matched them. ClientDocumentRouteTests holds these exact strings.
    return fetchBlob(api, `/invoices/${invoiceId}/pdf`);
  },

  paymentReceiptPdf(paymentId: number): Promise<Blob> {
    return fetchBlob(api, `/customer-payments/${paymentId}/pdf`);
  },

  /**
   * Mints a link to one document, and the two deep links that carry it.
   *
   * <p><code>mobileNumber</code> is for a <b>walk-in</b> — a sale with no customer, which is most
   * counter sales. Without it those customers could never be sent their own bill. The server uses
   * it only when the document has no number on file, so a stored number is never silently
   * overridden, and it is not kept afterwards.</p>
   */
  createShareLink(
    documentType: DocumentType,
    referenceId: number,
    mobileNumber?: string | null,
  ): Promise<ShareLink> {
    return unwrap(
      api.post<ApiEnvelope<ShareLink>>('/documents/share-link', {
        documentType,
        referenceId,
        // Blank and whitespace both mean "not given", sent as null so the server sees one value
        // rather than two.
        mobileNumber: mobileNumber?.trim() || null,
      }),
    );
  },

  /** Admin only. What is still outstanding for one document. */
  listShareLinks(documentType: DocumentType, referenceId: number): Promise<ShareLinkSummary[]> {
    return unwrap(
      api.get<ApiEnvelope<ShareLinkSummary[]>>('/documents/share-links', {
        params: { documentType, referenceId },
      }),
    );
  },

  /** Admin only. Idempotent — a second call returns the original revocation time. */
  revokeShareLink(shareLinkId: number): Promise<ShareLinkSummary> {
    return unwrap(
      api.post<ApiEnvelope<ShareLinkSummary>>(`/documents/share-links/${shareLinkId}/revoke`, {}),
    );
  },
};
