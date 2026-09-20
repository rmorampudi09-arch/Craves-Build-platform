import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionFetch } from "../services/auth/sessionFetch";

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
});
