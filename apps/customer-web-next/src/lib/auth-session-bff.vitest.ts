import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Request as RuntimeRequest } from "next/dist/compiled/@edge-runtime/primitives";
import { POST } from "../app/api/auth/session/route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const origin = "https://admin.example.test";
const firebaseIdToken = "synthetic-fixture-not-valid-in-production".repeat(4);
function request(body: unknown, suppliedOrigin = origin) {
  return new RuntimeRequest(`${origin}/api/auth/session`, {
    method: "POST", headers: { Origin: suppliedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("Admin sign-in through the actual bounded request reader", () => {
  it("creates private session cookies only after a successful upstream exchange", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRAVES_ADMIN_PORTAL", "true");
    vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.test/api/v1");
    const identity = { id: "00000000-0000-4000-8000-000000000001", phoneNumber: "+910000000000", status: "ACTIVE", roles: ["PLATFORM_ADMIN"] };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ firebaseIdToken, adminSession: true });
      return Response.json({ identity, accessToken: "fixture-access", refreshToken: "fixture-refresh", expiresIn: 900,
        refreshTokenExpiresAt: new Date(Date.now() + 28_800_000).toISOString() });
    });
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request({ firebaseIdToken }));
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.example.test/api/v1/auth/firebase/exchange");
    expect(response.headers.get("cache-control")).toContain("no-store");
    for (const cookie of response.headers.getSetCookie()) {
      expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=lax");
      expect(cookie).not.toContain("Domain=");
    }
    expect(response.cookies.get("craves_access_token")?.value).toBe("fixture-access");
    expect(response.cookies.get("craves_refresh_token")?.path).toBe("/api/auth");
    const body = await response.json();
    expect(body.identity.id).toBe(identity.id);
    expect(JSON.stringify(body)).not.toContain("fixture-access");
    expect(JSON.stringify(body)).not.toContain("fixture-refresh");
  });
  it("validates missing Firebase input after accepting the request body", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await POST(request({}));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_FIREBASE_TOKEN");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("denies an untrusted origin before exchanging or setting cookies", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await POST(request({ firebaseIdToken }, "https://attacker.invalid"));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("ORIGIN_REJECTED");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves upstream rejection without exposing its details or issuing cookies", async () => {
    vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.test/api/v1");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ secret: "private-provider-detail" }, { status: 401 })));
    const response = await POST(request({ firebaseIdToken }));
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("SIGN_IN_FAILED");
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});
