import {otpSchema} from '../../../utils/validation';

export const OTP_CODE_LENGTH = 6;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const OTP_RATE_LIMIT_MINIMUM_COOLDOWN_SECONDS = 60;

export function sanitizeOtpCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
}

export function isOtpCodeComplete(code: string): boolean {
  return otpSchema.safeParse(code).success;
}

export interface OtpRequestGate {
  tryAcquire: () => boolean;
  release: () => void;
}

export function createOtpRequestGate(): OtpRequestGate {
  let active = false;

  return {
    tryAcquire() {
      if (active) {
        return false;
      }
      active = true;
      return true;
    },
    release() {
      active = false;
    },
  };
}

export function createOtpCooldownDeadline(
  seconds: number,
  nowMs = Date.now(),
): number {
  return nowMs + Math.max(0, seconds) * 1000;
}

export function remainingOtpCooldownSeconds(
  deadlineMs: number,
  nowMs = Date.now(),
): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export interface OtpFailureRecovery {
  clearCode: boolean;
  requiresResend: boolean;
  minimumCooldownSeconds: number;
}

const NO_RECOVERY_CHANGE: OtpFailureRecovery = {
  clearCode: false,
  requiresResend: false,
  minimumCooldownSeconds: 0,
};

export function getOtpFailureRecovery(errorCode: string): OtpFailureRecovery {
  if (errorCode === 'INVALID_OTP') {
    return {...NO_RECOVERY_CHANGE, clearCode: true};
  }

  if (errorCode === 'OTP_EXPIRED') {
    return {
      clearCode: true,
      requiresResend: true,
      minimumCooldownSeconds: 0,
    };
  }

  if (errorCode === 'OTP_RATE_LIMITED') {
    return {
      clearCode: false,
      requiresResend: false,
      minimumCooldownSeconds: OTP_RATE_LIMIT_MINIMUM_COOLDOWN_SECONDS,
    };
  }

  return NO_RECOVERY_CHANGE;
}
