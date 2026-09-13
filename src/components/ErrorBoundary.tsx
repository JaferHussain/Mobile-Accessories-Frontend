import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Test seam, and where a real logger would go. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches a rendering crash so one broken screen does not blank the whole counter.
 *
 * A shopkeeper mid-sale needs to know what to do next, not read a stack trace — so the message
 * says plainly that nothing was lost and offers a way back.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);

    console.error('Screen failed to render:', error, info.componentStack);
  }

  private readonly handleRetry = () => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <div className="error-boundary" role="alert">
        <h2>Something went wrong on this screen</h2>

        <p>
          Nothing you have already saved has been lost. Try again, or move to another screen and
          come back.
        </p>

        <button type="button" onClick={this.handleRetry}>
          Try again
        </button>

        <details>
          <summary>Technical details</summary>
          <pre>{error.message}</pre>
        </details>
      </div>
    );
  }
}
