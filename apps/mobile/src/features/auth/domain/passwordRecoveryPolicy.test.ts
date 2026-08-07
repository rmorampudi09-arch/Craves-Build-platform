import {
  PASSWORD_RECOVERY_NEUTRAL_MESSAGE,
  createPasswordRecoveryRequestGate,
  createPasswordRecoverySubmission,
  createPasswordResetSentContext,
  getPasswordRecoveryEmailError,
} from './passwordRecoveryPolicy';

describe('passwordRecoveryPolicy', () => {
  it('normalizes recovery email and preserves the selected role', () => {
    expect(createPasswordRecoverySubmission('CHEF', '  Chef.Owner@Example.COM  ')).toEqual({
      role: 'CHEF',
      email: 'chef.owner@example.com',
    });
    expect(createPasswordResetSentContext('CUSTOMER', ' User@Example.COM ')).toEqual({
      role: 'CUSTOMER',
      email: 'user@example.com',
    });
  });

  it('keeps invalid email feedback field-specific', () => {
    expect(getPasswordRecoveryEmailError('not-an-email')).toBe('Enter a valid email address.');
    expect(getPasswordRecoveryEmailError(' valid@example.com ')).toBeUndefined();
  });

  it('uses neutral account-existence copy', () => {
    expect(PASSWORD_RECOVERY_NEUTRAL_MESSAGE).toContain('If a Craves account exists');
    expect(PASSWORD_RECOVERY_NEUTRAL_MESSAGE).not.toContain('account was found');
  });

  it('allows only one active recovery request at a time', () => {
    const gate = createPasswordRecoveryRequestGate();

    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });
});
