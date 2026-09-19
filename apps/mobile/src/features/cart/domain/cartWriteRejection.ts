import type {AppApiError} from '../../../core/http/apiError';

/** Only explicit pre-write rejections release an uncertain-write guard.
 * Timeouts, cancellation, malformed success responses and server failures remain
 * uncertain: the customer must inspect the cart before another attempt. */
export function isDefinitiveCartRejection(error: AppApiError): boolean {
  if (error.cancelled || error.code === 'REQUEST_TIMEOUT') return false;
  return (
    error.code === 'CART_CHECKOUT_BUSY' ||
    error.code === 'CART_SAFE_CLEAR_UNAVAILABLE' ||
    error.code === 'CART_CHANGED' ||
    error.code === 'CART_TARGET_KITCHEN_CHANGED' ||
    [400, 401, 403, 404, 409, 422, 429].includes(error.status ?? 0)
  );
}
