import { expect, it } from "vitest";
import { phoneCodeRequestError, phoneCodeVerifyError } from "./phone-auth-errors";

it("shows reviewed copy, never a code, when a verification code is rejected", () => {
  expect(phoneCodeVerifyError(new Error("OTP_INVALID"))).toBe("That code didn’t match. Check the latest SMS and try again.");
  expect(phoneCodeVerifyError(new Error("OTP_RESTART"))).toContain("expired");
  expect(phoneCodeVerifyError({ code: "auth/invalid-verification-code" })).toContain("didn’t match");
  expect(phoneCodeVerifyError(new Error("OTP_SOMETHING_NEW"))).toBe("We couldn’t verify this code. Please try again.");
  expect(phoneCodeVerifyError(new Error("Firebase: Error (auth/internal-error)."))).not.toMatch(/Firebase|auth\//);
  expect(phoneCodeVerifyError(new Error("Invalid sign-in origin."))).not.toMatch(/origin/);
  // Human copy written by our own flow passes through.
  expect(phoneCodeVerifyError(new Error("Request a verification code for this number first."))).toBe("Request a verification code for this number first.");
});

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
