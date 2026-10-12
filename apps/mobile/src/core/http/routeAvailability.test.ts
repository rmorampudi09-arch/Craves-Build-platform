import {AxiosError} from 'axios';
import {AppApiError} from './apiError';
import {isRouteNotPublished} from './routeAvailability';

function axiosFailure(status: number, data?: unknown) {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = {status, data, headers: {}, statusText: '', config: {} as never};
  return error;
}

describe('isRouteNotPublished', () => {
  it('is true for 404 and 501', () => {
    expect(isRouteNotPublished(new AppApiError('HTTP_404', 'x', 404))).toBe(true);
    expect(isRouteNotPublished(new AppApiError('HTTP_501', 'x', 501))).toBe(true);
  });

  it('is true for a 403 with no backend body (generic code)', () => {
    expect(isRouteNotPublished(axiosFailure(403))).toBe(true);
    expect(isRouteNotPublished(new AppApiError('HTTP_403', 'x', 403))).toBe(true);
  });

  it('is false for a 403 that carries a real backend code', () => {
    expect(isRouteNotPublished(axiosFailure(403, {code: 'CHEF_KITCHEN_SUSPENDED'}))).toBe(false);
    expect(isRouteNotPublished(new AppApiError('CHEF_KITCHEN_SUSPENDED', 'x', 403))).toBe(false);
  });

  it('is false for auth, conflict, validation, server and network failures', () => {
    for (const status of [401, 409, 422, 500, 503]) {
      expect(isRouteNotPublished(new AppApiError(`HTTP_${status}`, 'x', status))).toBe(false);
    }
    expect(isRouteNotPublished(new AppApiError('REQUEST_TIMEOUT', 'x', undefined, undefined, true))).toBe(false);
    expect(isRouteNotPublished(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(false);
    expect(isRouteNotPublished(new Error('boom'))).toBe(false);
    expect(isRouteNotPublished(undefined)).toBe(false);
  });
});
