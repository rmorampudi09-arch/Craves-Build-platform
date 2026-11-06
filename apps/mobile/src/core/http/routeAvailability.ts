import {toAppApiError} from './apiError';

/** Status code `toAppApiError` gives a 403 that arrives with no backend body (the gateway has no such route). */
const BODY_LESS_403_CODE = 'HTTP_403';

/** True for a 403 with no backend code: an empty-body refusal from the gateway or an unauthenticated service. */
export function isBodyLess403(error: unknown): boolean {
  const {status, code} = toAppApiError(error);
  return status === 403 && code === BODY_LESS_403_CODE;
}

/**
 * True when the server does not publish this route for the mobile app yet:
 * 404, 501, or a body-less 403 from the gateway. A 403 carrying a real backend
 * code (for example a suspended kitchen) is a genuine refusal, not a missing route.
 */
export function isRouteNotPublished(error: unknown): boolean {
  const {status} = toAppApiError(error);
  return status === 404 || status === 501 || isBodyLess403(error);
}
