import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CravesIdentity } from "./auth-contract";
import type { EmailVerificationState } from "./email-verification-contract";
import {
  captureSessionContext, clearSession, getSession, getSessionEmailRevision, isSessionContextCurrent,
  isSessionReady, loadSession, LogoutUnconfirmedError, setSessionEmailVerification, setSessionIdentity, synchronizeSessionRoles,
} from "../services/auth/cravesAuth";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const identity: CravesIdentity = {
  id: owner, phoneNumber: "+10000000000", displayName: "First owner", email: "old@example.invalid",
  emailVerified: false, status: "ACTIVE", roles: ["CHEF"],
};
const verified: EmailVerificationState = {
  email: "confirmed!chef@example.invalid", emailVerified: true, emailRevision: 7,
  pending: null, serverTime: "2026-09-14T10:00:00Z",
};
const profile = {
  id: "33333333-3333-4333-8333-333333333333", registeredPhoneNumber: identity.phoneNumber,
  firstName: "First", lastName: "Profile", email: "stale-projection@example.invalid",
  createdAt: verified.serverTime, updatedAt: verified.serverTime,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function startNextSession(id = other) {
  return setSessionIdentity({ ...identity, id, email: "new-login@example.invalid", displayName: "New login" });
}
function acceptVerifiedEmail() {
  setSessionEmailVerification(owner, verified, captureSessionContext());
}
function expectVerifiedEmail() {
  expect(getSession()?.email).toBe(verified.email);
  expect(getSession()?.emailVerified).toBe(true);
  expect(getSessionEmailRevision()).toBe(verified.emailRevision);
}
beforeEach(() => {
  setSessionIdentity(identity);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected mocked request"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("email verification racing actual session requests", () => {
  it("preserves a verification completed while /me is pending and still updates roles", async () => {
    const lookup = deferred<Response>();
    const fetcher = vi.fn(() => lookup.promise);
    vi.stubGlobal("fetch", fetcher);
    const loading = loadSession();
    acceptVerifiedEmail();
    lookup.resolve(Response.json({ ...identity, roles: ["CHEF", "SUPPORT"] }));
    const result = await loading;
    expectVerifiedEmail();
    expect(result?.roles).toEqual(["CHEF", "SUPPORT"]);
    expect(fetcher.mock.calls).toHaveLength(1);
  });

  it("preserves a verification completed while refresh is pending and still updates roles", async () => {
    const refresh = deferred<Response>();
    const fetcher = vi.fn(() => refresh.promise);
    vi.stubGlobal("fetch", fetcher);
    const synchronizing = synchronizeSessionRoles();
    acceptVerifiedEmail();
    refresh.resolve(Response.json({ identity: { ...identity, roles: ["CHEF", "ADMIN"] } }));
    const result = await synchronizing;
    expectVerifiedEmail();
    expect(result?.roles).toEqual(["CHEF", "ADMIN"]);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/refresh", expect.objectContaining({ method: "POST" }));
  });

  it("applies a changed account status without rolling back the versioned email", async () => {
    const lookup = deferred<Response>();
    vi.stubGlobal("fetch", () => lookup.promise);
    const prior = captureSessionContext();
    const loading = loadSession();
    acceptVerifiedEmail();
    lookup.resolve(Response.json({ ...identity, status: "SUSPENDED" }));
    await loading;
    expectVerifiedEmail();
    expect(getSession()?.status).toBe("SUSPENDED");
    expect(isSessionReady()).toBe(false);
    expect(isSessionContextCurrent(prior)).toBe(false);
  });

  for (const nextOwner of [other, owner]) {
    it(`ignores a pending /me response after ${nextOwner === owner ? "same-owner re-login" : "account switch"}`, async () => {
      const lookup = deferred<Response>();
      const fetcher = vi.fn(() => lookup.promise);
      vi.stubGlobal("fetch", fetcher);
      const prior = captureSessionContext();
      const loading = loadSession();
      const current = startNextSession(nextOwner);
      lookup.resolve(Response.json(identity));
      expect(await loading).toBe(current);
      expect(getSession()).toBe(current);
      expect(isSessionContextCurrent(prior)).toBe(false);
      expect(getSessionEmailRevision()).toBe(-1);
      expect(fetcher.mock.calls).toHaveLength(1);
    });

    it(`ignores a pending refresh response after ${nextOwner === owner ? "same-owner re-login" : "account switch"}`, async () => {
      const refresh = deferred<Response>();
      vi.stubGlobal("fetch", () => refresh.promise);
      const synchronizing = synchronizeSessionRoles();
      const current = startNextSession(nextOwner);
      refresh.resolve(Response.json({ identity: { ...identity, roles: ["ADMIN"] } }));
      expect(await synchronizing).toBe(current);
      expect(getSession()).toBe(current);
      expect(getSession()?.roles).toEqual(["CHEF"]);
    });
  }

  it("does not clear a new login or attempt refresh for an old /me 401", async () => {
    const lookup = deferred<Response>();
    const fetcher = vi.fn(() => lookup.promise);
    vi.stubGlobal("fetch", fetcher);
    const loading = loadSession();
    const current = startNextSession();
    lookup.resolve(Response.json({}, { status: 401 }));
    expect(await loading).toBe(current);
    expect(getSession()).toBe(current);
    expect(fetcher.mock.calls).toHaveLength(1);
  });

  it("does not clear a newer successful lookup when an older same-generation lookup fails", async () => {
    const older = deferred<Response>();
    const newer = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise));
    const oldLoading = loadSession();
    const newLoading = loadSession();
    newer.resolve(Response.json({ ...identity, displayName: "Fresh lookup", roles: ["CHEF", "SUPPORT"] }));
    const current = await newLoading;
    older.resolve(Response.json({}, { status: 403 }));
    expect(await oldLoading).toBe(current);
    expect(getSession()).toBe(current);
    expect(getSession()?.username).toBe("Fresh lookup");
    expect(isSessionReady()).toBe(true);
  });

  it("does not replace a newer successful lookup when an older JSON body arrives last", async () => {
    const body = deferred<CravesIdentity>();
    const bodyStarted = deferred<void>();
    const oldResponse = new Response();
    vi.spyOn(oldResponse, "json").mockImplementation(() => { bodyStarted.resolve(); return body.promise; });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(oldResponse).mockResolvedValueOnce(Response.json({ ...identity, roles: ["CHEF", "SUPPORT"] })));
    const oldLoading = loadSession();
    await bodyStarted.promise;
    const current = await loadSession();
    body.resolve({ ...identity, roles: ["CHEF", "ADMIN"] });
    expect(await oldLoading).toBe(current);
    expect(getSession()?.roles).toEqual(["CHEF", "SUPPORT"]);
  });

  it("keeps the new owner after an older network lookup failure", async () => {
    const lookup = deferred<Response>();
    vi.stubGlobal("fetch", () => lookup.promise);
    const loading = loadSession();
    const failure = expect(loading).rejects.toThrow("Fixture network failure");
    const current = startNextSession();
    lookup.reject(new Error("Fixture network failure"));
    await failure;
    expect(getSession()).toBe(current);
  });

  it("preserves verified email through the /me 401, refresh, second /me path", async () => {
    const refresh = deferred<Response>();
    const refreshStarted = deferred<void>();
    let lookups = 0;
    const fetcher = vi.fn((url: string) => {
      if (url === "/api/auth/refresh") { refreshStarted.resolve(); return refresh.promise; }
      if (url === "/api/auth/me") {
        lookups += 1;
        return Promise.resolve(lookups === 1 ? Response.json({}, { status: 401 }) : Response.json({ ...identity, roles: ["CHEF", "SUPPORT"] }));
      }
      throw new Error("Unexpected mocked request");
    });
    vi.stubGlobal("fetch", fetcher);
    const loading = loadSession();
    await refreshStarted.promise;
    acceptVerifiedEmail();
    refresh.resolve(Response.json({ refreshed: true }));
    await loading;
    expectVerifiedEmail();
    expect(getSession()?.roles).toEqual(["CHEF", "SUPPORT"]);
    expect(lookups).toBe(2);
  });

  it("does not perform the follow-up /me when a fallback refresh crosses a login", async () => {
    const refresh = deferred<Response>();
    const refreshStarted = deferred<void>();
    const fetcher = vi.fn((url: string) => {
      if (url === "/api/auth/refresh") { refreshStarted.resolve(); return refresh.promise; }
      return Promise.resolve(Response.json({}, { status: 401 }));
    });
    vi.stubGlobal("fetch", fetcher);
    const loading = loadSession();
    await refreshStarted.promise;
    const current = startNextSession(owner);
    refresh.resolve(Response.json({ refreshed: true }));
    expect(await loading).toBe(current);
    expect(fetcher.mock.calls).toHaveLength(2);
    expect(getSession()).toBe(current);
  });
});

