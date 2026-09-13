import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';

export interface ProtectedRouteProps {
  children: ReactNode;
  /** When true, only an Admin may enter. */
  adminOnly?: boolean;
}

/**
 * Route guard.
 *
 * This is a usability layer only. It stops a salesman stumbling into a screen they cannot use;
 * it is NOT what protects cost prices and profit. That is enforced server-side on every
 * endpoint (FR-040) — the constitution explicitly rejects UI hiding as sufficient.
 */
export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Remember where they were headed so sign-in can return them there.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
