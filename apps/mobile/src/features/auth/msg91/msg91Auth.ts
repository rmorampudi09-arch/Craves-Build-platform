import { AppApiError } from '../../../core/http/apiError';
import { authApi } from '../api/authApi';

type Challenge = {
  phone: string;
  requestId: string;
  resendAvailableAt: number;
  expiresAt: number;
  resends: number;
  used: boolean;
};

let challenge: Challenge | null = null;
let generation = 0;
let pending = false;
const recentSends = new Map<string, number>();

function unavailable(): AppApiError {
  return new AppApiError(
    'OTP_UNAVAILABLE',
    'Phone verification is temporarily unavailable. Please try again shortly.',
  );
}
function restart(): AppApiError {
  return new AppApiError(
    'OTP_RESTART',
    'This verification request has ended. Go back and request a new code.',
  );
}
function assertCurrent(attempt: number): void {
  if (attempt !== generation) {
    throw new AppApiError(
      'OTP_CANCELLED',
      'This sign-in attempt has ended. Request a new code.',
      undefined,
      undefined,
      false,
      true,
    );
  }
}
function acquire(): void {
  if (pending) {
    throw new AppApiError(
      'OTP_BUSY',
      'A verification request is already in progress. Please wait.',
    );
  }
  pending = true;
}
async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new AppApiError(
                'OTP_TIMEOUT',
                'Verification took too long. Please wait before requesting another code.',
              ),
            ),
          30000,
        );
      }),
    ]);
  } catch (error) {
    throw error instanceof AppApiError ? error : unavailable();
  } finally {
    clearTimeout(timer);
  }
}
function reserveSend(phone: string, seconds: number): number {
  const now = Date.now();
  for (const [key, deadline] of recentSends) {
    if (deadline <= now) {
      recentSends.delete(key);
    }
  }
  const previous = recentSends.get(phone) ?? 0;
  if (previous > now) {
    throw new AppApiError(
      'OTP_COOLDOWN',
      `Please wait ${Math.ceil(
        (previous - now) / 1000,
      )} seconds before requesting another code.`,
    );
  }
  const deadline = now + seconds * 1000;
  recentSends.set(phone, deadline);
  return deadline;
}
function currentChallenge(phone?: string): Challenge {
  if (!challenge || challenge.used || (phone && phone !== challenge.phone)) {
    throw restart();
  }
  return challenge;
}

/** Only an opaque Craves challenge stays in memory, never navigation/storage/logs. */
export const msg91Auth = {
  async beginPhoneSignIn(phone: string): Promise<void> {
    if (!/^\+91[6-9]\d{9}$/.test(phone)) {
      throw new AppApiError(
        'INVALID_PHONE',
        'Enter a valid Indian mobile number.',
      );
    }
    acquire();
    const attempt = ++generation;
    challenge = null;
    try {
      reserveSend(phone, 30);
      const sent = await bounded(authApi.sendPhoneOtp(phone));
      assertCurrent(attempt);
      challenge = {
        phone,
        requestId: sent.challengeId,
        resendAvailableAt: sent.resendAvailableAt,
        expiresAt: sent.expiresAt,
        resends: 0,
        used: false,
      };
    } finally {
      pending = false;
    }
  },
  async resendOtp(phone: string): Promise<void> {
    const active = currentChallenge(phone);
    if (active.resends >= 2) {
      throw new AppApiError(
        'OTP_RESEND_LIMIT',
        'The resend limit was reached. Go back and start a new sign-in attempt shortly.',
      );
    }
    acquire();
    const attempt = generation;
    let requested = false;
    try {
      active.resendAvailableAt = reserveSend(phone, 30);
      // Reserve before sending: a timed-out SMS request may still be delivered.
      active.resends += 1;
      requested = true;
      const sent = await bounded(authApi.sendPhoneOtp(phone, active.requestId));
      assertCurrent(attempt);
      active.requestId = sent.challengeId;
      active.resendAvailableAt = sent.resendAvailableAt;
      active.expiresAt = sent.expiresAt;
    } catch (error) {
      if (requested) {
        active.used = true;
      }
      throw error;
    } finally {
      pending = false;
    }
  },
  async confirmOtp<T>(
    code: string,
    complete: (customToken: string, assertActive: () => void) => Promise<T>,
  ): Promise<T> {
    const active = currentChallenge();
    if (!/^\d{6}$/.test(code)) {
      throw new AppApiError(
        'INVALID_OTP',
        'Enter the six-digit verification code.',
      );
    }
    if (Date.now() >= active.expiresAt) {
      throw new AppApiError(
        'OTP_EXPIRED',
        'This code has expired. Request a new code.',
      );
    }
    acquire();
    const attempt = generation;
    try {
      const customToken = await bounded(
        authApi.verifyPhoneOtp(active.requestId, code),
      );
      assertCurrent(attempt);
      active.used = true;
      return await complete(customToken, () => assertCurrent(attempt));
    } catch (error) {
      if (
        !(error instanceof AppApiError) ||
        !['OTP_INVALID', 'OTP_BUSY'].includes(error.code)
      ) {
        active.used = true;
      }
      throw error;
    } finally {
      pending = false;
    }
  },
  resendAvailableAt(): number {
    return challenge?.resendAvailableAt ?? Date.now();
  },
  cancel(): void {
    generation += 1;
    challenge = null;
  },
};