describe("logout and refresh generation boundaries", () => {
  it("invalidates requests at logout start and never restores the account after confirmed logout", async () => {
    const lookup = deferred<Response>();
    const logout = deferred<Response>();
    const fetcher = vi.fn((url: string) => url === "/api/auth/logout" ? logout.promise : lookup.promise);
    vi.stubGlobal("fetch", fetcher);
    const before = captureSessionContext();
    const loading = loadSession();
    const signingOut = clearSession();
    expect(isSessionContextCurrent(before)).toBe(false);
    expect(isSessionReady()).toBe(false);
    expect(getSession()?.id).toBe(owner);
    expect(await loadSession()).toBeNull();
    expect(await synchronizeSessionRoles()).toBeNull();
    logout.resolve(Response.json({ signedOut: true }));
    await signingOut;
    lookup.resolve(Response.json(identity));
    expect(await loading).toBeNull();
    expect(getSession()).toBeNull();
    expect(getSessionEmailRevision()).toBe(-1);
    expect(fetcher.mock.calls).toHaveLength(2);
  });

  it("retains the verified account on unconfirmed logout while invalidating earlier reads", async () => {
    const lookup = deferred<Response>();
    const logout = deferred<Response>();
    vi.stubGlobal("fetch", (url: string) => url === "/api/auth/logout" ? logout.promise : lookup.promise);
    acceptVerifiedEmail();
    const loading = loadSession();
    const signingOut = clearSession();
    const rejection = expect(signingOut).rejects.toThrow("You are still signed in");
    const ending = captureSessionContext();
    logout.resolve(Response.json({ signedOut: false }, { status: 503 }));
    await rejection;
    expect(isSessionContextCurrent(ending)).toBe(false);
    expect(isSessionReady()).toBe(true);
    lookup.resolve(Response.json({}, { status: 403 }));
    await loading;
    expect(getSession()?.id).toBe(owner);
    expectVerifiedEmail();
  });

  it("does not clear a new same-owner login when an older logout receipt arrives", async () => {
    const logout = deferred<Response>();
    vi.stubGlobal("fetch", () => logout.promise);
    const signingOut = clearSession();
    const rejection = expect(signingOut).rejects.toThrow("Sign-out could not be confirmed");
    const current = startNextSession(owner);
    logout.resolve(Response.json({ signedOut: true }));
    await rejection;
    expect(getSession()).toBe(current);
    expect(isSessionReady()).toBe(true);
  });

  it("shares refresh only within a generation and old completion cannot erase a new in-flight refresh", async () => {
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
      .mockResolvedValueOnce(Response.json({ identity: { ...identity, id: other, roles: ["CHEF", "SUPPORT"] } }));
    vi.stubGlobal("fetch", fetcher);
    const oldFirst = synchronizeSessionRoles();
    const oldSecond = synchronizeSessionRoles();
    expect(fetcher.mock.calls).toHaveLength(1);
    startNextSession();
    const newFirst = synchronizeSessionRoles();
    const newSecond = synchronizeSessionRoles();
    expect(fetcher.mock.calls).toHaveLength(2);
    older.resolve(Response.json({ identity }));
    await Promise.all([oldFirst, oldSecond]);
    const newThird = synchronizeSessionRoles();
    expect(fetcher.mock.calls).toHaveLength(2);
    newer.resolve(Response.json({ identity: { ...identity, id: other, email: "fresh@example.invalid", roles: ["CHEF", "ADMIN"] } }));
    await Promise.all([newFirst, newSecond, newThird]);
    expect(getSession()?.id).toBe(other);
    expect(getSession()?.roles).toEqual(["CHEF", "ADMIN"]);
    await synchronizeSessionRoles();
    expect(fetcher.mock.calls).toHaveLength(3);
    expect(getSession()?.roles).toEqual(["CHEF", "SUPPORT"]);
  });
});

