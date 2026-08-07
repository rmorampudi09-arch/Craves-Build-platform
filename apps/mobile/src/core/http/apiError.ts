import axios, {type AxiosError} from 'axios';
import {isRetriableFailure} from './requestPolicy';

interface BackendErrorPayload {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

const stackTracePattern =
  /(?:\n\s*at\s+|traceback|stack\s*trace|exception\b|org\.springframework|java\.|node_modules\/|sqlstate)/i;

export class AppApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly correlationId?: string,
    readonly retriable = false,
    readonly cancelled = false,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'AppApiError';
  }
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const headerContainer = headers as {
    get?: (headerName: string) => unknown;
  };
  if (typeof headerContainer.get === 'function') {
    const value = headerContainer.get(name);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  const lowerName = name.toLowerCase();
  const entries = Object.entries(headers as Record<string, unknown>);
  const matched = entries.find(([key]) => key.toLowerCase() === lowerName)?.[1];
  return typeof matched === 'string' && matched.trim() ? matched.trim() : undefined;
}

function correlationIdFrom(error: AxiosError<BackendErrorPayload>): string | undefined {
  return (
    readHeader(error.response?.headers, 'x-correlation-id') ??
    readHeader(error.config?.headers, 'x-correlation-id')
  );
}

function normalizedBackendCode(value: unknown, status?: number): string {
  if (typeof value === 'string' && /^[A-Z0-9_.-]{1,64}$/i.test(value.trim())) {
    return value.trim();
  }
  return status ? `HTTP_${status}` : 'NETWORK_ERROR';
}

function safeBackendMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const message = value.trim();
  if (!message || message.length > 180 || stackTracePattern.test(message)) {
    return undefined;
  }
  return message;
}

function safeBackendDetails(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(detail => safeBackendMessage(detail))
    .filter((detail): detail is string => Boolean(detail))
    .slice(0, 10);
}

function publicHttpMessage(status: number, backendMessage?: string): string {
  if (status === 400) {
    return backendMessage ?? 'Please check the request and try again.';
  }
  if (status === 401) {
    return 'Your session could not be verified. Please sign in again.';
  }
  if (status === 403) {
    return 'This action is not available for your account.';
  }
  if (status === 404) {
    return backendMessage ?? 'The requested information could not be found.';
  }
  if (status === 408) {
    return 'The request took too long. Please try again.';
  }
  if (status === 409) {
    return backendMessage ?? 'That information changed. Refresh and try again.';
  }
  if (status === 422) {
    return backendMessage ?? 'Some information could not be accepted.';
  }
  if (status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (status >= 500) {
    return 'Craves is temporarily unavailable. Please try again.';
  }
  return 'We could not complete that request.';
}

export function toAppApiError(error: unknown): AppApiError {
  if (error instanceof AppApiError) {
    return error;
  }

  if (axios.isAxiosError<BackendErrorPayload>(error)) {
    const status = error.response?.status;
    const correlationId = correlationIdFrom(error);
    const cancelled = error.code === 'ERR_CANCELED' || axios.isCancel(error);

    if (cancelled) {
      return new AppApiError(
        'REQUEST_CANCELLED',
        'Request cancelled.',
        status,
        correlationId,
        false,
        true,
      );
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new AppApiError(
        'REQUEST_TIMEOUT',
        'The request took too long. Please try again.',
        status,
        correlationId,
        true,
      );
    }

    const code = normalizedBackendCode(error.response?.data?.code, status);
    const backendMessage = safeBackendMessage(error.response?.data?.message);
    const details = safeBackendDetails(error.response?.data?.details);
    const message = status
      ? publicHttpMessage(status, backendMessage)
      : 'We could not reach Craves. Check your connection and try again.';

    return new AppApiError(
      code,
      message,
      status,
      correlationId,
      isRetriableFailure(status, error.code),
      false,
      details,
    );
  }

  return new AppApiError('UNKNOWN_ERROR', 'Something went wrong. Please try again.');
}
