import { z } from "zod";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const instant = z.string().max(40).datetime({ offset: true });
export const EMAIL_VERIFICATION_MAX_LENGTH = 254;
const LEGACY_AUTH_EMAIL_MAX_LENGTH = 320;

// Match Auth's EmailVerificationCrypto.normalizeEmail, including its supported ASCII local-part punctuation.
function authEmailSyntax(value: string): boolean {
  if (value.length < 5 || /[\u0000-\u0020\u007f-\uffff]/.test(value) ||
      !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(value)) return false;
  const at = value.indexOf("@");
  return !value.startsWith(".") && value[at - 1] !== "." && !value.includes("..") &&
    value.slice(at + 1).split(".").every((label) => label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"));
}

// Trim ordinary form padding, never control characters; Auth receives only the normalized accepted value.
export const verificationEmail = z.string()
  .refine((value) => !/[\u0000-\u001f\u007f-\uffff]/.test(value))
  .transform((value) => value.trim())
  .refine((value) => value.length <= EMAIL_VERIFICATION_MAX_LENGTH && value.indexOf("@") <= 64 && authEmailSyntax(value))
  .transform((value) => {
    const at = value.indexOf("@");
    return value.slice(0, at) + "@" + value.slice(at + 1).toLowerCase();
  });

// Existing Auth records use VARCHAR(320). Reading them must not impose newer enrollment length limits
// or rewrite their canonical value; only Auth's emailVerified flag establishes verification.
const canonicalAuthEmail = z.string().max(LEGACY_AUTH_EMAIL_MAX_LENGTH).refine(authEmailSyntax);

export const emailVerificationStateSchema = z.object({
  email: canonicalAuthEmail.nullable(),
  emailVerified: z.boolean(),
  emailRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  pending: z.object({
    challengeId: uuid,
    maskedEmail: z.string().min(3).max(320).refine((value) => !/[\r\n\u0000]/.test(value)),
    expiresAt: instant,
    resendAvailableAt: instant,
    deliveryStatus: z.enum(["PENDING", "ACCEPTED", "UNKNOWN", "UNAVAILABLE"]),
  }).strict().nullable(),
  serverTime: instant,
}).strict().refine((state) => !state.emailVerified || state.email !== null);

export type EmailVerificationState = z.infer<typeof emailVerificationStateSchema>;
export type EmailVerificationAction = "challenges" | "resend" | "verify";
export const emailVerificationRequests = {
  challenges: z.object({ email: verificationEmail, requestId: uuid }).strict(),
  resend: z.object({ challengeId: uuid, requestId: uuid }).strict(),
  verify: z.object({ challengeId: uuid, code: z.string().regex(/^\d{6}$/) }).strict(),
};

export const emailVerificationErrors: Record<string, { status: number; message: string }> = {
  EMAIL_INVALID: { status: 400, message: "Enter a valid email address." },
  EMAIL_REQUEST_INVALID: { status: 400, message: "Check the verification details and try again." },
  EMAIL_REQUEST_CONFLICT: { status: 409, message: "This request has changed. Refresh verification status before trying again." },
  EMAIL_CODE_INVALID: { status: 400, message: "This code is incorrect, expired or already used. Check your latest email or request a new code." },
  EMAIL_VERIFICATION_RATE_LIMITED: { status: 429, message: "Too many attempts. Wait before requesting or checking another code." },
  EMAIL_VERIFICATION_DISABLED: { status: 503, message: "Email verification is temporarily unavailable. Please try again later." },
  AUTHENTICATION_REQUIRED: { status: 401, message: "Your session has expired. Sign in again to verify your email." },
  IDENTITY_NOT_ACTIVE: { status: 403, message: "This account cannot verify an email. Contact Craves support." },
};

export function emailVerificationErrorMessage(code: unknown): string {
  return typeof code === "string" && Object.hasOwn(emailVerificationErrors, code)
    ? emailVerificationErrors[code].message
    : "Email verification could not be confirmed. Refresh status or retry your request.";
}

export function emailVerificationTiming(state: EmailVerificationState, serverNow: number) {
  return {
    expiresIn: state.pending ? Math.max(0, Math.ceil((Date.parse(state.pending.expiresAt) - serverNow) / 1000)) : 0,
    resendIn: state.pending ? Math.max(0, Math.ceil((Date.parse(state.pending.resendAvailableAt) - serverNow) / 1000)) : 0,
  };
}

export function chefEmailEligible(state: EmailVerificationState | null): boolean {
  return state?.emailVerified === true && !!state.email;
}
