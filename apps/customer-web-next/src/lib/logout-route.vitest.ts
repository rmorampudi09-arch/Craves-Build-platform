import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/auth/logout/route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function request(cookie = "craves_refresh_token=fixture-refresh", origin = "https://craves.in") {
  vi.stubEnv("CRAVES_API_BASE_URL", "https://api.craves.invalid/api/v1");
  return new NextRequest("https://craves.in/api/auth/logout", { method: "POST", headers: { Cookie: cookie, Origin: origin } });
}
describe("logout revocation confirmation", () => {
  it("clears both cookies only after a successful backend receipt", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ success: true }));
    const response = await POST(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ signedOut: true });
    expect(response.cookies.get("craves_access_token")?.value).toBe("");
    expect(response.cookies.get("craves_refresh_token")?.value).toBe("");
  });
  for (const failure of ["network", "rejected", "malformed", "false"]) it(`retains the retry receipt for ${failure}`, async () => {
    vi.stubGlobal("fetch", async () => {
      if (failure === "network") throw new Error("fixture error, no private data");
      if (failure === "rejected") return Response.json({ private: "not forwarded" }, { status: 500 });
      if (failure === "malformed") return new Response("not JSON");
      return Response.json({ success: false });
    });
    const response = await POST(request());
    expect(response.status).toBe(503); expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ signedOut: false, code: "LOGOUT_UNCONFIRMED" });
  });
  it("supports idempotent local cleanup without a refresh receipt", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await POST(request(""))).status).toBe(200); expect(fetcher).not.toHaveBeenCalled();
  });
  it("denies cross-origin logout without changing cookies or contacting Auth", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await POST(request(undefined, "https://attacker.invalid"));
    expect(response.status).toBe(403); expect(response.headers.get("set-cookie")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
