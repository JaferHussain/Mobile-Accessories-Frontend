import axios, {
  type AxiosAdapter,
  type AxiosError,
  type AxiosInstance,
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

/** The shared client used by the application. */
export const api = createApiClient();
