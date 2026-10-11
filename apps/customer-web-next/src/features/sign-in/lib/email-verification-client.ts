import { emailVerificationErrorMessage, emailVerificationStateSchema, type EmailVerificationAction, type EmailVerificationState } from "./email-verification-contract";

export class EmailVerificationClientError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(emailVerificationErrorMessage(code));
  }
}

export async function fetchEmailVerification(
  action?: EmailVerificationAction,
  body?: Record<string, string>,
  signal?: AbortSignal,
): Promise<EmailVerificationState> {
  try {
    const response = await fetch(`/api/auth/email-verification${action ? `/${action}` : ""}`, {
      method: action ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
    });
    const raw: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = raw && typeof raw === "object" && "code" in raw && typeof raw.code === "string" ? raw.code : "EMAIL_VERIFICATION_UNAVAILABLE";
      throw new EmailVerificationClientError(code, response.status);
    }
    const parsed = emailVerificationStateSchema.safeParse(raw);
    if (!parsed.success) throw new EmailVerificationClientError("EMAIL_VERIFICATION_RESPONSE_INVALID", 502);
    return parsed.data;
  } catch (error) {
    if (error instanceof EmailVerificationClientError) throw error;
    throw new EmailVerificationClientError("EMAIL_VERIFICATION_UNAVAILABLE", 503);
  }
}

export type EmailSendAttempt = { action: "challenges" | "resend"; body: Record<string, string> };

/** Keep this receipt in component memory on an unknown response. Retrying it cannot send another challenge. */
export function createEmailSendAttempt(action: "challenges" | "resend", value: string): EmailSendAttempt {
  return { action, body: { [action === "challenges" ? "email" : "challengeId"]: value.trim(), requestId: crypto.randomUUID() } };
}
