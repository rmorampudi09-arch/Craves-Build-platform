import { OTPWidget } from '@msg91comm/sendotp-react-native';
import { z } from 'zod';
import { AppApiError } from '../../../core/http/apiError';
import { authApi } from '../api/authApi';

const processSchema = z.object({
  status: z.literal('success'),
  hasError: z.literal(false),
  data: z.object({
    status: z.object({ value: z.literal('1') }),
    processType: z.object({ value: z.enum(['1', '2']) }),
    verificationType: z.literal('1'),
    otpLength: z.literal(6),
    mobileIntegration: z.number(),
    invisible: z.literal(0),
    captchaValidations: z.literal(0),
    retryTime: z.number().int().min(1).max(600),
    retryCount: z.number().int().min(0).max(10),
    expiryTime: z.number().int().min(1).max(60),
  }),
});
const resultSchema = z.object({
  type: z.enum(['success', 'error']),
  message: z.string().optional(),
  'access-token': z.string().optional(),
});
type Policy = z.infer<typeof processSchema>['data'];
type Challenge = {
  phone: string;
  requestId: string;
  policy: Policy;
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
function successful(value: unknown, verifying = false) {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) {
    throw unavailable();
  }
  if (parsed.data.type !== 'success') {
    throw new AppApiError(
      verifying ? 'OTP_VERIFICATION_FAILED' : 'OTP_SEND_FAILED',
      verifying
        ? 'That code could not be verified. Check the six digits or request a new code.'
        : 'A code could not be sent. Wait a moment and try again.',
    );
  }
  return parsed.data;
}
function currentChallenge(phone?: string): Challenge {
  if (!challenge || challenge.used || (phone && phone !== challenge.phone)) {
    throw restart();
  }
  return challenge;
}

/** Provider challenge and credentials stay in memory, never navigation/storage/logs. */
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
      const config = await authApi.otpWidgetConfig();
      assertCurrent(attempt);
      await bounded(
        OTPWidget.initializeWidget(config.widgetId, config.tokenAuth),
      );
      const parsed = processSchema.safeParse(
        await bounded(OTPWidget.getWidgetProcess()),
      );
      assertCurrent(attempt);
      if (!parsed.success) {
        throw unavailable();
      }
      const policy = parsed.data.data;
      if (policy.mobileIntegration !== 1) {
        throw new AppApiError(
          'OTP_MOBILE_DISABLED',
          'Mobile verification is not enabled yet. Please try again shortly.',
        );
      }
      const resendAvailableAt = reserveSend(phone, policy.retryTime);
      const sent = successful(
        await bounded(OTPWidget.sendOTP({ identifier: phone.slice(1) })),
      );
      assertCurrent(attempt);
      if (!sent.message || sent.message.length > 200 || sent['access-token']) {
        throw unavailable();
      }
      challenge = {
        phone,
        requestId: sent.message,
        policy,
        resendAvailableAt,
        expiresAt: Date.now() + policy.expiryTime * 60000,
        resends: 0,
        used: false,
      };
    } finally {
      pending = false;
    }
  },
  async resendOtp(phone: string): Promise<void> {
    const active = currentChallenge(phone);
    if (active.resends >= active.policy.retryCount) {
      throw new AppApiError(
        'OTP_RESEND_LIMIT',
        'The resend limit was reached. Go back and start a new sign-in attempt shortly.',
      );
    }
    acquire();
    const attempt = generation;
    try {
      active.resendAvailableAt = reserveSend(phone, active.policy.retryTime);
      // Reserve before sending: a timed-out SMS request may still be delivered.
      active.resends += 1;
      const sent = successful(
        await bounded(OTPWidget.retryOTP({ reqId: active.requestId })),
      );
      assertCurrent(attempt);
      if (sent.message) {
        if (sent.message.length > 200) {
          throw unavailable();
        }
        active.requestId = sent.message;
      }
      active.expiresAt = Date.now() + active.policy.expiryTime * 60000;
    } finally {
      pending = false;
    }
  },
  async confirmOtp<T>(
    code: string,
    complete: (accessToken: string, assertActive: () => void) => Promise<T>,
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
      const verified = successful(
        await bounded(
          OTPWidget.verifyOTP({ reqId: active.requestId, otp: code }),
        ),
        true,
      );
      assertCurrent(attempt);
      active.used = true;
      const accessToken = verified['access-token'] ?? verified.message;
      if (
        !accessToken ||
        accessToken.length < 40 ||
        accessToken.length > 20000
      ) {
        throw restart();
      }
      return await complete(accessToken, () => assertCurrent(attempt));
    } catch (error) {
      if (error instanceof AppApiError && error.code === 'OTP_TIMEOUT') {
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
