import { expect, it } from "vitest";
import { phoneCodeRequestError } from "./phone-auth-errors";

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
