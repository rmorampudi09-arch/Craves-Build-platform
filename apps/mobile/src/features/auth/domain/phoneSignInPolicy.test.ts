import {
  createPhoneRequestGate,
  createPhoneSignInSubmission,
  DEFAULT_PHONE_COUNTRY,
  getPhoneSignInCopy,
  getPhoneValidationError,
  isSupportedPhoneValid,
  sanitizeNationalPhone,
  toSupportedPhoneE164,
} from './phoneSignInPolicy';

describe('phone sign-in policy', () => {
  it('keeps the supported India country boundary explicit', () => {
    expect(DEFAULT_PHONE_COUNTRY).toEqual({
      isoCode: 'IN',
      label: 'India',
      dialCode: '+91',
      nationalDigits: 10,
    });
  });

  it('sanitizes local and E.164-style pasted phone input', () => {
    expect(sanitizeNationalPhone('+91 98765-43210')).toBe('9876543210');
    expect(sanitizeNationalPhone('98765 43210 123')).toBe('9876543210');
  });

  it('accepts only valid Indian mobile numbers and normalizes them to E.164', () => {
    expect(isSupportedPhoneValid('9876543210')).toBe(true);
    expect(toSupportedPhoneE164('9876543210')).toBe('+919876543210');
    expect(isSupportedPhoneValid('1234567890')).toBe(false);
    expect(getPhoneValidationError('1234567890')).toBe(
      'Enter a valid 10-digit Indian mobile number.',
    );
  });

  it('provides Chef-specific sign-in guidance while keeping the shared phone flow', () => {
    const chefCopy = getPhoneSignInCopy('CHEF');
    const customerCopy = getPhoneSignInCopy('CUSTOMER');

    expect(chefCopy.description).toContain('chef account');
    expect(chefCopy.continueAccessibilityHint).toContain('chef account');
    expect(customerCopy.description).not.toContain('chef account');
  });

  it('preserves Chef role and normalized phone in the OTP navigation snapshot', () => {
    expect(createPhoneSignInSubmission('CHEF', '+91 98765-43210')).toEqual({
      role: 'CHEF',
      phone: '+919876543210',
    });
  });

  it('keeps the accepted Customer submission snapshot unchanged', () => {
    expect(createPhoneSignInSubmission('CUSTOMER', '9876543210')).toEqual({
      role: 'CUSTOMER',
      phone: '+919876543210',
    });
  });

  it('guards a phone verification request against duplicate submission until release', () => {
    const gate = createPhoneRequestGate();

    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);

    gate.release();

    expect(gate.tryAcquire()).toBe(true);
  });
});
