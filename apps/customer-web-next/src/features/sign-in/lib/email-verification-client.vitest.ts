import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailSendAttempt, EmailVerificationClientError, fetchEmailVerification } from "./email-verification-client";

const id = "11111111-1111-4111-8111-111111111111";
const state = { email: "Fixture@example.invalid", emailVerified: true, emailRevision: 1, pending: null, serverTime: "2026-09-14T10:00:00Z" };
afterEach(() => vi.unstubAllGlobals());
describe("email verification browser requests", () => {
  it("fetches current canonical state without sending an email on load", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(state)); vi.stubGlobal("fetch", fetcher);
    expect(await fetchEmailVerification()).toEqual(state);
    expect(fetcher.mock.calls[0]).toEqual(["/api/auth/email-verification", expect.objectContaining({ method: "GET", cache: "no-store", credentials: "same-origin" })]);
  });
  it("keeps the same issue receipt for retry after an unknown response", async () => {
    const attempt = createEmailSendAttempt("challenges", " Fixture@example.invalid ");
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json(state, { status: 202 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchEmailVerification(attempt.action, attempt.body)).rejects.toBeInstanceOf(EmailVerificationClientError);
    await fetchEmailVerification(attempt.action, attempt.body);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ email: "Fixture@example.invalid", requestId: attempt.body.requestId });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("resends using only the owned pending challenge and request receipt", async () => {
    const attempt = createEmailSendAttempt("resend", id);
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(state, { status: 202 })); vi.stubGlobal("fetch", fetcher);
    await fetchEmailVerification(attempt.action, attempt.body);
    expect(attempt.body).toEqual({ challengeId: id, requestId: expect.any(String) });
    expect(fetcher.mock.calls[0][0]).toBe("/api/auth/email-verification/resend");
  });
  it("keeps codes in POST bodies and never retries verification automatically", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("offline"); }); vi.stubGlobal("fetch", fetcher);
    await expect(fetchEmailVerification("verify", { challengeId: id, code: "000123" })).rejects.toThrow("could not be confirmed");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/auth/email-verification/verify");
    expect(fetcher.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "POST", body: JSON.stringify({ challengeId: id, code: "000123" }) }));
  });
  for (const [status, code, text] of [[401, "AUTHENTICATION_REQUIRED", "Sign in again"], [400, "EMAIL_CODE_INVALID", "incorrect, expired or already used"], [429, "EMAIL_VERIFICATION_RATE_LIMITED", "Too many attempts"], [503, "EMAIL_VERIFICATION_DISABLED", "temporarily unavailable"]] as const) {
    it(`provides safe ${status} guidance without server messages`, async () => {
      vi.stubGlobal("fetch", async () => Response.json({ code, message: "private provider detail" }, { status }));
      await expect(fetchEmailVerification()).rejects.toThrow(text);
    });
  }
  it("rejects malformed success instead of claiming verification", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ ...state, email: null }));
    await expect(fetchEmailVerification()).rejects.toThrow("could not be confirmed");
  });
});
