import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter, AxiosRequestConfig } from 'axios';
import { createApiClient, unwrap } from '@/api/client';
import { tokenStore } from '@/api/tokenStore';
import { ApiError, type ApiEnvelope } from '@/types/api';

/**
 * T035 — the client every screen talks through: it must attach the token, unwrap the envelope,
 * turn failures into ApiError, and renew an expired session without bouncing the shopkeeper
 * back to the login screen mid-sale.
 */

interface Recorded {
  url?: string;
  headers: Record<string, unknown>;
  body: unknown;
}

/** Builds a fake transport that replies with a scripted queue of responses. */
function scriptedAdapter(
  responses: Array<{ status: number; body: unknown }>,
): { adapter: AxiosAdapter; calls: Recorded[] } {
  const calls: Recorded[] = [];
  let index = 0;

  const adapter: AxiosAdapter = async (config: AxiosRequestConfig) => {
    calls.push({
      url: config.url,
      headers: JSON.parse(JSON.stringify(config.headers ?? {})),
      body: config.data ? JSON.parse(config.data as string) : undefined,
    });

    const scripted = responses[Math.min(index, responses.length - 1)];
    index += 1;

    const response = {
      data: scripted!.body,
      status: scripted!.status,
      statusText: '',
      headers: {},
      config: config as never,
    };

    if (scripted!.status >= 400) {
      // Axios attaches `config` to real transport errors; the interceptor needs it to retry.
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

const ok = <T,>(data: T): ApiEnvelope<T> => ({ success: true, data, error: null });

const fail = (code: string, message: string, details: unknown = null): ApiEnvelope<never> =>
  ({ success: false, data: null, error: { code, message, details, traceId: 'trace-1' } }) as never;

describe('createApiClient', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
  });

  it('unwraps a successful envelope to its data', async () => {
    const { adapter } = scriptedAdapter([{ status: 200, body: ok({ id: 7, name: 'Cable' }) }]);
    const client = createApiClient({ adapter });

    const result = await unwrap(client.get('/products/7'));

    expect(result).toEqual({ id: 7, name: 'Cable' });
  });

  it('lets axios set its own multipart boundary for a FormData body', async () => {
    // The client defaults every request to application/json. A picture upload sends FormData,
    // and that fixed header used to travel with it — the server received a body it could not
    // parse and refused it with 415, which is the bug this guards.
    const seen: AxiosRequestConfig[] = [];
    const adapter: AxiosAdapter = async (config) => {
      seen.push(config);

      return {
        data: ok(null),
        status: 200,
        statusText: '',
        headers: {},
        config: config as never,
      };
    };

    const body = new FormData();
    body.append('file', new Blob(['x']), 'photo.jpg');

    await unwrap(createApiClient({ adapter }).post('/products/6/image', body));

    const contentType = seen[0]!.headers?.get
      ? (seen[0]!.headers as unknown as Headers).get('Content-Type')
      : (seen[0]!.headers as Record<string, unknown> | undefined)?.['Content-Type'];

    // Axios (or the browser, under jsdom) fills this in with the boundary once the fixed
    // default is out of the way — the point is that the client no longer forces it to JSON.
    expect(contentType).not.toBe('application/json');
  });

  it('attaches the bearer token when signed in', async () => {
    tokenStore.setAccessToken('token-abc');
    const { adapter, calls } = scriptedAdapter([{ status: 200, body: ok(null) }]);

    await unwrap(createApiClient({ adapter }).get('/products'));

    expect(calls[0]!.headers['Authorization']).toBe('Bearer token-abc');
  });

  it('sends no Authorization header when signed out', async () => {
    const { adapter, calls } = scriptedAdapter([{ status: 200, body: ok(null) }]);

    await unwrap(createApiClient({ adapter }).get('/products'));

    expect(calls[0]!.headers['Authorization']).toBeUndefined();
  });

  it('turns a failure envelope into an ApiError carrying the code', async () => {
    const { adapter } = scriptedAdapter([
      { status: 400, body: fail('INSUFFICIENT_STOCK', 'Not enough stock for Cable.') },
    ]);

    await expect(unwrap(createApiClient({ adapter }).post('/invoices'))).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      status: 400,
    });
  });

  it('exposes field-level validation details', async () => {
    const { adapter } = scriptedAdapter([
      {
        status: 400,
        body: fail('VALIDATION_FAILED', 'One or more fields are invalid.', [
          { field: 'salePrice', message: 'Must be zero or greater.' },
        ]),
      },
    ]);

    try {
      await unwrap(createApiClient({ adapter }).post('/products'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).fieldError('salePrice')).toBe('Must be zero or greater.');
    }
  });

  it('reports a network failure as an ApiError rather than a raw axios error', async () => {
    const adapter: AxiosAdapter = async () => {
      throw new Error('Network Error');
    };

    await expect(unwrap(createApiClient({ adapter }).get('/products'))).rejects.toBeInstanceOf(ApiError);
  });

  it('surfaces a 403 as FORBIDDEN so the UI can explain the refusal', async () => {
    const { adapter } = scriptedAdapter([
      { status: 403, body: fail('FORBIDDEN', 'Admin access is required.') },
    ]);

    await expect(unwrap(createApiClient({ adapter }).get('/reports/profit'))).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });
});

