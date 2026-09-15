import {
  createOtpCooldownDeadline,
  createOtpRequestGate,
  getOtpFailureRecovery,
  isOtpCodeComplete,
  OTP_RATE_LIMIT_MINIMUM_COOLDOWN_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  remainingOtpCooldownSeconds,
  sanitizeOtpCode,
} from './otpVerificationPolicy';

describe('OTP verification policy', () => {
  it('sanitizes pasted input to the six-digit verification boundary', () => {
    expect(sanitizeOtpCode('12 34-56abc78')).toBe('123456');
    expect(isOtpCodeComplete('123456')).toBe(true);
    expect(isOtpCodeComplete('12345')).toBe(false);
  });

  it('uses a deadline-based resend cooldown so background time is not lost', () => {
    const now = 1_000_000;
    const deadline = createOtpCooldownDeadline(OTP_RESEND_COOLDOWN_SECONDS, now);

    expect(remainingOtpCooldownSeconds(deadline, now)).toBe(30);
    expect(remainingOtpCooldownSeconds(deadline, now + 10_250)).toBe(20);
    expect(remainingOtpCooldownSeconds(deadline, now + 30_000)).toBe(0);
  });

  it('guards verify and resend through one synchronous request gate', () => {
    const gate = createOtpRequestGate();

    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);

    gate.release();

    expect(gate.tryAcquire()).toBe(true);
  });

  it('clears an invalid code but keeps the current challenge retryable', () => {
    expect(getOtpFailureRecovery('INVALID_OTP')).toEqual({
      clearCode: true,
      requiresResend: false,
      minimumCooldownSeconds: 0,
    });
  });

  it('requires a fresh code after an expired or missing challenge', () => {
    expect(getOtpFailureRecovery('OTP_EXPIRED')).toEqual({
      clearCode: true,
      requiresResend: true,
      minimumCooldownSeconds: 0,
    });
  });

  it('applies a minimum local cooldown after provider rate limiting', () => {
    expect(getOtpFailureRecovery('OTP_RATE_LIMITED')).toEqual({
      clearCode: false,
      requiresResend: false,
      minimumCooldownSeconds: OTP_RATE_LIMIT_MINIMUM_COOLDOWN_SECONDS,
    });
  });
});
