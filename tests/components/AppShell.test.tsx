import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AuthProvider } from '@/features/auth/AuthContext';
import { tokenStore } from '@/api/tokenStore';
import type { AuthUser } from '@/types/api';

/**
 * T148 — role-aware navigation.
 *
 * This is a usability layer only. Hiding a link stops a salesman wandering into a screen they
 * cannot use; it is NOT what protects cost and profit. That is enforced server-side on every
 * endpoint, and the backend suite proves it.
 */

const admin: AuthUser = { id: 1, username: 'admin', fullName: 'Shop Owner', role: 'Admin' };
const staff: AuthUser = { id: 2, username: 'salesman', fullName: 'Bilal', role: 'Staff' };

const ADMIN_ONLY_LINKS = [
  'Purchases', 'Suppliers', 'Categories', 'Brands', 'Expenses', 'Reports', 'Dashboard', 'Admin',
];
const SHARED_LINKS = ['Sell', 'Products', 'Customers'];

function renderShell(user: AuthUser) {
  return render(
    <AuthProvider initialUser={user}>
      <MemoryRouter initialEntries={['/pos']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/pos" element={<p>POS</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('AppShell navigation', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
  });

  it('shows the shop name', () => {
    renderShell(admin);

    expect(screen.getByText(/Moiz Mobile/)).toBeInTheDocument();
    expect(screen.getByText('Danwran Lodhran')).toBeInTheDocument();
  });

  it('shows the signed-in user and their role', () => {
    renderShell(staff);

    expect(screen.getByText('Bilal (Staff)')).toBeInTheDocument();
  });

  it.each(ADMIN_ONLY_LINKS)('hides the %s link from staff', (label) => {
    renderShell(staff);

    expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
  });

  it.each(ADMIN_ONLY_LINKS)('shows the %s link to an admin', (label) => {
    renderShell(admin);

    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  });

  it.each(SHARED_LINKS)('shows the %s link to staff', (label) => {
    renderShell(staff);

    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  });

  it('gives staff only the links they can use', () => {
    renderShell(staff);

    const labels = screen
      .getAllByRole('link')
      .map((link) => link.textContent);

    expect(labels).toEqual(SHARED_LINKS);
  });

  it('offers a way to sign out', () => {
    renderShell(admin);

    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('renders the routed screen inside the shell', () => {
    renderShell(admin);

    expect(screen.getByText('POS')).toBeInTheDocument();
  });
});
