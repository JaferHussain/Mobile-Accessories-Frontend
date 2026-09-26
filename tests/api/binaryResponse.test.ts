import { beforeEach, describe, expect, it } from 'vitest';
import type { AxiosAdapter, AxiosRequestConfig } from 'axios';
import { createApiClient, fetchBlob } from '@/api/client';
import { tokenStore } from '@/api/tokenStore';
import { ApiError } from '@/types/api';

/**
 * Fetching a PDF through the client every screen already uses.
 *
 * <p>The client sets <code>Content-Type: application/json</code> and <code>unwrap</code> reads
 * <code>response.data.success</code>. A PDF is raw bytes with no envelope, so
 * <code>.success</code> is <code>undefined</code> and every document fetch would be reported as a
 * server failure — on a response that arrived perfectly.</p>
 *
 * <p>This is the mirror image of a trap this codebase already documents: posting FormData needed
 * the JSON Content-Type deleted, or multipart uploads lost their boundary and the server answered
 * 415. Binary <b>responses</b> need the same care in the other direction.</p>
 */

interface Recorded {
  url?: string;
  responseType?: string;
  headers: Record<string, unknown>;
}

function blobAdapter(
  scripted: { status: number; body: unknown },
): { adapter: AxiosAdapter; calls: Recorded[] } {
  const calls: Recorded[] = [];

  const adapter: AxiosAdapter = async (config: AxiosRequestConfig) => {
    calls.push({
      url: config.url,
      responseType: config.responseType,
      headers: JSON.parse(JSON.stringify(config.headers ?? {})),
    });

    const response = {
      data: scripted.body,
      status: scripted.status,
      statusText: '',
      headers: {},
      config: config as never,
    };

    if (scripted.status >= 400) {
      const error = new Error('Request failed') as Error & {
        response?: unknown;
        config?: unknown;
        isAxiosError: boolean;
      };
      error.isAxiosError = true;
      error.response = response;
      error.config = config;
      throw error;
    }

    return response as never;
  };

  return { adapter, calls };
}

const pdf = () => new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });

describe('fetching a document', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
  });

  it('returns the bytes instead of trying to unwrap an envelope', async () => {
    const { adapter } = blobAdapter({ status: 200, body: pdf() });
    const client = createApiClient({ adapter });

    const blob = await fetchBlob(client, '/documents/invoices/7/pdf');

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(4);
  });

  it('asks the transport for a blob, not for parsed JSON', async () => {
    const { adapter, calls } = blobAdapter({ status: 200, body: pdf() });
    const client = createApiClient({ adapter });

    await fetchBlob(client, '/documents/invoices/7/pdf');

    // Without this, the transport parses the bytes as text and the PDF is corrupted before
    // anything downstream gets a chance to be wrong.
    expect(calls[0]?.responseType).toBe('blob');
  });

  it('still carries the bearer token — a document is not public', async () => {
    tokenStore.setAccessToken('token-abc');
    const { adapter, calls } = blobAdapter({ status: 200, body: pdf() });
    const client = createApiClient({ adapter });

    await fetchBlob(client, '/documents/invoices/7/pdf');

    expect(calls[0]?.headers.Authorization).toBe('Bearer token-abc');
  });

  it('reports a refusal as an ApiError rather than handing back an error page as a PDF', async () => {
    // The server answers a failed document request with the ordinary JSON envelope, which
    // arrives as a Blob because that is what we asked for. Handed on unread, the shopkeeper
    // would "download" a file containing an error message.
    const envelope = new Blob(
      [JSON.stringify({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'No such invoice.' } })],
      { type: 'application/json' },
    );

    const { adapter } = blobAdapter({ status: 404, body: envelope });
    const client = createApiClient({ adapter });

    await expect(fetchBlob(client, '/documents/invoices/999/pdf')).rejects.toBeInstanceOf(ApiError);
  });

  it('carries the server message through, so the screen can say what went wrong', async () => {
    const envelope = new Blob(
      [JSON.stringify({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'No such invoice.' } })],
      { type: 'application/json' },
    );

    const { adapter } = blobAdapter({ status: 404, body: envelope });
    const client = createApiClient({ adapter });

    await expect(fetchBlob(client, '/documents/invoices/999/pdf')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'No such invoice.',
    });
  });
});
