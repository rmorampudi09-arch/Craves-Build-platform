import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CravesIdentity } from "./auth-contract";
import type { CustomerProfile } from "./profile-contract";

const identity: CravesIdentity = {
  id: "11111111-1111-4111-8111-111111111111",
  phoneNumber: "+10000000000",
  displayName: "Auth name",
  email: "auth@example.invalid",
  emailVerified: false,
  status: "ACTIVE",
  roles: ["CUSTOMER"],
};
const profile: CustomerProfile = {
  id: "33333333-3333-4333-8333-333333333333",
  registeredPhoneNumber: identity.phoneNumber,
  firstName: "Customer",
  lastName: "Name",
  email: "stale-projection@example.invalid",
  createdAt: "2026-09-14T10:00:00Z",
  updatedAt: "2026-09-14T10:00:00Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let auth: typeof import("../services/auth/cravesAuth");
beforeEach(async () => {
  vi.resetModules();
  auth = await import("../services/auth/cravesAuth");
  auth.setSessionIdentity(identity);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("session navigation request sharing", () => {
  it("shares identity and profile requests while background callers can render before awaited hydration", async () => {
    const lookup = deferred<Response>();
    const hydration = deferred<Response>();
    const fetcher = vi.fn((url: string) => url === "/api/auth/me" ? lookup.promise : hydration.promise);
    vi.stubGlobal("fetch", fetcher);

    const background = auth.loadSession({ hydrateCustomerProfile: "background" });
    const awaited = auth.loadSession();
    const another = auth.loadSession();
    lookup.resolve(Response.json(identity));
    expect((await background)?.id).toBe(identity.id);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me", "/api/customer/profile"]);
    let finished = false;
    void awaited.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);

    hydration.resolve(Response.json(profile));
    const results = await Promise.all([awaited, another]);
    expect(results.every(user => user?.username === "Customer Name")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps fresh profile display fields but checks Auth roles on every subsequent navigation", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const originalCreatedAt = auth.getSession()!.createdAt;
    auth.setSessionProfile(profile);
    auth.setSessionEmailVerification(identity.id, {
      email: "verified@example.invalid", emailVerified: true, emailRevision: 8,
      pending: null, serverTime: profile.createdAt,
    });
    const fetcher = vi.fn(async (url: string) => {
      if (url !== "/api/auth/me") throw new Error("Unexpected profile request");
      return Response.json({ ...identity, roles: ["CUSTOMER", "CHEF"] });
    });
    vi.stubGlobal("fetch", fetcher);

    now += 29_999;
    const current = await auth.loadSession();
    expect(current).toMatchObject({
      username: "Customer Name", firstName: "Customer", lastName: "Name", profileComplete: true,
      createdAt: originalCreatedAt, roles: ["CUSTOMER", "CHEF"],
      email: "verified@example.invalid", emailVerified: true,
    });
    await auth.loadSession();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me", "/api/auth/me"]);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ cache: "no-store" }));
  });

  it("expires profile freshness after thirty seconds and retains names while refreshing", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    auth.setSessionProfile(profile);
    const hydration = deferred<Response>();
    const started = deferred<void>();
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(Response.json(identity));
      started.resolve();
      return hydration.promise;
    }));
    now += 30_000;
    const loading = auth.loadSession();
    await started.promise;
    expect(auth.getSession()?.username).toBe("Customer Name");
    hydration.resolve(Response.json({ ...profile, firstName: "Updated" }));
    expect((await loading)?.username).toBe("Updated Name");
  });

  it("lets screens with their own profile request skip automatic hydration after a fresh Auth check", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url !== "/api/auth/me") throw new Error("Unexpected hydration");
      return Response.json(identity);
    });
    vi.stubGlobal("fetch", fetcher);
    expect((await auth.loadSession({ hydrateCustomerProfile: "skip" }))?.id).toBe(identity.id);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me"]);
  });

  it("releases failed shared identity requests so the next attempt makes a fresh request", async () => {
    const lookup = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(lookup.promise).mockResolvedValueOnce(Response.json({ ...identity, roles: ["CHEF"] }));
    vi.stubGlobal("fetch", fetcher);
    const first = auth.loadSession();
    const second = auth.loadSession();
    const failures = Promise.allSettled([first, second]);
    lookup.reject(new Error("Offline fixture"));
    expect((await failures).map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect((await auth.loadSession())?.roles).toEqual(["CHEF"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  for (const failure of ["unavailable", "network", "invalid"] as const) {
    it(`does not cache ${failure} profile hydration failures`, async () => {
      let profileCalls = 0;
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url === "/api/auth/me") return Response.json(identity);
        profileCalls += 1;
        if (profileCalls === 1) {
          if (failure === "network") throw new Error("Offline profile fixture");
          return failure === "invalid" ? Response.json({ firstName: "Incomplete" }) : Response.json({}, { status: 503 });
        }
        return Response.json(profile);
      }));
      expect((await auth.loadSession())?.profileComplete).toBe(false);
      expect((await auth.loadSession())?.username).toBe("Customer Name");
      expect(profileCalls).toBe(2);
    });
  }

  it("shares the expired-token refresh flow without caching the identity afterwards", async () => {
    let lookups = 0;
    const lookup = deferred<Response>();
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/auth/refresh") return Response.json({ refreshed: true });
      if (url === "/api/customer/profile") return Response.json(profile);
      lookups += 1;
      return lookups === 1 ? lookup.promise : Response.json(identity);
    });
    vi.stubGlobal("fetch", fetcher);
    const first = auth.loadSession();
    const second = auth.loadSession();
    lookup.resolve(Response.json({ code: "SESSION_EXPIRED" }, { status: 401 }));
    await Promise.all([first, second]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/me", "/api/auth/refresh", "/api/auth/me", "/api/customer/profile",
    ]);
    await auth.loadSession();
    expect(lookups).toBe(3);
  });

  it("does not share fail-fast rejection with a caller that must attempt refresh", async () => {
    auth.invalidateSession(auth.captureSessionContext());
    const denied = deferred<Response>();
    let lookups = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/auth/refresh") return Response.json({ refreshed: true });
      lookups += 1;
      return lookups <= 2 ? denied.promise.then(response => response.clone()) : Response.json({ ...identity, roles: ["CHEF"] });
    });
    vi.stubGlobal("fetch", fetcher);
    const fast = auth.loadSession({ failFastUnauthenticated: true });
    const rejection = expect(fast).rejects.toBeInstanceOf(auth.AuthenticationRequiredError);
    const normal = auth.loadSession();
    denied.resolve(Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }));
    await rejection;
    expect((await normal)?.id).toBe(identity.id);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
  });

  it("honors fresh authorization rejection even when profile display data is fresh", async () => {
    auth.setSessionProfile(profile);
    vi.stubGlobal("fetch", async () => Response.json({}, { status: 403 }));
    expect(await auth.loadSession()).toBeNull();
    expect(auth.getSession()).toBeNull();
  });
});

