import {
  createEmailAuthRoleContext,
  createEmailPasswordRecoveryContext,
  createEmailRequestGate,
  createEmailSignInSubmission,
  getEmailSignInFieldErrors,
  getPasswordRecoveryEmail,
  isEmailAddressValid,
  normalizeEmail,
} from './emailSignInPolicy';

describe('emailSignInPolicy', () => {
  it('normalizes email without modifying the password', () => {
    const submission = createEmailSignInSubmission(
      'CUSTOMER',
      '  Customer.Name@Example.COM  ',
      ' PassWord 123 ',
    );

    expect(submission).toEqual({
      role: 'CUSTOMER',
      email: 'customer.name@example.com',
      password: ' PassWord 123 ',
    });
    expect(normalizeEmail(' Test@Example.COM ')).toBe('test@example.com');
  });

  it('preserves the Chef role through email submission and auth-route fallbacks', () => {
    const submission = createEmailSignInSubmission(
      'CHEF',
      '  Chef.Owner@Example.COM  ',
      ' Chef Password 123 ',
    );

    expect(submission).toEqual({
      role: 'CHEF',
      email: 'chef.owner@example.com',
      password: ' Chef Password 123 ',
    });
    expect(createEmailAuthRoleContext('CHEF')).toEqual({role: 'CHEF'});
    expect(
      createEmailPasswordRecoveryContext('CHEF', ' Chef.Owner@Example.COM '),
    ).toEqual({role: 'CHEF', email: 'chef.owner@example.com'});
    expect(createEmailPasswordRecoveryContext('CHEF', 'invalid-email')).toEqual({
      role: 'CHEF',
    });
  });

  it('keeps email and password validation errors field-specific', () => {
    expect(getEmailSignInFieldErrors('not-an-email', 'short')).toEqual({
      email: 'Enter a valid email address.',
      password: 'Password must be at least 8 characters.',
    });
    expect(getEmailSignInFieldErrors('valid@example.com', 'long-enough')).toEqual({});
  });

  it('prefills password recovery only when the normalized email is valid', () => {
    expect(getPasswordRecoveryEmail('  User@Example.COM ')).toBe('user@example.com');
    expect(getPasswordRecoveryEmail('invalid-email')).toBeUndefined();
    expect(isEmailAddressValid(' USER@EXAMPLE.COM ')).toBe(true);
  });

  it('allows only one active email login request at a time', () => {
    const gate = createEmailRequestGate();

    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });
});
