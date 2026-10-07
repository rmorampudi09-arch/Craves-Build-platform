import { expect, it } from "vitest";
import { phoneCodeRequestError, phoneCodeVerificationError } from "./phone-auth-errors";

it("does not blame an invisible security check for provider configuration or delivery failures", () => {
  expect(phoneCodeRequestError(new Error("OTP_WEB_UNAVAILABLE"))).toBe("Phone sign-in is temporarily unavailable. Please try again later.");
  expect(phoneCodeRequestError(new Error("OTP_TIMEOUT"))).toContain("took too long");
  expect(phoneCodeRequestError(new Error("OTP_CAPTCHA_TIMEOUT"))).toContain("security check timed out");
  expect(phoneCodeRequestError({ code: "auth/too-many-requests" })).toContain("Too many verification attempts");
});
it("never shows raw provider identifiers, credentials, or errors to the customer", () => {
  const result = phoneCodeRequestError(new Error("Provider failure for +919876543210 token=private-fixture"));
  expect(result).toBe("We couldn’t send the verification code. Please try again in a moment.");
  expect(result).not.toMatch(/9876543210|private-fixture|security check/);
});

it.each(["OTP_COOLDOWN", "OTP_BUSY", "OTP_RESTART", "OTP_EXPIRED", "OTP_RATE_LIMIT", "OTP_RESEND_LIMIT", "OTP_CANCELLED"])("maps %s into reviewed request instructions", code => {
  expect(phoneCodeRequestError(new Error(code))).not.toContain("OTP_");
});

it("makes wrong-code recovery understandable without displaying provider information", () => {
  expect(phoneCodeVerificationError(new Error("OTP_INVALID"))).toBe("That code is incorrect. Check the code and try again.");
  expect(phoneCodeVerificationError(new Error("+919876543210 private-token"))).not.toMatch(/9876543210|private-token/);
});
