import {AxiosError, AxiosHeaders, type InternalAxiosRequestConfig} from 'axios';
import {AppApiError, toAppApiError} from './apiError';
import {applyRequestMetadata} from './requestMetadata';
import {
  getRetryDelayMs,
  httpPolicy,
  shouldRetryRequest,
} from './requestPolicy';
import {
  clearInFlightRequestDedupe,
  runDedupedRequest,
} from './requestDedupe';

describe('typed HTTP client foundation', () => {
  afterEach(() => {
    clearInFlightRequestDedupe();
  });

  it('injects bearer and correlation metadata while preserving a retry correlation id', () => {
    const config = {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig;

    applyRequestMetadata(config, {
      baseUrl: 'https://api.example.test',
      correlationId: 'corr-first',
      injectBearer: true,
      accessToken: 'access-1',
    });
    applyRequestMetadata(config, {
      baseUrl: 'https://api.example.test',
      correlationId: 'corr-second',
      injectBearer: true,
      accessToken: 'access-2',
    });

    expect(config.baseURL).toBe('https://api.example.test');
    expect(config.headers.get('X-Correlation-ID')).toBe('corr-first');
    expect(config.headers.get('Authorization')).toBe('Bearer access-2');
  });

  it('bounds retries to transient failures on safe read methods', () => {
    expect(
      shouldRetryRequest({method: 'GET', status: 503, retryCount: 0}),
    ).toBe(true);
    expect(
      shouldRetryRequest({method: 'GET', errorCode: 'ERR_NETWORK', retryCount: 0}),
    ).toBe(true);
    expect(
      shouldRetryRequest({method: 'POST', status: 503, retryCount: 0}),
    ).toBe(false);
    expect(
      shouldRetryRequest({
        method: 'GET',
        status: 503,
        retryCount: httpPolicy.maxRetries,
      }),
    ).toBe(false);
    expect(
      shouldRetryRequest({
        method: 'GET',
        status: 503,
        retryCount: 0,
        cancelled: true,
      }),
    ).toBe(false);
    expect(getRetryDelayMs(0)).toBe(httpPolicy.retryBaseDelayMs);
    expect(getRetryDelayMs(50)).toBe(httpPolicy.retryMaxDelayMs);
  });

  it('normalizes cancellation without making it retriable', () => {
    const config = {
      headers: new AxiosHeaders({'X-Correlation-ID': 'cancel-corr'}),
    } as InternalAxiosRequestConfig;
    const normalized = toAppApiError(
      new AxiosError('cancelled', 'ERR_CANCELED', config),
    );

    expect(normalized).toBeInstanceOf(AppApiError);
    expect(normalized.code).toBe('REQUEST_CANCELLED');
    expect(normalized.cancelled).toBe(true);
    expect(normalized.retriable).toBe(false);
    expect(normalized.correlationId).toBe('cancel-corr');
  });

  it('does not expose raw backend stack traces and retains correlation evidence', () => {
    const config = {
      headers: new AxiosHeaders({'X-Correlation-ID': 'client-corr'}),
    } as InternalAxiosRequestConfig;
    const normalized = toAppApiError(
      new AxiosError('backend failure', 'ERR_BAD_RESPONSE', config, undefined, {
        data: {
          code: 'INTERNAL_FAILURE',
          message: 'java.lang.IllegalStateException\n    at com.craves.Service.run(Service.java:42)',
        },
        status: 500,
        statusText: 'Internal Server Error',
        headers: new AxiosHeaders({'x-correlation-id': 'server-corr'}),
        config,
      }),
    );

    expect(normalized.code).toBe('INTERNAL_FAILURE');
    expect(normalized.message).toBe('Craves is temporarily unavailable. Please try again.');
    expect(normalized.message).not.toContain('IllegalStateException');
    expect(normalized.correlationId).toBe('server-corr');
    expect(normalized.retriable).toBe(true);
  });

  it('keeps bounded user-safe validation messages', () => {
    const config = {headers: new AxiosHeaders()} as InternalAxiosRequestConfig;
    const normalized = toAppApiError(
      new AxiosError('validation', 'ERR_BAD_REQUEST', config, undefined, {
        data: {code: 'INVALID_PHONE', message: 'Enter a valid phone number.'},
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: new AxiosHeaders(),
        config,
      }),
    );

    expect(normalized.code).toBe('INVALID_PHONE');
    expect(normalized.message).toBe('Enter a valid phone number.');
  });

  it('preserves only bounded safe validation details for field reconciliation', () => {
    const config = {headers: new AxiosHeaders()} as InternalAxiosRequestConfig;
    const normalized = toAppApiError(
      new AxiosError('validation', 'ERR_BAD_REQUEST', config, undefined, {
        data: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: [
            'firstName: must not be blank',
            'email: must be a well-formed email address',
            'java.lang.IllegalStateException at Service.run',
          ],
        },
        status: 400,
        statusText: 'Bad Request',
        headers: new AxiosHeaders(),
        config,
      }),
    );

    expect(normalized.code).toBe('VALIDATION_FAILED');
    expect(normalized.details).toEqual([
      'firstName: must not be blank',
      'email: must be a well-formed email address',
    ]);
  });

  it('coalesces only explicitly keyed in-flight requests and releases the key afterward', async () => {
    let resolveRequest: ((value: string) => void) | undefined;
    const task = jest.fn(
      () =>
        new Promise<string>(resolve => {
          resolveRequest = resolve;
        }),
    );

    const first = runDedupedRequest('profile:identity-1', task);
    const second = runDedupedRequest('profile:identity-1', task);

    expect(second).toBe(first);
    expect(task).toHaveBeenCalledTimes(1);

    resolveRequest?.('done');
    await expect(first).resolves.toBe('done');

    const third = runDedupedRequest('profile:identity-1', task);
    expect(task).toHaveBeenCalledTimes(2);
    resolveRequest?.('again');
    await expect(third).resolves.toBe('again');
  });
});
