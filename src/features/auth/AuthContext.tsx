import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, unwrap } from '@/api/client';
import { tokenStore } from '@/api/tokenStore';
import type { ApiEnvelope, AuthResponse, AuthUser } from '@/types/api';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
  /** Test seam: lets a test start already signed in. */
  initialUser?: AuthUser | null;
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(initialUser ?? tokenStore.getUser());

  const login = useCallback(async (username: string, password: string) => {
    const result = await unwrap<AuthResponse>(
      api.post<ApiEnvelope<AuthResponse>>('/auth/login', { username, password }),
    );

    tokenStore.setAccessToken(result.accessToken);
    tokenStore.setRefreshToken(result.refreshToken);
    tokenStore.setUser(result.user);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefreshToken();

    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken });
      } catch {
        // Even if the server call fails, the local session must still end.
      }
    }

    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isAdmin: user?.role === 'Admin',
      login,
      logout,
    }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }

  return context;
}
