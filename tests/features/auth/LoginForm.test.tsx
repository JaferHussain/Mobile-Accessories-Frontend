import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/features/auth/LoginForm';
import { AuthProvider } from '@/features/auth/AuthContext';
import { tokenStore } from '@/api/tokenStore';
import { api } from '@/api/client';
import { ApiError } from '@/types/api';

/** T037 — sign-in validation, submission and error display. */

/**
 * Renders the form inside a router. It navigates on success, so a router is part of the
 * contract now — the whole point is that signing in takes you somewhere.
 */
function renderLogin(from?: string) {
  return render(
    <AuthProvider initialUser={null}>
      <MemoryRouter initialEntries={[{ pathname: '/login', state: from ? { from } : null }]}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/" element={<p>Counter</p>} />
          <Route path="/reports" element={<p>Reports screen</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const successfulLogin = {
  data: {
    success: true,
    data: {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2026-09-09T12:00:00Z',
      user: { id: 1, username: 'admin', fullName: 'Owner', role: 'Admin' },
    },
    error: null,
  },
};

describe('LoginForm', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows the shop name', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: /moiz mobile/i })).toBeInTheDocument();
  });

  it('requires a username', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/password/i), 'Admin@123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Username is required.')).toBeInTheDocument();
  });

  it('requires a password', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Password is required.')).toBeInTheDocument();
  });

  it('does not call the server when validation fails', async () => {
    const post = vi.spyOn(api, 'post');
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(post).not.toHaveBeenCalled();
  });

  it('submits the trimmed username and the password', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        data: {
          accessToken: 'a',
          refreshToken: 'r',
          expiresAt: '2026-09-09T12:00:00Z',
          user: { id: 1, username: 'admin', fullName: 'Owner', role: 'Admin' },
        },
        error: null,
      },
    } as never);

    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), '  admin  ');
    await user.type(screen.getByLabelText(/password/i), 'Admin@123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/login', {
        username: 'admin',
        password: 'Admin@123',
      }),
    );
  });

  it('stores the session on success', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        data: {
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
          expiresAt: '2026-09-09T12:00:00Z',
          user: { id: 1, username: 'admin', fullName: 'Owner', role: 'Admin' },
        },
        error: null,
      },
    } as never);

    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'Admin@123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(tokenStore.getAccessToken()).toBe('access-1'));
    expect(tokenStore.getRefreshToken()).toBe('refresh-1');
    expect(tokenStore.getUser()?.role).toBe('Admin');
  });

  it('shows the server message when the credentials are wrong', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      new ApiError('UNAUTHENTICATED', 'Incorrect username or password.', 401),
    );

    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or password.');
  });

  it('clears the password after a failed attempt', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      new ApiError('UNAUTHENTICATED', 'Incorrect username or password.', 401),
    );

    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await screen.findByRole('alert');
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
    // The username survives so a typo in the password costs only the password.
    expect(screen.getByLabelText(/username/i)).toHaveValue('admin');
  });

  it('shows a friendly message when the server is unreachable', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      new ApiError('NETWORK_ERROR', 'Could not reach the server.', 0),
    );

    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'Admin@123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
  });

  it('never renders the password in plain text', async () => {
    const user = userEvent.setup();
    renderLogin();

    const password = screen.getByLabelText(/password/i);
    await user.type(password, 'Admin@123');

    expect(password).toHaveAttribute('type', 'password');
  });
});

/**
 * Signing in has to take the shopkeeper somewhere. Without this the form succeeded, stored the
 * session, and left them staring at the same login screen — looking exactly like a failure.
 */
describe('LoginForm navigation', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  async function signIn() {
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'Admin@123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
  }

  it('leaves the login screen once signed in', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(successfulLogin as never);

    renderLogin();
    await signIn();

    expect(await screen.findByText('Counter')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('returns to the screen they were trying to reach', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(successfulLogin as never);

    // ProtectedRoute redirects here with state.from when a bookmark is opened while signed out.
    renderLogin('/reports');
    await signIn();

    expect(await screen.findByText('Reports screen')).toBeInTheDocument();
  });

  it('stays put when the credentials are wrong', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      new ApiError('UNAUTHENTICATED', 'Incorrect username or password.', 401),
    );

    renderLogin();
    await signIn();

    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText('Counter')).not.toBeInTheDocument();
  });
});
