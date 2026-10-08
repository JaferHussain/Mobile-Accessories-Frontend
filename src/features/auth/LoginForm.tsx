import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ApiError } from '@/types/api';

/**
 * The counter sign-in screen.
 *
 * Field validation happens here so an obvious mistake never costs a round trip, but the server
 * remains the authority on whether the credentials are correct.
 */
export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ProtectedRoute records where the shopkeeper was headed before being sent here, so a
  // bookmarked screen still opens after signing in.
  const destination = (location.state as { from?: string } | null)?.from ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const errors: { username?: string; password?: string } = {};

    if (!username.trim()) {
      errors.username = 'Username is required.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    setFieldErrors(errors);

    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await login(username.trim(), password);

      // replace: true so Back does not return to a login screen they have already passed.
      navigate(destination, { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Could not sign in. Please try again.',
      );
      setPassword('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <h1>Moiz Mobile &amp; Corporation</h1>
      <p className="login-form__subtitle">Danwran Lodhran</p>

      {formError && (
        <p className="login-form__error" role="alert">
          {formError}
        </p>
      )}

      <label htmlFor="username">Username</label>
      <input
        id="username"
        name="username"
        type="text"
        autoComplete="username"
        autoFocus
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        aria-invalid={fieldErrors.username !== undefined}
        aria-describedby={fieldErrors.username ? 'username-error' : undefined}
      />
      {fieldErrors.username && (
        <span id="username-error" className="field-error">
          {fieldErrors.username}
        </span>
      )}

      <label htmlFor="password">Password</label>
      <div className="password-field">
        <input
          id="password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={fieldErrors.password !== undefined}
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
        />
        <button
          type="button"
          className={`password-field__toggle${showPassword ? ' is-shown' : ''}`}
          onClick={() => setShowPassword((shown) => !shown)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          aria-pressed={showPassword}
          title={showPassword ? 'Hide password' : 'Show password'}
        >
          {/* Both icons stay mounted so CSS can crossfade between them. */}
          <EyeIcon />
          <EyeOffIcon />
        </button>
      </div>
      {fieldErrors.password && (
        <span id="password-error" className="field-error">
          {fieldErrors.password}
        </span>
      )}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

function EyeIcon() {
  return (
    <svg className="password-field__icon password-field__icon--eye" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="password-field__icon password-field__icon--eye-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.7 3.6" />
      <path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M2 2l20 20" />
    </svg>
  );
}
