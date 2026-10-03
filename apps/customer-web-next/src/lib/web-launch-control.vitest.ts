import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/web-launch/control/route";
import { GET as status } from "../app/api/web-launch/status/route";
import { GET as panel } from "../app/pilot-launch/route";
import { proxy } from "../proxy";
import { launchHtml } from "./web-launch-view";
import { hasLaunchKey } from "./web-launch-security";

const storage = vi.hoisted(() => ({ read: vi.fn(), launch: vi.fn(), lastKnown: vi.fn() }));
vi.mock("./web-launch-state", async importOriginal => ({ ...await importOriginal<typeof import("./web-launch-state")>(), webLaunchStore: storage }));
const key = "K".repeat(43);
const blob = "https://stcravesprodlowkmqgfy.blob.core.windows.net/web-pilot-launch/state.json";
const state = (phase: "open" | "waiting" | "launched") => ({ state: { schema: 1, phase, updatedAt: "2026-10-03T01:00:00.000Z" }, etag: '"fixture"' });
function request(path = "/api/web-launch/control", method = "GET", valid = true, origin = "https://craves.in", body = '{"action":"launch"}') {
  return new NextRequest(`https://craves.in${path}`, { method, headers: {
    ...(valid ? { Authorization: `Bearer ${key}` } : {}),
    ...(method === "POST" ? { Origin: origin, "Content-Type": "application/json" } : {}),
  }, ...(method === "POST" ? { body } : {}) });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CRAVES_ADMIN_PORTAL", "false");
  vi.stubEnv("CRAVES_WEB_LAUNCH_BLOB_URL", blob);
  vi.stubEnv("CRAVES_WEB_LAUNCH_KEY_SHA256", createHash("sha256").update(key).digest("hex"));
  vi.stubEnv("CRAVES_WEB_LAUNCH_KEY_EXPIRES_AT", "2099-01-01T00:00:00.000Z");
  vi.clearAllMocks(); storage.read.mockResolvedValue(state("waiting")); storage.launch.mockResolvedValue(state("launched")); storage.lastKnown.mockReturnValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("Private one-way launch control", () => {
  it("reveals no launch state and performs no storage access without the private key", async () => {
    expect((await GET(request(undefined, "GET", false))).status).toBe(404);
    expect((await POST(request(undefined, "POST", false))).status).toBe(404);
    expect(storage.read).not.toHaveBeenCalled(); expect(storage.launch).not.toHaveBeenCalled();
    expect(hasLaunchKey(request(), Date.parse("2100-01-01T00:00:00.000Z"))).toBe(false);
    expect(hasLaunchKey(new NextRequest("https://craves.in/api/web-launch/control", { headers: { Authorization: `Bearer ${"x".repeat(43)}` } }))).toBe(false);
  });
  it("accepts only an authenticated, same-origin, bounded launch action", async () => {
    expect((await POST(request(undefined, "POST", true, "https://attacker.invalid"))).status).toBe(403);
    expect((await POST(request(undefined, "POST", true, "https://craves.in", '{"action":"close"}'))).status).toBe(400);
    expect((await POST(request(undefined, "POST", true, "https://craves.in", "x".repeat(257)))).status).toBe(413);
    expect(storage.launch).not.toHaveBeenCalled();
    const response = await POST(request(undefined, "POST"));
    expect(response.status).toBe(200); expect((await response.json()).phase).toBe("launched");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(storage.launch).toHaveBeenCalledTimes(1);
  });
  it("never reports launch success when persistence or verification failed", async () => {
    storage.launch.mockRejectedValue(new Error("private failure"));
    expect((await POST(request(undefined, "POST"))).status).toBe(503);
    storage.read.mockRejectedValue(new Error("private failure"));
    expect((await status()).status).toBe(503);
  });
  it("keeps the separately deployed administration portal unchanged", async () => {
    vi.stubEnv("CRAVES_ADMIN_PORTAL", "true");
    expect((await GET(request())).status).toBe(404);
    expect((await proxy(new NextRequest("https://admin.craves.in/admin"))).headers.get("x-middleware-next")).toBe("1");
    expect(storage.read).not.toHaveBeenCalled();
  });
  it("has no public launch button, embeds no credential, and uses a restrictive CSP", async () => {
    const waiting = launchHtml(); const control = await panel();
    expect(waiting.html).not.toContain("<button"); expect(waiting.html).toContain("location.reload()");
    const html = await control.text(); expect(html).toContain('id="launch" type="button" hidden'); expect(html).not.toContain(key);
    expect(html).toContain("history.replaceState"); expect(html).not.toContain("localStorage");
    expect(control.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(control.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    for (const tag of ["style", "script"]) {
      const content = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(html)![1];
      expect(control.headers.get("content-security-policy")).toContain(createHash("sha256").update(content).digest("base64"));
    }
  });
});

describe("Customer web waiting gate", () => {
  it.each(["/", "/home", "/chef", "/sign-in", "/landing-v20/index.html", "/index.html", "/api/cart", "/api/cart.json"])("gates %s including dotted HTML and API aliases", async path => {
    const result = await proxy(request(path)); expect(result.status).toBe(503);
    expect(result.headers.get("cache-control")).toContain("no-store");
    if (path.startsWith("/api/")) expect((await result.json()).code).toBe("WEB_OPENING_SOON");
    else expect(await result.text()).not.toContain("<button");
  });
  it.each(["/pilot-launch", "/api/web-launch/status", "/api/web-launch/control", "/api/version", "/api/readiness/razorpay", "/landing-v20/images/craves-navbar-logo.png", "/robots.txt", "/privacy", "/terms"])("retains the exact control/health/asset path %s", async path => {
    expect((await proxy(request(path))).headers.get("x-middleware-next")).toBe("1");
    expect(storage.read).not.toHaveBeenCalled();
  });
  it("preserves existing admin redirects before gating and ignores forged bypass markers", async () => {
    expect((await proxy(request("/admin/web-launch"))).headers.get("location")).toBe("https://admin.craves.in/admin/web-launch");
    const forged = new NextRequest("https://craves.in/home?launch=true", { headers: { "x-web-launch": "open", "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy", Cookie: "launch=true" } });
    expect((await proxy(forged)).status).toBe(503);
  });
  it("passes through when open, launched or unconfigured, without changing application responses", async () => {
    for (const phase of ["open", "launched"] as const) { storage.read.mockResolvedValue(state(phase)); expect((await proxy(request("/home"))).headers.get("x-middleware-next")).toBe("1"); }
    vi.stubEnv("CRAVES_WEB_LAUNCH_BLOB_URL", ""); vi.clearAllMocks();
    expect((await proxy(request("/home"))).headers.get("x-middleware-next")).toBe("1"); expect(storage.read).not.toHaveBeenCalled();
  });
  it("uses JSON for mutations/RSC and returns no body for HEAD", async () => {
    expect((await (await proxy(request("/home", "POST"))).json()).code).toBe("WEB_OPENING_SOON");
    expect(await (await proxy(request("/home", "HEAD"))).text()).toBe("");
    const rsc = new NextRequest("https://craves.in/home", { headers: { RSC: "1" } });
    expect((await (await proxy(rsc)).json()).code).toBe("WEB_OPENING_SOON");
  });
  it("retains a known waiting state on transient failure and preserves uptime on a cold failure", async () => {
    storage.read.mockRejectedValue(new Error("private failure")); storage.lastKnown.mockReturnValue(state("waiting"));
    expect((await proxy(request("/home"))).status).toBe(503);
    storage.lastKnown.mockReturnValue(null); expect((await proxy(request("/home"))).headers.get("x-middleware-next")).toBe("1");
  });
});
