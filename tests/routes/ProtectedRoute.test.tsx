import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { AuthProvider } from '@/features/auth/AuthContext';
import { tokenStore } from '@/api/tokenStore';
import type { AuthUser } from '@/types/api';

/** T039 — the route guard. A usability layer; the server is what actually enforces access. */

const admin: AuthUser = { id: 1, username: 'admin', fullName: 'Owner', role: 'Admin' };
const staff: AuthUser = { id: 2, username: 'salesman', fullName: 'Salesman', role: 'Staff' };

function renderAt(path: string, user: AuthUser | null) {
  return render(
    <AuthProvider initialUser={user}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<p>Login screen</p>} />
          <Route path="/forbidden" element={<p>Not allowed</p>} />
          <Route
            path="/pos"
            element={
              <ProtectedRoute>
                <p>POS screen</p>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute adminOnly>
                <p>Reports screen</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
  });

  it('sends a signed-out visitor to the login screen', () => {
    renderAt('/pos', null);

    expect(screen.getByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText('POS screen')).not.toBeInTheDocument();
  });

  it('lets a signed-in staff user reach the POS', () => {
    renderAt('/pos', staff);

    expect(screen.getByText('POS screen')).toBeInTheDocument();
  });

  it('lets an admin reach the POS', () => {
    renderAt('/pos', admin);

    expect(screen.getByText('POS screen')).toBeInTheDocument();
  });

  it('keeps staff out of an admin-only screen', () => {
    renderAt('/reports', staff);

    expect(screen.getByText('Not allowed')).toBeInTheDocument();
    expect(screen.queryByText('Reports screen')).not.toBeInTheDocument();
  });

  it('lets an admin into an admin-only screen', () => {
    renderAt('/reports', admin);

    expect(screen.getByText('Reports screen')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to login rather than forbidden for an admin route', () => {
    renderAt('/reports', null);

    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });
});
