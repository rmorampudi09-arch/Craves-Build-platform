import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as sessionStatus } from "../app/api/auth/admin-session/route";
import { GET as adminIdentity } from "../app/api/admin/me/route";

// These are the documented Java InternalAdminRoles, not the legacy ADMIN alias.
const internalRoles = [
  "PLATFORM_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN",
  "CHEF_ADMIN", "COMPLIANCE_ADMIN", "SUBSCRIPTION_ADMIN", "NOTIFICATION_ADMIN", "AUDIT_ADMIN",
];

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function authResponse(roles: string[], status = "ACTIVE") {
  vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.com/api/v1");
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe("https://api.example.com/api/v1/auth/me");
    return Response.json({ identity: {
    id: "11111111-2222-4333-8444-555555555555", firebaseUid: "synthetic-fixture",
    phoneNumber: "+10000000000", status, roles, displayName: "Test administrator",
    } }, { headers: { "X-Craves-Admin-Session": "verified-v1" } });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function request(path: string) {
  const now = Math.floor(Date.now() / 1000);
  // Auth validation is the mocked upstream boundary; this fixture cannot authenticate in production.
  const token = `fixture.${Buffer.from(JSON.stringify({ exp: now + 900, admin_session_exp: now + 28800 })).toString("base64url")}.fixture`;
  return new NextRequest(`https://admin.example.com${path}`, { headers: { Cookie: `craves_access_token=${token}` } });
}

describe("Java identity contract at the shared administrator BFF", () => {
  for (const role of internalRoles) it(`keeps ${role} authorized for all portals' shared session check`, async () => {
    const fetcher = authResponse(["CUSTOMER", role]);
    const session = await sessionStatus(request("/api/auth/admin-session"));
    expect(session.status).toBe(200);
    expect(session.headers.get("cache-control")).toContain("no-store");
    const timing = (await session.json()).timing;
    expect(timing.sessionExpiresAt - timing.accessExpiresAt).toBe(27_900_000);
    const identity = await adminIdentity(request("/api/admin/me"));
    expect(identity.status).toBe(200);
    expect(identity.headers.get("cache-control")).toContain("no-store");
    expect(await identity.json()).toEqual({ displayName: "Test administrator", email: null, status: "ACTIVE", adminEnabled: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(call => call[0] === "https://api.example.com/api/v1/auth/me")).toBe(true);
  });

  for (const roles of [["ADMIN"], ["CUSTOMER"], ["CHEF"], ["CUSTOMER", "CHEF"], ["UNKNOWN_ADMIN"]]) {
    it(`denies unsupported identity roles ${roles.join(", ")} without caching the denial`, async () => {
      authResponse(roles);
      for (const [handler, path] of [[sessionStatus, "/api/auth/admin-session"], [adminIdentity, "/api/admin/me"]] as const) {
        const result = await handler(request(path));
        expect(result.status).toBe(403);
        expect(result.headers.get("cache-control")).toContain("no-store");
      }
    });
  }

  it("denies a disabled account even with a valid internal role", async () => {
    authResponse(["PLATFORM_ADMIN"], "DISABLED");
    expect((await sessionStatus(request("/api/auth/admin-session"))).status).toBe(403);
    expect((await adminIdentity(request("/api/admin/me"))).status).toBe(403);
  });
});
