/** Mirrors the server envelope in specs/001-pos-inventory-ledger/contracts/conventions.md. */

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: ErrorDetail[] | null;
  traceId?: string | null;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: ApiErrorBody | null;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export type UserRole = 'Admin' | 'Staff';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthUser;
}

/** Error codes the UI branches on. Kept in sync with Domain/Errors/ErrorCodes.cs. */
export const ErrorCodes = {
  ValidationFailed: 'VALIDATION_FAILED',
  InsufficientStock: 'INSUFFICIENT_STOCK',
  DiscountExceedsTotal: 'DISCOUNT_EXCEEDS_TOTAL',
  ReturnExceedsOriginal: 'RETURN_EXCEEDS_ORIGINAL',
  CustomerRequired: 'CUSTOMER_REQUIRED',
  OverpaymentNotConfirmed: 'OVERPAYMENT_NOT_CONFIRMED',
  Unauthenticated: 'UNAUTHENTICATED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  ConcurrencyConflict: 'CONCURRENCY_CONFLICT',
  BusinessRuleViolation: 'BUSINESS_RULE_VIOLATION',
  InternalError: 'INTERNAL_ERROR',
} as const;

/**
 * A failed API call, carrying the server's code so callers can branch without parsing prose.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: ErrorDetail[] = [],
    readonly traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the shopkeeper can fix this by changing what they entered. */
  get isCorrectable(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** The message for a specific field, if the server flagged one. */
  fieldError(field: string): string | undefined {
    return this.details.find((d) => d.field.toLowerCase() === field.toLowerCase())?.message;
  }
}
