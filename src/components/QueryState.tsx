import type { ReactNode } from 'react';
import { ApiError } from '@/types/api';

export interface QueryStateProps {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}

/**
 * The three states every data screen has, in one place: loading, failed, and nothing to show.
 *
 * A shopkeeper needs to tell "still loading" apart from "there is nothing here" — a blank screen
 * that means both is the most common way a working system looks broken.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty = false,
  emptyMessage = 'Nothing to show yet.',
  children,
}: QueryStateProps) {
  if (isLoading) {
    return <p role="status">Loading…</p>;
  }

  if (error) {
    return (
      <p className="form-error" role="alert">
        {error instanceof ApiError ? error.message : 'Could not load this. Please try again.'}
      </p>
    );
  }

  if (isEmpty) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return <>{children}</>;
}
