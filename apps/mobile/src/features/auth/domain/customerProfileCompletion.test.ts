import {AppApiError} from '../../../core/http/apiError';
import {
  mapCustomerProfileSubmissionFailure,
  normalizeCustomerProfileInput,
} from './customerProfileCompletion';

describe('P22 customer profile completion policy', () => {
  it('normalizes the exact profile request and omits a blank optional email', () => {
    expect(
      normalizeCustomerProfileInput({
        firstName: '  Asha ',
        lastName: ' Rao  ',
        email: '   ',
      }),
    ).toEqual({firstName: 'Asha', lastName: 'Rao'});

    expect(
      normalizeCustomerProfileInput({
        firstName: ' Asha ',
        lastName: ' Rao ',
        email: ' ASHA@EXAMPLE.COM ',
      }),
    ).toEqual({
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha@example.com',
    });
  });

  it('maps backend validation details only to known customer-profile fields', () => {
    const failure = mapCustomerProfileSubmissionFailure(
      new AppApiError(
        'VALIDATION_FAILED',
        'Request validation failed',
        400,
        'correlation-1',
        false,
        false,
        [
          'firstName: must not be blank',
          'email: must be a well-formed email address',
          'unexpectedField: rejected',
        ],
      ),
    );

    expect(failure.fieldErrors).toEqual({
      firstName: 'Check your first name and try again.',
      email: 'Enter a valid email address.',
    });
    expect(failure.error.correlationId).toBe('correlation-1');
  });

  it('keeps non-validation failures as form-level errors', () => {
    const failure = mapCustomerProfileSubmissionFailure(
      new AppApiError('HTTP_503', 'Craves is temporarily unavailable.', 503),
    );

    expect(failure.fieldErrors).toEqual({});
    expect(failure.error.code).toBe('HTTP_503');
  });
});
