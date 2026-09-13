import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/** T176 — one broken screen must not blank the whole counter. */

function Explodes({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Cannot read properties of undefined');
  }

  return <p>Screen content</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error itself; silence it so the run stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders its children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <Explodes shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Screen content')).toBeInTheDocument();
  });

  it('shows a message the shopkeeper can act on', () => {
    render(
      <ErrorBoundary>
        <Explodes shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);
    // The reassurance that matters mid-sale.
    expect(screen.getByText(/nothing you have already saved has been lost/i)).toBeInTheDocument();
  });

  it('does not put a stack trace in front of the shopkeeper', () => {
    render(
      <ErrorBoundary>
        <Explodes shouldThrow />
      </ErrorBoundary>,
    );

    // The detail is available, but folded away.
    expect(screen.getByText('Technical details')).toBeInTheDocument();
    expect(screen.getByText(/cannot read properties of undefined/i)).toBeInTheDocument();
  });

  it('reports the failure so it can be logged', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <Explodes shouldThrow />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
  });

  it('offers a way back', async () => {
    const user = userEvent.setup();

    function Recovering() {
      return (
        <ErrorBoundary>
          <Explodes shouldThrow={false} />
        </ErrorBoundary>
      );
    }

    const { rerender } = render(
      <ErrorBoundary>
        <Explodes shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));
    rerender(<Recovering />);

    expect(screen.getByText('Screen content')).toBeInTheDocument();
  });
});
