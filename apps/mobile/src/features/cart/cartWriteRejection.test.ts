import {AppApiError} from '../../core/http/apiError';
import {isDefinitiveCartRejection} from './domain/cartWriteRejection';

it.each([400, 401, 403, 404, 409, 422, 429])(
  'recognizes a definitive HTTP %s rejection',
  status => {
    expect(
      isDefinitiveCartRejection(
        new AppApiError(`HTTP_${status}`, 'Rejected', status),
      ),
    ).toBe(true);
  },
);

it.each([408, 500, 502, 503, 504, undefined])(
  'keeps ambiguous HTTP %s failures uncertain',
  status => {
    expect(
      isDefinitiveCartRejection(
        new AppApiError('FAILURE', 'Unknown outcome', status),
      ),
    ).toBe(false);
  },
);

it.each([
  'REQUEST_TIMEOUT',
  'CART_INVALID_RESPONSE',
  'CART_CLEAR_UNCONFIRMED',
  'NETWORK_ERROR',
])('does not retry ambiguous %s outcomes', code => {
  expect(
    isDefinitiveCartRejection(new AppApiError(code, 'Unknown outcome')),
  ).toBe(false);
});

it('does not treat cancellation as proof that a write did not happen', () => {
  expect(
    isDefinitiveCartRejection(
      new AppApiError(
        'REQUEST_CANCELLED',
        'Cancelled',
        400,
        undefined,
        false,
        true,
      ),
    ),
  ).toBe(false);
});
