// @vitest-environment jsdom
// With keepOnOutage, a sign-in check that can't answer is not a sign-out. Synthetic identity; fetch is stubbed.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CravesIdentity } from "./auth-contract";

const identity: CravesIdentity = {
  id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+910000000000", displayName: "Fixture customer",
  email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER"],
};
type Answer = Response | "offline";
const KEEP = { keepOnOutage: true };
const answer = (value: Answer) => (value === "offline" ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(value));

/** A fresh copy of the session store (a page load); sessionStorage, and so the tab's snapshot, carries over. */
async function freshAuth() {
  vi.resetModules();
  return import("../api/cravesAuth");
}

function serve({ me, refresh }: { me: Answer[]; refresh?: Answer }) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    if (url === "/api/auth/refresh") return answer(refresh ?? Response.json({ code: "SESSION_EXPIRED" }, { status: 401 }));
    if (url === "/api/auth/me") return answer(me.shift() ?? Response.json(identity));
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }));
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("a sign-in check that can't answer", () => {
  it("changes nothing for pages that don't ask to keep the sign-in", async () => {
    const auth = await freshAuth();
    auth.setSessionIdentity(identity);
    serve({ me: [Response.json({ code: "IDENTITY_UNAVAILABLE" }, { status: 503 })] });
    expect(await auth.loadSession()).toBeNull();
    serve({ me: ["offline"] });
    await expect(auth.loadSession()).rejects.toThrow("Failed to fetch");
    expect(auth.getSession()?.id).toBe(identity.id);
  });

  it("keeps a signed-in customer signed in when Craves is down or the network drops", async () => {
    const auth = await freshAuth();
    auth.setSessionIdentity(identity);
    for (const failure of [Response.json({ code: "IDENTITY_UNAVAILABLE" }, { status: 503 }), "offline" as const, new Response(null, { status: 429 })]) {
      serve({ me: [failure] });
      expect((await auth.loadSession(KEEP))?.id).toBe(identity.id);
      expect(auth.getSession()?.id).toBe(identity.id);
    }
  });

  it("keeps them signed in when the access cookie expired and the refresh couldn't answer", async () => {
    const auth = await freshAuth();
    auth.setSessionIdentity(identity);
    const calls = serve({ me: [Response.json({ code: "SESSION_EXPIRED" }, { status: 401 })], refresh: Response.json({ code: "REFRESH_UNAVAILABLE" }, { status: 503 }) });
    expect((await auth.loadSession(KEEP))?.id).toBe(identity.id);
    expect(calls).toEqual(["/api/auth/me", "/api/auth/refresh"]);
    expect(auth.getSession()?.id).toBe(identity.id);
  });

  it("restores this tab's sign-in after a reload while offline", async () => {
    (await freshAuth()).setSessionIdentity(identity);
    const reloaded = await freshAuth();
    expect(reloaded.getSession()).toBeNull();
    serve({ me: ["offline"] });
    expect((await reloaded.loadSession(KEEP))?.id).toBe(identity.id);
  });

  it("still signs out a refused sign-in, and never signs a guest in", async () => {
    const auth = await freshAuth();
    auth.setSessionIdentity(identity);
    serve({ me: [Response.json({ code: "SESSION_EXPIRED" }, { status: 401 })] });
    expect(await auth.loadSession(KEEP)).toBeNull();
    expect(auth.getSession()).toBeNull();

    const guest = await freshAuth();
    serve({ me: [Response.json({ code: "IDENTITY_UNAVAILABLE" }, { status: 503 })] });
    expect(await guest.loadSession(KEEP)).toBeNull();
    serve({ me: ["offline"] });
    await expect(guest.loadSession(KEEP)).rejects.toThrow();
    expect(guest.getSession()).toBeNull();
  });
});
