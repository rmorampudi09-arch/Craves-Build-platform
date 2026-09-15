import { describe, expect, it, vi } from "vitest";
import { createReferralInvitationHandler, readSignupReferral } from "./invitation-handler.server";
import { referralCookie, verifyReferralTouch } from "./first-touch.server";

const first = "23456789ABCDEFGH", second = "ABCDEFGH23456789", key = new Uint8Array(32).fill(11);
const request = (code = first, cookie?: string) => new Request(`https://craves.in/r/${code}`, { headers: cookie ? { Cookie: cookie } : {} });
const setup = () => ({ enabled: true, attributionWindowApproved: true, publicOrigin: "https://craves.in", signupPath: "/sign-in", signingKey: key,
  resolveSession: vi.fn(async (): Promise<"anonymous" | "authenticated"> => "anonymous"), resolveActiveCode: vi.fn(async () => true), nowSeconds: () => 100 });
function cookie(response: Response): string {
  const value = response.headers.get("set-cookie");
  if (!value) throw new Error("Missing capture cookie");
  return value.split(";")[0];
}
describe("unmounted invitation-to-signup adapter", () => {
  it("captures a secure first touch and exposes the same code to authoritative signup", async () => {
    const options = setup(), response = await createReferralInvitationHandler(options)(request());
    expect(response.status).toBe(303); expect(response.headers.get("location")).toBe("https://craves.in/sign-in");
    expect(response.headers.get("cache-control")).toContain("no-store");
    for (const flag of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/"]) expect(response.headers.get("set-cookie")).toContain(flag);
    expect(readSignupReferral(request(first, cookie(response)), key, 101)).toBe(first);
    expect(options.resolveActiveCode).toHaveBeenCalledWith(first, expect.any(AbortSignal));
  });
  it("preserves first touch across another link and never extends its expiry", async () => {
    const original = await createReferralInvitationHandler(setup())(request());
    const options = { ...setup(), nowSeconds: () => 150 };
    const next = await createReferralInvitationHandler(options)(request(second, cookie(original)));
    expect(cookie(next)).toBe(cookie(original));
    expect(next.headers.get("set-cookie")).toContain(`Max-Age=${30 * 86400 - 50}`);
    expect(options.resolveActiveCode).toHaveBeenCalledWith(first, expect.any(AbortSignal));
    const token = cookie(next).slice(referralCookie.name.length + 1);
    expect(verifyReferralTouch(token, key, 150)?.expiresAt).toBe(100 + 30 * 86400);
  });
  it("does not re-parent existing accounts or write an attribution cookie for them", async () => {
    const options = setup(); options.resolveSession.mockResolvedValue("authenticated");
    const response = await createReferralInvitationHandler(options)(request());
    expect(response.status).toBe(303); expect(response.headers.has("set-cookie")).toBe(false); expect(options.resolveActiveCode).not.toHaveBeenCalled();
  });
  it("refuses invalid or duplicate cookies rather than silently dropping attribution", async () => {
    const options = setup(); const handler = createReferralInvitationHandler(options);
    for (const value of [`${referralCookie.name}=tampered`, `${referralCookie.name}=one; ${referralCookie.name}=two`]) {
      expect((await handler(request(first, value))).status).toBe(422);
      expect(() => readSignupReferral(request(first, value), key, 100)).toThrow();
    }
    expect(readSignupReferral(request(), key, 100)).toBeNull();
    expect(options.resolveActiveCode).not.toHaveBeenCalled();
  });
  it("fails closed when disabled, unapproved or either trusted lookup is unavailable", async () => {
    for (const overrides of [{ enabled: false }, { attributionWindowApproved: false }]) {
      const options = { ...setup(), ...overrides };
      const response = await createReferralInvitationHandler(options)(request());
      expect(response.status).toBe(503); expect(options.resolveSession).not.toHaveBeenCalled();
    }
    const options = setup(); options.resolveSession.mockRejectedValue(new Error("private detail"));
    const failed = await createReferralInvitationHandler(options)(request());
    expect(failed.status).toBe(503); expect(failed.headers.has("set-cookie")).toBe(false); expect(await failed.text()).not.toContain("private detail");
    const inactive = setup(); inactive.resolveActiveCode.mockResolvedValue(false);
    expect((await createReferralInvitationHandler(inactive)(request())).status).toBe(404);
  });
  it("refuses hostile origins, redirect inputs and mutations", async () => {
    const handler = createReferralInvitationHandler(setup());
    expect((await handler(new Request(`https://evil.example/r/${first}`))).status).toBe(404);
    expect((await handler(new Request(`https://craves.in/r/${first}?next=https://evil.example`))).status).toBe(404);
    expect((await handler(new Request(`https://craves.in/r/${first}`, { method: "POST" }))).status).toBe(405);
    expect(() => createReferralInvitationHandler({ ...setup(), signupPath: "//evil.example" })).toThrow();
  });
  it("does not treat an expired first touch as permission to assign a different parent", async () => {
    const initial = await createReferralInvitationHandler(setup())(request());
    const at = 100 + 30 * 86400;
    const response = await createReferralInvitationHandler({ ...setup(), nowSeconds: () => at })(request(second, cookie(initial)));
    expect(response.status).toBe(422); expect(response.headers.has("set-cookie")).toBe(false);
    expect(() => readSignupReferral(request(first, cookie(initial)), key, at)).toThrow();
  });
});
