import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidSchema = z.string().regex(UUID_PATTERN);
const instantSchema = z.string().max(40).refine(value => !Number.isNaN(Date.parse(value)));

function hasUnsupportedEmailCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 32 || code === 127 || code > 127) return true;
  }
  return false;
}

const authEmailSchema = z.string().min(5).max(320).refine(value => {
  if (hasUnsupportedEmailCharacter(value)) return false;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(value)) return false;
  const at = value.indexOf('@');
  return at > 0 && at <= 64 && !value.startsWith('.') && value[at - 1] !== '.' && !value.includes('..') &&
    value.slice(at + 1).split('.').every(label => label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'));
});

export const emailVerificationStateSchema = z.object({
  email: authEmailSchema.nullable(),
  emailVerified: z.boolean(),
  emailRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  pending: z.object({
    challengeId: uuidSchema,
    maskedEmail: z.string().min(3).max(320).refine(
      value => !value.includes('\r') && !value.includes('\n') && !value.includes(String.fromCharCode(0)),
    ),
    expiresAt: instantSchema,
    resendAvailableAt: instantSchema,
    deliveryStatus: z.enum(['PENDING', 'ACCEPTED', 'UNKNOWN', 'UNAVAILABLE']),
  }).strict().nullable(),
  serverTime: instantSchema,
}).strict().refine(state => !state.emailVerified || state.email !== null);

export type EmailVerificationState = z.infer<typeof emailVerificationStateSchema>;

function requireState(value: unknown): EmailVerificationState {
  const parsed = emailVerificationStateSchema.safeParse(value);
  if (!parsed.success) throw new Error('EMAIL_VERIFICATION_INVALID_RESPONSE');
  return parsed.data;
}

function requireRequestId(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error('EMAIL_VERIFICATION_INVALID_REQUEST_ID');
  return value;
}

function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  const at = trimmed.indexOf('@');
  const normalized = at > 0 ? trimmed.slice(0, at) + '@' + trimmed.slice(at + 1).toLowerCase() : trimmed;
  if (!authEmailSchema.safeParse(normalized).success || normalized.length > 254) {
    throw new Error('EMAIL_INVALID');
  }
  return normalized;
}

export function emailDeliveryMessage(state: EmailVerificationState): string {
  if (state.emailVerified && state.email) return 'Your email is verified.';
  if (!state.pending) return 'Send a verification code to confirm this email.';
  switch (state.pending.deliveryStatus) {
    case 'ACCEPTED': return `A verification code was sent to ${state.pending.maskedEmail}.`;
    case 'PENDING': return `Your verification email to ${state.pending.maskedEmail} is being sent.`;
    case 'UNKNOWN': return 'The email provider result is not confirmed yet. Check your inbox before requesting another code.';
    case 'UNAVAILABLE': return 'Email delivery is temporarily unavailable. Check status before trying again.';
  }
}

export const emailVerificationApi = {
  async read(): Promise<EmailVerificationState> {
    return requireState(await httpClient.get<unknown>('/api/v1/auth/email-verification', {dedupeKey: 'email-verification:state'}));
  },
  async issue(email: string, requestId: string): Promise<EmailVerificationState> {
    return requireState(await httpClient.post<unknown>('/api/v1/auth/email-verification/challenges', {
      email: normalizeEmail(email),
      requestId: requireRequestId(requestId),
    }));
  },
  async verify(challengeId: string, code: string): Promise<EmailVerificationState> {
    if (!UUID_PATTERN.test(challengeId) || !/^\d{6}$/.test(code)) throw new Error('EMAIL_REQUEST_INVALID');
    return requireState(await httpClient.post<unknown>('/api/v1/auth/email-verification/verify', {challengeId, code}));
  },
  async resend(challengeId: string, requestId: string): Promise<EmailVerificationState> {
    if (!UUID_PATTERN.test(challengeId)) throw new Error('EMAIL_REQUEST_INVALID');
    return requireState(await httpClient.post<unknown>('/api/v1/auth/email-verification/resend', {
      challengeId,
      requestId: requireRequestId(requestId),
    }));
  },
};