describe("profile hydration request ownership", () => {
  for (const nextOwner of [other, owner]) {
    it(`ignores a profile response crossing ${nextOwner === owner ? "same-owner re-login" : "an account switch"}`, async () => {
      const pendingProfile = deferred<Response>();
      const profileStarted = deferred<void>();
      const fetcher = vi.fn((url: string) => {
        if (url === "/api/auth/me") return Promise.resolve(Response.json({ ...identity, roles: ["CUSTOMER"] }));
        if (url === "/api/customer/profile") { profileStarted.resolve(); return pendingProfile.promise; }
        throw new Error("Unexpected mocked request");
      });
      vi.stubGlobal("fetch", fetcher);
      const loading = loadSession();
      await profileStarted.promise;
      const current = startNextSession(nextOwner);
      pendingProfile.resolve(Response.json(profile));
      expect(await loading).toBe(current);
      expect(getSession()).toBe(current);
      expect(getSession()?.firstName).toBeNull();
      expect(getSession()?.profileComplete).toBe(false);
    });
  }

  it("checks ownership again after an asynchronously parsed profile body", async () => {
    const body = deferred<unknown>();
    const parsing = deferred<void>();
    const profileResponse = new Response();
    vi.spyOn(profileResponse, "json").mockImplementation(() => { parsing.resolve(); return body.promise; });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ ...identity, roles: ["CUSTOMER"] })).mockResolvedValueOnce(profileResponse));
    const loading = loadSession();
    await parsing.promise;
    const current = startNextSession();
    body.resolve(profile);
    expect(await loading).toBe(current);
    expect(getSession()).toBe(current);
    expect(getSession()?.firstName).toBeNull();
  });

  it("hydrates current-owner names while preserving a newer verified email", async () => {
    const pendingProfile = deferred<Response>();
    const profileStarted = deferred<void>();
    vi.stubGlobal("fetch", (url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(Response.json({ ...identity, roles: ["CUSTOMER"] }));
      profileStarted.resolve(); return pendingProfile.promise;
    });
    const loading = loadSession();
    await profileStarted.promise;
    acceptVerifiedEmail();
    pendingProfile.resolve(Response.json(profile));
    const current = await loading;
    expect(current?.firstName).toBe(profile.firstName);
    expect(current?.profileComplete).toBe(true);
    expectVerifiedEmail();
  });
});


