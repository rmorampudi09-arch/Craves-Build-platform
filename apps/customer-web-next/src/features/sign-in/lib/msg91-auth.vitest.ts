import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Request as RuntimeRequest } from "next/dist/compiled/@edge-runtime/primitives";
import { POST } from "../../../app/api/auth/msg91/verify/route";
import { GET } from "../../../app/api/auth/otp-config/route";

const token = "synthetic-access-token-not-valid-in-production".repeat(3);
function request(body: unknown, origin = "https://craves.example.test") {
  return new RuntimeRequest("https://craves.example.test/api/auth/msg91/verify", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }) as unknown as NextRequest;
}
beforeEach(() => { vi.stubEnv("CRAVES_OTP_PROVIDER", "msg91"); vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.test/api/v1"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("keeps Firebase as the default and never publishes an account authkey", async () => {
  vi.stubEnv("CRAVES_OTP_PROVIDER", "firebase");
  expect(await GET().json()).toEqual({ provider: "firebase" });
  vi.stubEnv("CRAVES_OTP_PROVIDER", "msg91");
  vi.stubEnv("MSG91_WIDGET_ID", "widget-id"); vi.stubEnv("MSG91_WIDGET_TOKEN", "scoped-public-token");
  vi.stubEnv("MSG91_AUTHKEY", "server-secret");
  const response = GET();
  expect(await response.json()).toEqual({ provider: "msg91", widgetId: "widget-id", tokenAuth: "scoped-public-token" });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("rejects foreign origins and malformed tokens before upstream access", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await POST(request({ accessToken: token }, "https://attacker.invalid"))).status).toBe(403);
  expect((await POST(request({ accessToken: "bad" }))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it("passes only the provider token, never a client-selected identity, to the bridge", async () => {
  const customToken = "synthetic-custom-token".repeat(10);
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body))).toEqual({ accessToken: token });
    return Response.json({ firebaseCustomToken: customToken });
  });
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request({ accessToken: token, phone: "+919999999999", uid: "attacker-choice" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ firebaseCustomToken: customToken });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(fetcher.mock.calls[0][0]).toBe("https://api.example.test/api/v1/auth/msg91/verify");
});
it("does not turn provider rejection into a custom token or leak upstream details", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ authkey: "private-detail" }, { status: 401 })));
  const response = await POST(request({ accessToken: token }));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: "OTP_VERIFICATION_FAILED" });
});
