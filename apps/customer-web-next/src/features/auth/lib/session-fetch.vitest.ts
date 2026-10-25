import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionFetch } from "../api/sessionFetch";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sessionFetch", () => {
  it("refreshes an expired access session once and replays the protected request", async () => {
    const calls: string[] = [];
    let protectedCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        calls.push(path);
        if (path === "/api/protected") {
          protectedCalls += 1;
          return protectedCalls === 1
            ? Response.json({ code: "SESSION_EXPIRED" }, { status: 401 })
            : Response.json({ ok: true });
        }
        if (path === "/api/auth/refresh") {
          return Response.json({ ok: true });
        }
        return Response.json({}, { status: 404 });
      }),
    );

    const response = await sessionFetch("/api/protected", {
      method: "POST",
      body: JSON.stringify({ checkoutId: "test" }),
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      "/api/protected",
      "/api/auth/refresh",
      "/api/protected",
    ]);
  });

  it("does not replay when refresh is no longer valid", async () => {
    const calls: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        calls.push(path);
        return path === "/api/auth/refresh"
          ? Response.json({}, { status: 401 })
          : Response.json({}, { status: 401 });
      }),
    );

    const response = await sessionFetch("/api/protected");

    expect(response.status).toBe(401);
    expect(calls).toEqual(["/api/protected", "/api/auth/refresh"]);
  });

  it("retries with the cookies another tab just renewed when its own refresh is superseded", async () => {
    const calls: string[] = [];
    let renewedByOtherTab = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      if (path === "/api/auth/refresh") {
        renewedByOtherTab = true; // the other tab's response set the new cookies meanwhile
        return Response.json({ code: "REFRESH_SUPERSEDED" }, { status: 409 });
      }
      return renewedByOtherTab ? Response.json({ ok: true }) : Response.json({}, { status: 401 });
    }));

    expect((await sessionFetch("/api/protected")).status).toBe(200);
    expect(calls).toEqual(["/api/protected", "/api/auth/refresh", "/api/protected"]);
  });

  it("refreshes once more with the newer cookie when the superseded retry still lacks access", async () => {
    const calls: string[] = [];
    let refreshes = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      if (path === "/api/auth/refresh") {
        refreshes += 1;
        return refreshes === 1 ? Response.json({ code: "REFRESH_SUPERSEDED" }, { status: 409 }) : Response.json({ identity: null });
      }
      return refreshes === 2 ? Response.json({ ok: true }) : Response.json({}, { status: 401 });
    }));

    expect((await sessionFetch("/api/protected")).status).toBe(200);
    expect(calls).toEqual(["/api/protected", "/api/auth/refresh", "/api/protected", "/api/auth/refresh", "/api/protected"]);
  });

  it("gives concurrent chef requests refused for a missing role one refresh, then retries each once", async () => {
    vi.resetModules(); // a fresh minute for the shared role refresh
    const { sessionFetch: freshSessionFetch } = await import("../api/sessionFetch");
    let refreshes = 0;
    let finish!: (response: Response) => void;
    const reads = new Map<string, number>();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/refresh") {
        refreshes += 1;
        return new Promise<Response>((resolve) => { finish = resolve; });
      }
      reads.set(path, (reads.get(path) ?? 0) + 1);
      // The access token predates the approval until the refresh lands.
      return refreshes > 0 && reads.get(path)! > 1 ? Response.json([]) : Response.json({ code: "CHEF_ACCESS_REQUIRED" }, { status: 403 });
    }));

    const paths = ["/api/chef/orders", "/api/chef/menu", "/api/chef/earnings", "/api/chef/kitchen"];
    const pending = Promise.all(paths.map((path) => freshSessionFetch(path)));
    await vi.waitFor(() => expect(refreshes).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    finish(Response.json({ identity: null }));
    expect((await pending).map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(refreshes).toBe(1);
    expect([...reads.values()]).toEqual([2, 2, 2, 2]);
  });
});
