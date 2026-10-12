import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../../../app/api/admin/accounts/[identityId]/route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const id = "00000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ identityId: id }) };
const request = (reason?: string) => new NextRequest(`https://admin.example.test/api/admin/accounts/${id}`, {
  headers: { Cookie: "craves_access_token=synthetic-not-valid-in-production", ...(reason === undefined ? {} : { "X-Admin-Reason": reason }) },
});

describe("Account status lookup BFF", () => {
  it.each([[undefined], ["too short"], ["x".repeat(501)]])("requires a 10-500 character reason before contacting Auth (%s)", async reason => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await GET(request(reason), params);
    expect(r.status).toBe(400); expect(await r.json()).toEqual({ code: "ADMIN_REASON_REQUIRED" }); expect(f).not.toHaveBeenCalled();
  });

  it("forwards the operator reason to Auth's audited status read", async () => {
    vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.test/api/v1");
    const sent: Record<string, string | null> = {};
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) return Response.json({ identity: { status: "ACTIVE", roles: ["PLATFORM_ADMIN"] } });
      sent[url] = new Headers(init?.headers).get("X-Admin-Reason");
      return Response.json({ identityId: id, status: "ACTIVE", tokenVersion: 0, providerAttemptCount: 0, changed: false });
    }));
    const r = await GET(request("  Chef reported they cannot sign in  "), params);
    expect(r.status).toBe(200);
    expect(sent).toEqual({ [`https://api.example.test/api/v1/admin/accounts/${id}/intervention-status`]: "Chef reported they cannot sign in" });
  });
});
