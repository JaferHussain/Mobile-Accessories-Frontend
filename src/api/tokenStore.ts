import type { AuthUser } from '@/types/api';

/**
 * Where the counter keeps its session.
 *
 * The refresh token persists so a shopkeeper who reloads the page mid-shift is not thrown back
 * to the login screen. The access token is held in memory only — it is short-lived (60 minutes)
 * and re-derived from the refresh token, so there is no reason to leave copies on disk.
 *
 * Every storage access is wrapped: a browser with site data blocked throws on access rather
 * than returning null, and that must not take down the whole application.
 */

const REFRESH_TOKEN_KEY = 'moizpos.refreshToken';
const USER_KEY = 'moizpos.user';

let accessToken: string | null = null;

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Session simply will not survive a reload. Not worth failing the sign-in over.
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing useful to do.
  }
}

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  setAccessToken(token: string | null): void {
    accessToken = token;
  },

  getRefreshToken(): string | null {
    return safeGet(REFRESH_TOKEN_KEY);
  },

  setRefreshToken(token: string): void {
    safeSet(REFRESH_TOKEN_KEY, token);
  },

  getUser(): AuthUser | null {
    const raw = safeGet(USER_KEY);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      // Corrupted entry: treat as signed out rather than crashing on every page load.
      safeRemove(USER_KEY);
      return null;
    }
  },

  setUser(user: AuthUser): void {
    safeSet(USER_KEY, JSON.stringify(user));
  },

  /** Forgets everything. Called on sign-out and whenever a refresh is rejected. */
  clear(): void {
    accessToken = null;
    safeRemove(REFRESH_TOKEN_KEY);
    safeRemove(USER_KEY);
  },
};