describe('token refresh', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
  });

  it('renews an expired access token and retries the original request once', async () => {
    tokenStore.setAccessToken('expired-token');
    tokenStore.setRefreshToken('refresh-1');

    const { adapter, calls } = scriptedAdapter([
      { status: 401, body: fail('UNAUTHENTICATED', 'Token expired.') },
      {
        status: 200,
        body: ok({
          accessToken: 'fresh-token',
          refreshToken: 'refresh-2',
          expiresAt: '2026-09-09T12:00:00Z',
          user: { id: 1, username: 'admin', fullName: 'Owner', role: 'Admin' },
        }),
      },
      { status: 200, body: ok({ id: 7 }) },
    ]);

    const result = await unwrap(createApiClient({ adapter }).get('/products/7'));

    expect(result).toEqual({ id: 7 });
    expect(calls[1]!.url).toContain('/auth/refresh');
    expect(calls[2]!.headers['Authorization']).toBe('Bearer fresh-token');
    expect(tokenStore.getRefreshToken()).toBe('refresh-2');
  });

  it('clears the session when the refresh is also rejected', async () => {
    tokenStore.setAccessToken('expired-token');
    tokenStore.setRefreshToken('refresh-1');

    const { adapter } = scriptedAdapter([
      { status: 401, body: fail('UNAUTHENTICATED', 'Token expired.') },
      { status: 401, body: fail('UNAUTHENTICATED', 'Please sign in again.') },
    ]);

    await expect(unwrap(createApiClient({ adapter }).get('/products'))).rejects.toBeInstanceOf(ApiError);

    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getRefreshToken()).toBeNull();
  });

  it('does not attempt a refresh when there is no refresh token', async () => {
    const { adapter, calls } = scriptedAdapter([
      { status: 401, body: fail('UNAUTHENTICATED', 'Sign in required.') },
    ]);

    await expect(unwrap(createApiClient({ adapter }).get('/products'))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });

    expect(calls).toHaveLength(1);
  });

  it('does not try to refresh a failed login', async () => {
    tokenStore.setRefreshToken('refresh-1');

    const { adapter, calls } = scriptedAdapter([
      { status: 401, body: fail('UNAUTHENTICATED', 'Incorrect username or password.') },
    ]);

    await expect(
      unwrap(createApiClient({ adapter }).post('/auth/login', { username: 'a', password: 'b' })),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    // Refreshing here would mask a genuinely wrong password.
    expect(calls).toHaveLength(1);
  });

  it('notifies the application when the session ends', async () => {
    tokenStore.setAccessToken('expired-token');
    tokenStore.setRefreshToken('refresh-1');
    const onSessionExpired = vi.fn();

    const { adapter } = scriptedAdapter([
      { status: 401, body: fail('UNAUTHENTICATED', 'Token expired.') },
      { status: 401, body: fail('UNAUTHENTICATED', 'Please sign in again.') },
    ]);

    await expect(
      unwrap(createApiClient({ adapter, onSessionExpired }).get('/products')),
    ).rejects.toBeInstanceOf(ApiError);

    expect(onSessionExpired).toHaveBeenCalledOnce();
  });
});

describe('tokenStore', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
  });

  it('keeps the access token in memory only', () => {
    tokenStore.setAccessToken('secret');

    expect(tokenStore.getAccessToken()).toBe('secret');
    expect(window.localStorage.getItem('moizpos.accessToken')).toBeNull();
  });

  it('persists the refresh token and user across a reload', () => {
    tokenStore.setRefreshToken('refresh-1');
    tokenStore.setUser({ id: 1, username: 'admin', fullName: 'Owner', role: 'Admin' });

    expect(tokenStore.getRefreshToken()).toBe('refresh-1');
    expect(tokenStore.getUser()?.role).toBe('Admin');
  });

  it('treats a corrupted stored user as signed out', () => {
    window.localStorage.setItem('moizpos.user', '{not valid json');

    expect(tokenStore.getUser()).toBeNull();
  });

  it('clear removes everything', () => {
    tokenStore.setAccessToken('a');
    tokenStore.setRefreshToken('b');
    tokenStore.setUser({ id: 1, username: 'admin', fullName: 'Owner', role: 'Admin' });

    tokenStore.clear();

    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getRefreshToken()).toBeNull();
    expect(tokenStore.getUser()).toBeNull();
  });
});
