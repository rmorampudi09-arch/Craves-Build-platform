import { afterEach, describe, expect, it, vi } from "vitest";
import { chefEmailEligible, EMAIL_VERIFICATION_MAX_LENGTH, emailVerificationRequests, emailVerificationStateSchema, emailVerificationTiming, verificationEmail, type EmailVerificationState } from "./email-verification-contract";
import { getSession, loadSession, setSessionEmailVerification, setSessionIdentity, setSessionProfile } from "../services/auth/cravesAuth";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AccountCard } from "../components/profile/AccountCard";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const state: EmailVerificationState = { email: null, emailVerified: false, emailRevision: 0, pending: null, serverTime: "2026-09-14T10:00:00Z" };
const identity = { id, phoneNumber: "+10000000000", email: "canonical@example.invalid", emailVerified: true, displayName: "Fixture", status: "ACTIVE", roles: ["CUSTOMER"] };
const profile = { id, registeredPhoneNumber: identity.phoneNumber, firstName: "Test", lastName: "Fixture", email: "stale-projection@example.invalid", createdAt: state.serverTime, updatedAt: state.serverTime };
afterEach(() => vi.unstubAllGlobals());

describe("Auth-compatible email validation", () => {
  it("accepts all local-part punctuation supported by Auth and preserves its case", () => {
    for (const punctuation of "!#$%&'*+/=?^_`{|}~-.") {
      const email = `Chef${punctuation}Ops@EXAMPLE.COM`;
      expect(verificationEmail.parse(email)).toBe(`Chef${punctuation}Ops@example.com`);
      expect(emailVerificationStateSchema.parse({ ...state, email, emailVerified: true }).email).toBe(email);
    }
    expect(verificationEmail.parse("chef'@example.com")).toBe("chef'@example.com");
  });

  it("normalizes only new request addresses and accepts ordinary form padding", () => {
    expect(emailVerificationRequests.challenges.parse({ email: "  Chef!Ops@EXAMPLE.COM  ", requestId: id }))
      .toEqual({ email: "Chef!Ops@example.com", requestId: id });
    expect(emailVerificationStateSchema.safeParse({ ...state, email: " Chef@example.com " }).success).toBe(false);
  });

  it("enforces Auth's exact total and local-part enrollment length limits", () => {
    const domain = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(61)}`;
    const maximum = `${"L".repeat(64)}@${domain}`;
    expect(maximum).toHaveLength(EMAIL_VERIFICATION_MAX_LENGTH);
    expect(verificationEmail.parse(maximum)).toBe(maximum);
    expect(verificationEmail.safeParse(`${maximum}c`).success).toBe(false);
    expect(verificationEmail.safeParse(`${"L".repeat(65)}@example.com`).success).toBe(false);
    expect(verificationEmail.safeParse(`${"L".repeat(64)}@example.com`).success).toBe(true);
  });

  it("enforces Auth's domain label and top-level domain rules", () => {
    expect(verificationEmail.safeParse(`chef@${"a".repeat(63)}.com`).success).toBe(true);
    expect(verificationEmail.safeParse(`chef@${"a".repeat(64)}.com`).success).toBe(false);
    expect(verificationEmail.safeParse(`chef@example.${"a".repeat(63)}`).success).toBe(true);
    expect(verificationEmail.safeParse(`chef@example.${"a".repeat(64)}`).success).toBe(false);
    for (const email of ["chef@-example.com", "chef@example-.com", "chef@ok.-example.com", "chef@example.c", "chef@example.c0m", "chef@example_com"]) {
      expect(verificationEmail.safeParse(email).success).toBe(false);
    }
  });

  it("rejects malformed ASCII syntax, whitespace, Unicode, control characters and header injection", () => {
    for (const email of ["", ".chef@example.com", "chef.@example.com", "chef..ops@example.com", "chef@example..com", "chef@@example.com", "chef ops@example.com", '"chef"@example.com', "chef:ops@example.com", "chef<ops>@example.com", "ch\u00e9f@example.com", "chef@ex\u00e4mple.com", "\u00a0chef@example.com", "chef@example.com\u2000", "chef@example.com\r\nBcc:other@example.com", "chef@example.com\n", "\tchef@example.com", "chef\u0000@example.com", "chef\u007f@example.com"]) {
      expect(verificationEmail.safeParse(email).success).toBe(false);
      expect(emailVerificationStateSchema.safeParse({ ...state, email }).success).toBe(false);
    }
  });

  it("rejects non-string inputs and never coerces untrusted canonical status fields", () => {
    for (const email of [null, undefined, 123, true, {}, ["chef@example.com"]]) {
      expect(verificationEmail.safeParse(email).success).toBe(false);
      if (email !== null) expect(emailVerificationStateSchema.safeParse({ ...state, email }).success).toBe(false);
    }
    expect(emailVerificationStateSchema.safeParse({ ...state, email: null }).success).toBe(true);
  });

  it("reads legacy Auth addresses through 320 characters without accepting them as new enrollment", () => {
    const legacy = `${"L".repeat(65)}@${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}`;
    expect(legacy).toHaveLength(320);
    const saved = emailVerificationStateSchema.parse({ ...state, email: legacy, emailVerified: true, emailRevision: 1 });
    expect(saved.email).toBe(legacy);
    expect(chefEmailEligible(saved)).toBe(true);
    expect(verificationEmail.safeParse(legacy).success).toBe(false);
    expect(emailVerificationStateSchema.safeParse({ ...state, email: `L${legacy}` }).success).toBe(false);
    expect(chefEmailEligible(emailVerificationStateSchema.parse({ ...state, email: legacy }))).toBe(false);
  });
});

describe("email verification state and chef eligibility", () => {
  it("does not confuse an existing address, pending code or expired code with verification", () => {
    expect(chefEmailEligible(null)).toBe(false);
    expect(chefEmailEligible({ ...state, email: "legacy@example.invalid" })).toBe(false);
    expect(chefEmailEligible({ ...state, pending: { challengeId: id, maskedEmail: "l***@example.invalid", expiresAt: "2026-09-14T09:00:00Z", resendAvailableAt: state.serverTime, deliveryStatus: "ACCEPTED" } })).toBe(false);
    expect(chefEmailEligible({ ...state, email: "verified@example.invalid", emailVerified: true })).toBe(true);
  });
  it("uses elapsed time from Auth for resend and expiry boundaries", () => {
    const pending = { challengeId: id, maskedEmail: "t***@example.invalid", expiresAt: "2026-09-14T10:10:00Z", resendAvailableAt: "2026-09-14T10:01:00Z", deliveryStatus: "PENDING" as const };
    expect(emailVerificationTiming({ ...state, pending }, Date.parse(state.serverTime))).toEqual({ expiresIn: 600, resendIn: 60 });
    expect(emailVerificationTiming({ ...state, pending }, Date.parse("2026-09-14T10:01:00Z"))).toEqual({ expiresIn: 540, resendIn: 0 });
    expect(emailVerificationTiming({ ...state, pending }, Date.parse("2026-09-14T10:10:00Z"))).toEqual({ expiresIn: 0, resendIn: 0 });
  });
  it("keeps verified canonical email eligible while replacement is pending", () => {
    const replacement = { ...state, email: "current@example.invalid", emailVerified: true, emailRevision: 2, pending: { challengeId: id, maskedEmail: "n***@example.invalid", expiresAt: "2026-09-14T10:10:00Z", resendAvailableAt: "2026-09-14T10:01:00Z", deliveryStatus: "UNKNOWN" } };
    const parsed = emailVerificationStateSchema.parse(replacement);
    expect(chefEmailEligible(parsed)).toBe(true); expect(parsed.email).toBe("current@example.invalid");
  });
  it("rejects a false verified receipt without an email", () => {
    expect(emailVerificationStateSchema.safeParse({ ...state, emailVerified: true }).success).toBe(false);
  });
});

describe("canonical Auth email ownership", () => {
  it("does not replace Auth email with stale profile data or null", () => {
    setSessionIdentity(identity);
    setSessionProfile(profile); expect(getSession()?.email).toBe(identity.email); expect(getSession()?.emailVerified).toBe(true);
    setSessionProfile({ ...profile, email: null }); expect(getSession()?.email).toBe(identity.email);
  });
  it("ignores a verification response from a previous signed-in owner", () => {
    setSessionIdentity({ ...identity, id: other });
    setSessionEmailVerification(id, { ...state, email: "other-owner@example.invalid", emailVerified: true, emailRevision: 4 });
    expect(getSession()?.id).toBe(other); expect(getSession()?.email).toBe(identity.email);
  });
  it("ignores an earlier revision after a verified replacement", () => {
    setSessionIdentity(identity);
    setSessionEmailVerification(id, { ...state, email: "replacement@example.invalid", emailVerified: true, emailRevision: 2 });
    setSessionEmailVerification(id, { ...state, email: "old@example.invalid", emailVerified: false, emailRevision: 1 });
    expect(getSession()?.email).toBe("replacement@example.invalid"); expect(getSession()?.emailVerified).toBe(true);
  });
  it("preserves a verification that completes during profile hydration", async () => {
    setSessionIdentity({ ...identity, id: other });
    let resolveProfile: (response: Response) => void = () => undefined;
    let profileRequested: () => void = () => undefined;
    const requested = new Promise<void>((resolve) => { profileRequested = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/auth/me") return Response.json(identity);
      return new Promise<Response>((resolve) => { resolveProfile = resolve; profileRequested(); });
    }));
    const loading = loadSession();
    await requested;
    setSessionEmailVerification(id, { ...state, email: "new@example.invalid", emailVerified: true, emailRevision: 3 });
    resolveProfile(Response.json(profile));
    const current = await loading;
    expect(current?.email).toBe("new@example.invalid"); expect(current?.firstName).toBe("Test");
  });
  it("renders the canonical email and verification label without leaking a stale profile address", () => {
    setSessionIdentity(identity);
    const user = getSession()!;
    const html = renderToStaticMarkup(createElement(AccountCard, { user, profile, orderCount: 0, addressCount: 0, onEdit: () => undefined }));
    expect(html).toContain("canonical@example.invalid"); expect(html).not.toContain(profile.email); expect(html).toContain("Verified");
  });
});
