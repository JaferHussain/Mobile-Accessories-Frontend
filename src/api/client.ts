import axios, {
  type AxiosAdapter,
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { tokenStore } from './tokenStore';
import { ApiError, type ApiEnvelope, type AuthResponse } from '@/types/api';

export interface ApiClientOptions {
  baseURL?: string;
  /** Test seam: lets the suite drive the client without a network. */
  adapter?: AxiosAdapter;
  /** Called when the session cannot be renewed and the user must sign in again. */
  onSessionExpired?: () => void;
}

/** Requests that must never trigger a token refresh — a 401 there is the real answer. */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

function toApiError(error: unknown): ApiError {
  const axiosError = error as AxiosError<ApiEnvelope<unknown>>;
  const response = axiosError?.response;

  if (response?.data?.error) {
    const { code, message, details, traceId } = response.data.error;
    return new ApiError(code, message, response.status, details ?? [], traceId ?? undefined);
  }

  if (response) {
    return new ApiError(
      'INTERNAL_ERROR',
      `The server returned an unexpected ${response.status} response.`,
      response.status,
    );
  }

  // No response at all: the shop's server is down, or the tablet lost the network.
  return new ApiError(
    'NETWORK_ERROR',
    'Could not reach the server. Check that it is running and the device is connected.',
    0,
  );
}

export function createApiClient(options: ApiClientOptions = {}): AxiosInstance {
  const client = axios.create({
    baseURL: options.baseURL ?? import.meta.env.VITE_API_BASE_URL ?? '/api',
    timeout: 20_000,
    headers: { 'Content-Type': 'application/json' },
    ...(options.adapter ? { adapter: options.adapter } : {}),
  });

  client.interceptors.request.use((config) => {
    const token = tokenStore.getAccessToken();

    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }

    // A FormData body (a picture upload) must go out as multipart/form-data, with a boundary
    // axios generates from the data itself. The client's own JSON default would otherwise
    // mislabel it, and the server rejects an unparsable body with 415.
    if (config.data instanceof FormData) {
      config.headers.delete('Content-Type');
    }

    return config;
  });

  // A single in-flight refresh shared by every request that hits a 401 at once, so a screen
  // firing five queries does not start five refreshes and invalidate its own new token.
  let refreshInFlight: Promise<string> | null = null;

  async function refreshAccessToken(): Promise<string> {
    const refreshToken = tokenStore.getRefreshToken();

    if (!refreshToken) {
      throw new ApiError('UNAUTHENTICATED', 'Please sign in again.', 401);
    }

    const response = await client.post<ApiEnvelope<AuthResponse>>('/auth/refresh', { refreshToken });
    const data = response.data.data;

    if (!data) {
      throw new ApiError('UNAUTHENTICATED', 'Please sign in again.', 401);
    }

    tokenStore.setAccessToken(data.accessToken);
    tokenStore.setRefreshToken(data.refreshToken);
    tokenStore.setUser(data.user);

    return data.accessToken;
  }

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as RetriableConfig | undefined;
      const status = error.response?.status;

      // A document request asks for a Blob, so its ERROR body arrives as one too — the ordinary
      // JSON envelope, wrapped in bytes. Read back here, centrally, or every failed document
      // fetch reports a generic "unexpected error" while the server's real reason sits unread
      // inside the blob. Done before the mapping below so nothing downstream has to know.
      if (error.response?.data instanceof Blob) {
        try {
          error.response.data = JSON.parse(await error.response.data.text());
        } catch {
          // Not an envelope — leave the body alone and let the generic mapping handle it.
        }
      }

      const shouldRefresh =
        status === 401 &&
        config !== undefined &&
        !config._retried &&
        !NO_REFRESH_PATHS.some((path) => (config.url ?? '').includes(path)) &&
        tokenStore.getRefreshToken() !== null;

      if (!shouldRefresh) {
        return Promise.reject(toApiError(error));
      }

      config!._retried = true;

      try {
        refreshInFlight ??= refreshAccessToken();
        const freshToken = await refreshInFlight;

        config!.headers.set('Authorization', `Bearer ${freshToken}`);

        return await client.request(config!);
      } catch {
        // The session is genuinely over: forget it and let the app show the login screen.
        tokenStore.clear();
        options.onSessionExpired?.();

        return Promise.reject(toApiError(error));
      } finally {
        refreshInFlight = null;
      }
    },
  );

  return client;
}

/**
 * Unwraps the response envelope to its payload, raising an ApiError when the server reported a
 * failure. Every call site uses this so no screen ever inspects `success` by hand.
 */
export async function unwrap<T>(request: Promise<AxiosResponse<ApiEnvelope<T>>>): Promise<T> {
  try {
    const response = await request;

    if (!response.data?.success) {
      throw toApiError({ response });
    }

    return response.data.data as T;
  } catch (error) {
    throw error instanceof ApiError ? error : toApiError(error);
  }
}

/**
 * Fetches a document as raw bytes.
 *
 * <b>Deliberately not `unwrap`.</b> A PDF has no `ApiResponse` envelope, so `response.data.success`
 * is `undefined` and every successful document fetch would be reported as a server failure. This
 * is the mirror image of the FormData trap the request interceptor already handles: there the JSON
 * `Content-Type` had to be removed on the way out, here the envelope must not be expected on the
 * way back.
 *
 * A failure still arrives as the ordinary JSON envelope — but as a Blob, because that is what was
 * asked for. The response interceptor reads it back before mapping, so a refused request surfaces
 * the server's real reason instead of being handed to the shopkeeper as a "document" that actually
 * contains an error message.
 */
export async function fetchBlob(
  client: AxiosInstance,
  url: string,
  config: AxiosRequestConfig = {},
): Promise<Blob> {
  const response = await client.get<Blob>(url, { ...config, responseType: 'blob' });

  return response.data;
}

/** The shared client used by the application. */
export const api = createApiClient();