describe("shared request session boundaries", () => {
  it("does not refresh an earlier session after its delayed unauthorized body crosses a login", async () => {
    const failureBody = deferred<unknown>();
    const parsing = deferred<void>();
    const copied = new Response();
    vi.spyOn(copied, "json").mockImplementation(() => { parsing.resolve(); return failureBody.promise; });
    const denied = new Response(null, { status: 401 });
    vi.spyOn(denied, "clone").mockReturnValue(copied);
    const fetcher = vi.fn(async () => denied);
    vi.stubGlobal("fetch", fetcher);
    const loading = auth.loadSession();
    await parsing.promise;
    const next = { ...identity, id: "22222222-2222-4222-8222-222222222222", roles: ["CHEF"] };
    auth.setSessionIdentity(next);
    failureBody.resolve({ code: "SESSION_EXPIRED" });
    expect((await loading)?.id).toBe(next.id);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("old identity completion cannot erase the next generation's shared lookup", async () => {
    const oldLookup = deferred<Response>();
    const newLookup = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(oldLookup.promise).mockReturnValueOnce(newLookup.promise);
    vi.stubGlobal("fetch", fetcher);
    const oldLoading = auth.loadSession();
    const next = { ...identity, id: "22222222-2222-4222-8222-222222222222", roles: ["CHEF"] };
    auth.setSessionIdentity(next);
    const first = auth.loadSession();
    const second = auth.loadSession();
    oldLookup.resolve(Response.json(identity));
    expect((await oldLoading)?.id).toBe(next.id);
    const third = auth.loadSession();
    expect(fetcher).toHaveBeenCalledTimes(2);
    newLookup.resolve(Response.json(next));
    expect((await Promise.all([first, second, third])).every(user => user?.id === next.id)).toBe(true);
    expect(auth.getSession()?.firstName).toBeNull();
  });

  it("does not overwrite a saved profile with an older in-flight profile response", async () => {
    const hydration = deferred<Response>();
    const started = deferred<void>();
    const fetcher = vi.fn((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(Response.json(identity));
      started.resolve();
      return hydration.promise;
    });
    vi.stubGlobal("fetch", fetcher);
    const loading = auth.loadSession();
    await started.promise;
    auth.setSessionProfile({ ...profile, firstName: "Saved" });
    hydration.resolve(Response.json(profile));
    expect((await loading)?.username).toBe("Saved Name");
    expect((await auth.loadSession())?.username).toBe("Saved Name");
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/customer/profile")).toHaveLength(1);
  });

  it("does not retain profile freshness across same-owner sign-in or confirmed logout", async () => {
    auth.setSessionProfile(profile);
    auth.setSessionIdentity(identity);
    let profileCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/auth/logout") return Response.json({ signedOut: true });
      if (url === "/api/auth/me") return Response.json(identity);
      profileCalls += 1;
      return Response.json(profile);
    }));
    expect((await auth.loadSession())?.username).toBe("Customer Name");
    await auth.clearSession();
    auth.setSessionIdentity(identity);
    expect((await auth.loadSession())?.username).toBe("Customer Name");
    expect(profileCalls).toBe(2);
  });
});
