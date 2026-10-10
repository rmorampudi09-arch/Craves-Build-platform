/** Show only reviewed copy, never raw provider responses containing phone numbers or tokens. */
export function phoneCodeRequestError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (code.includes("too-many-requests"))
    return "Too many verification attempts. Please try again later.";
  if (message === "OTP_WEB_UNAVAILABLE" || message === "OTP_UNAVAILABLE")
    return "Phone sign-in is temporarily unavailable. Please try again later.";
  if (message === "OTP_CAPTCHA_TIMEOUT")
    return "The security check timed out. Complete it and request a new code.";
  if (message === "OTP_TIMEOUT")
    return "The verification service took too long to respond. Please try again.";
  return "We couldn’t send the verification code. Please try again in a moment.";
}

const VERIFY_COPY: Record<string, string> = {
  OTP_INVALID: "That code didn’t match. Check the latest SMS and try again.",
  OTP_EXPIRED: "This code has expired. Tap Resend for a new one.",
  OTP_RESTART: "This code has expired. Tap Resend for a new one.",
  OTP_RESEND_LIMIT: "You’ve asked for several codes. Please wait a few minutes and try again.",
  OTP_RATE_LIMIT: "Too many tries. Please wait a minute and try again.",
  OTP_COOLDOWN: "Too many tries. Please wait a minute and try again.",
  OTP_BUSY: "Too many tries. Please wait a minute and try again.",
  OTP_UNAVAILABLE: "We couldn’t verify your number right now. Please try again shortly.",
  OTP_CANCELLED: "Verification was cancelled. Please request a new code.",
};

/** Reviewed copy for a failed code check: codes, SDK text and session internals never reach the screen. */
export function phoneCodeVerifyError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (VERIFY_COPY[message]) return VERIFY_COPY[message];
  if (code.includes("invalid-verification-code")) return VERIFY_COPY.OTP_INVALID;
  if (code.includes("code-expired")) return VERIFY_COPY.OTP_EXPIRED;
  if (code.includes("too-many-requests")) return VERIFY_COPY.OTP_RATE_LIMIT;
  if (!message || /^[A-Z0-9_]+$/.test(message) || /firebase|origin|invalid .*response/i.test(message))
    return "We couldn’t verify this code. Please try again.";
  return message;
}
