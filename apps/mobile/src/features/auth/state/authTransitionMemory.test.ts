import {authTransitionMemory} from './authTransitionMemory';

describe('authTransitionMemory', () => {
  beforeEach(() => authTransitionMemory.clear());
  afterEach(() => authTransitionMemory.clear());

  it('keeps phone verification context in ephemeral module memory', () => {
    authTransitionMemory.setPendingPhone('+15551234567');
    expect(authTransitionMemory.getPendingPhone()).toBe('+15551234567');
    authTransitionMemory.clearPendingPhone();
    expect(authTransitionMemory.getPendingPhone()).toBeNull();
  });

  it('moves password-recovery email into a one-time login prefill without persistence', () => {
    authTransitionMemory.setPasswordRecoveryEmail('customer@example.com');
    expect(authTransitionMemory.getPasswordRecoveryEmail()).toBe('customer@example.com');
    expect(authTransitionMemory.takePasswordRecoveryEmail()).toBe('customer@example.com');
    expect(authTransitionMemory.getPasswordRecoveryEmail()).toBeNull();

    authTransitionMemory.setEmailPrefill('customer@example.com');
    expect(authTransitionMemory.takeEmailPrefill()).toBe('customer@example.com');
    expect(authTransitionMemory.takeEmailPrefill()).toBeNull();
  });

  it('clears all transient PII when a new auth attempt starts', () => {
    authTransitionMemory.setPendingPhone('+15551234567');
    authTransitionMemory.setPasswordRecoveryEmail('chef@example.com');
    authTransitionMemory.setEmailPrefill('chef@example.com');

    authTransitionMemory.clear();

    expect(authTransitionMemory.getPendingPhone()).toBeNull();
    expect(authTransitionMemory.getPasswordRecoveryEmail()).toBeNull();
    expect(authTransitionMemory.takeEmailPrefill()).toBeNull();
  });
});
