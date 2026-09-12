import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/auth/refresh/route";

function request(origin = "https://admin.example.com") {
  return new NextRequest("https://admin.example.com/api/auth/refresh", { method: "POST", headers: {
    Origin: origin, Cookie: `craves_refresh_token=synthetic-${crypto.randomUUID()}`,
    "X-Refresh-Request-ID": crypto.randomUUID(),
  } });
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("real refresh BFF responses", () => {
  for (const status of [429, 500, 502, 503, 504]) it(`preserves cookies on upstream ${status}`, async () => {
    vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.com/api/v1");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status, headers: { "Retry-After": "11" } })));
    const result = await POST(request());
    expect(result.status).toBe(status === 429 ? 429 : 503);
    expect(result.headers.get("set-cookie")).toBeNull();
    expect(result.headers.get("cache-control")).toContain("no-store");
    if (status === 429) expect(result.headers.get("retry-after")).toBe("11");
  });
  for (const status of [401, 403]) it(`clears exact cookie paths on definitive ${status}`, async () => {
    vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.com/api/v1");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status })));
    const result = await POST(request());
    expect(result.status).toBe(status);
    const cookies = result.headers.get("set-cookie")!;
    expect(cookies).toContain("craves_access_token=;");
    expect(cookies).toContain("craves_refresh_token=;");
    expect(cookies).toContain("Path=/api/auth");
    expect(cookies).toContain("Max-Age=0");
    expect(cookies).not.toContain("Domain=");
  });
  it("rejects cross-origin renewal without contacting Auth", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await POST(request("https://untrusted.example"))).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  for (const mode of ["malformed", "offline", "timeout"]) it(`keeps cookies on ${mode}`, async () => {
    vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.com/api/v1");
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (mode === "offline") throw new TypeError("offline");
      if (mode === "timeout") throw new DOMException("timeout", "TimeoutError");
      return new Response("not JSON");
    }));
    const result = await POST(request());
    expect(result.status).toBe(503); expect(result.headers.get("set-cookie")).toBeNull();
  });
  it("coalesces same-cookie concurrency and returns only server-set secure cookies", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.com/api/v1");
    const accessToken = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900, admin_session_exp: Math.floor(Date.now() / 1000) + 28800 })).toString("base64url")}.synthetic`;
    const fetcher = vi.fn(async () => Response.json({ accessToken, refreshToken: "synthetic-replacement", expiresIn: 900,
      refreshTokenExpiresAt: new Date(Date.now() + 28800_000).toISOString(), identity: {
        id: "11111111-2222-4333-8444-555555555555", phoneNumber: "+10000000000", status: "ACTIVE", roles: ["PLATFORM_ADMIN"],
      } }));
    vi.stubGlobal("fetch", fetcher);
    const input = request();
    const results = await Promise.all(Array.from({ length: 12 }, () => POST(input)));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const result = results[0]; expect(result.status).toBe(200);
    const cookies = result.headers.get("set-cookie")!;
    expect(cookies).toContain("HttpOnly"); expect(cookies).toContain("Secure"); expect(cookies).toContain("SameSite=lax");
    expect(cookies).not.toContain("Domain=");
    const body = await result.text(); expect(body).not.toContain(accessToken); expect(body).not.toContain("synthetic-replacement");
  });
});
