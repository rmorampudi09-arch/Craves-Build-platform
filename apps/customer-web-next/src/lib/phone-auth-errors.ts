/** Show only reviewed copy, never raw provider responses containing phone numbers or tokens. */
export function phoneCodeRequestError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (message === "OTP_COOLDOWN")
    return "Please wait for the resend countdown before requesting another code.";
  if (message === "OTP_BUSY")
    return "Verification is already in progress. Please wait a moment.";
  if (message === "OTP_RESEND_LIMIT")
    return "You have reached the resend limit. Start again to request a new code.";
  if (message === "OTP_CANCELLED" || message === "OTP_RESTART" || message === "OTP_EXPIRED")
    return "This verification has ended. Start again to request a new code.";
  if (message === "OTP_RATE_LIMIT" || code.includes("too-many-requests"))
    return "Too many verification attempts. Please try again later.";
  if (message === "OTP_WEB_UNAVAILABLE" || message === "OTP_UNAVAILABLE")
    return "Phone sign-in is temporarily unavailable. Please try again later.";
  if (message === "OTP_CAPTCHA_TIMEOUT")
    return "The security check timed out. Complete it and request a new code.";
  if (message === "OTP_TIMEOUT")
    return "The verification service took too long to respond. Please try again.";
  return "We couldn’t send the verification code. Please try again in a moment.";
}

/** Map only reviewed OTP errors; never render raw provider details. */
export function phoneCodeVerificationError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "OTP_INVALID") return "That code is incorrect. Check the code and try again.";
  if (message === "OTP_RESTART" || message === "OTP_EXPIRED" || message === "OTP_CANCELLED")
    return "This code has expired or verification has ended. Request a new code to continue.";
  if (message === "OTP_BUSY") return "Verification is already in progress. Please wait a moment.";
  if (message === "OTP_RATE_LIMIT") return "Too many verification attempts. Please try again later.";
  return "We couldn’t verify this code right now. Please try again.";
}
