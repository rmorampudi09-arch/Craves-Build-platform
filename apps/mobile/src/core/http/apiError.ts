import axios from 'axios';
import type {ApiErrorResponse} from '../../features/auth/domain/types';

export class AppApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AppApiError';
  }
}

export function toAppApiError(error: unknown): AppApiError {
  if (error instanceof AppApiError) {
    return error;
  }
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const status = error.response?.status;
    const code = error.response?.data?.code ?? (status ? `HTTP_${status}` : 'NETWORK_ERROR');
    const publicMessage =
      status === 401
        ? 'Your session could not be verified. Please sign in again.'
        : status === 403
          ? 'This action is not available for your account.'
          : status && status >= 500
            ? 'Craves is temporarily unavailable. Please try again.'
            : error.response?.data?.message ?? 'We could not complete that request.';
    return new AppApiError(code, publicMessage, status);
  }
  return new AppApiError('UNKNOWN_ERROR', 'Something went wrong. Please try again.');
}
