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
