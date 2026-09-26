import { beforeEach, describe, expect, it, vi } from 'vitest';
import { documentApi } from '@/features/documents/documentApi';
import { api, fetchBlob } from '@/api/client';

/**
 * The client's side of the document contract.
 *
 * <p>Thin on purpose: this module decides the URL and the shape of the request, and nothing else.
 * What a document may contain is a server property, asserted there.</p>
 *
 * <p><b>These URL assertions cannot catch a wrong URL on their own</b> — they only prove this
 * module sends what this file says it sends. They passed while every Print and Download 404'd.
 * The path that the server actually serves is pinned by ClientDocumentRouteTests on the backend,
 * which holds these same strings; change one and the other must change with it.</p>
 */

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');

  return {
    ...actual,
    api: { post: vi.fn(), get: vi.fn() },
    fetchBlob: vi.fn(),
  };
});

const pdf = () => new Blob([new Uint8Array([0x25])], { type: 'application/pdf' });

const shareEnvelope = (data: unknown) => ({ data: { success: true, data, error: null } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchBlob).mockResolvedValue(pdf());
});

describe('documentApi documents', () => {
  it('fetches an invoice PDF as bytes', async () => {
    const blob = await documentApi.invoicePdf(7);

    expect(fetchBlob).toHaveBeenCalledWith(api, '/invoices/7/pdf');
    expect(blob).toBeInstanceOf(Blob);
  });

  it('fetches a payment receipt PDF as bytes', async () => {
    await documentApi.paymentReceiptPdf(12);

    expect(fetchBlob).toHaveBeenCalledWith(api, '/customer-payments/12/pdf');
  });
});

describe('documentApi share links', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockResolvedValue(
      shareEnvelope({
        shareUrl: 'https://shop/api/public/documents/tok',
        whatsAppUrl: 'https://wa.me/923001234567?text=x',
        smsUrl: 'sms:+923001234567?body=x',
        expiresAtUtc: '2026-10-23T12:00:00Z',
      }) as never,
    );
  });

  it('creates a share link for a document', async () => {
    const link = await documentApi.createShareLink('Invoice', 77);

    expect(api.post).toHaveBeenCalledWith('/documents/share-link', {
      documentType: 'Invoice',
      referenceId: 77,
      mobileNumber: null,
    });
    expect(link.smsUrl).toBe('sms:+923001234567?body=x');
  });

  it('passes a typed number for a walk-in, who has no record to read one from', async () => {
    await documentApi.createShareLink('Invoice', 77, '03001234567');

    expect(api.post).toHaveBeenCalledWith('/documents/share-link', {
      documentType: 'Invoice',
      referenceId: 77,
      mobileNumber: '03001234567',
    });
  });

  it('sends a blank number as null, so "not given" is one value and not two', async () => {
    await documentApi.createShareLink('Invoice', 77, '   ');

    expect(api.post).toHaveBeenCalledWith(
      '/documents/share-link',
      expect.objectContaining({ mobileNumber: null }),
    );
  });

  it('returns both send channels and the expiry the server decided', async () => {
    const link = await documentApi.createShareLink('PaymentReceipt', 5);

    // The expiry is shown to the shopkeeper rather than hardcoded — the lifetime is a server
    // setting, and a hardcoded "30 days" would diverge the moment it changed.
    expect(link.expiresAtUtc).toBe('2026-10-23T12:00:00Z');
    expect(link.whatsAppUrl).toBe('https://wa.me/923001234567?text=x');
  });
});