describe("session-scoped logout failure receipts", () => {
  it("returns a retry context for the ready session restored by an unconfirmed logout", async () => {
    const previous = captureSessionContext();
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ signedOut: false }, { status: 503 })));
    const failure = await clearSession().catch(error => error);
    expect(failure).toBeInstanceOf(LogoutUnconfirmedError);
    expect(failure.message).toContain("Sign-out could not be confirmed");
    expect(failure.retryContext).toEqual(captureSessionContext());
    expect(isSessionContextCurrent(failure.retryContext)).toBe(true);
    expect(isSessionContextCurrent(previous)).toBe(false);
    expect(isSessionReady()).toBe(true);
    startNextSession(owner);
    expect(isSessionContextCurrent(failure.retryContext)).toBe(false);
  });

  for (const nextOwner of [owner, other]) {
    it(`never offers an old logout retry after ${nextOwner === owner ? "same-owner login" : "account switch"}`, async () => {
      const receipt = deferred<Response>();
      vi.stubGlobal("fetch", () => receipt.promise);
      const signingOut = clearSession().catch(error => error);
      startNextSession(nextOwner);
      const current = captureSessionContext();
      receipt.resolve(Response.json({ signedOut: false }, { status: 503 }));
      const failure = await signingOut;
      expect(failure).toBeInstanceOf(LogoutUnconfirmedError);
      expect(failure.retryContext).toBeNull();
      expect(captureSessionContext()).toEqual(current);
      expect(isSessionReady()).toBe(true);
    });
  }
});
