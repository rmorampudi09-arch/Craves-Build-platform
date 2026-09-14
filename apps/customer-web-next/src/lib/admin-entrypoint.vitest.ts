import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

beforeEach(() => { vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CRAVES_ADMIN_PORTAL", "false"); });
afterEach(() => vi.unstubAllEnvs());

describe("Legacy administrator entry points on the customer site", () => {
  it.each(["craves.in", "www.craves.in"])("moves %s admin bookmarks to the owning portal", host => {
    const response = proxy(new NextRequest(`https://${host}/admin/analytics?period=30d`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://admin.craves.in/admin/analytics?period=30d");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("moves the reported sign-in URL before an OTP is requested", () => {
    const response = proxy(new NextRequest("https://craves.in/sign-in?returnTo=%2Fadmin"));
    expect(response.headers.get("location")).toBe("https://admin.craves.in/sign-in?returnTo=%2Fadmin");
  });

  it("preserves a safe deep link and does not forward unrelated sign-in parameters", () => {
    const request = new NextRequest("https://craves.in/sign-in?returnTo=%2Fadmin%2Forders%3Fpage%3D2&phone=discard");
    const target = new URL(proxy(request).headers.get("location")!);
    expect(target.origin).toBe("https://admin.craves.in");
    expect(target.searchParams.get("returnTo")).toBe("/admin/orders?page=2");
    expect(target.searchParams.has("phone")).toBe(false);
  });

  it.each(["/", "/chef", "/sign-in", "/sign-in?returnTo=%2Fchef", "/api/auth/session", "/api/admin/me",
    "/administrator", "/sign-in?returnTo=https%3A%2F%2Fattacker.invalid%2Fadmin", "/sign-in?returnTo=%2F%2Fattacker.invalid%2Fadmin"])("keeps %s on its existing handler", path => {
    expect(proxy(new NextRequest(`https://craves.in${path}`)).headers.get("x-middleware-next")).toBe("1");
  });

  it("does not redirect a credential-bearing POST across hosts", () => {
    expect(proxy(new NextRequest("https://craves.in/sign-in?returnTo=%2Fadmin", {
      method: "POST", body: "synthetic-fixture",
    })).headers.has("location")).toBe(false);
  });

  it("does not loop the dedicated portal back to itself", () => {
    vi.stubEnv("CRAVES_ADMIN_PORTAL", "true");
    expect(proxy(new NextRequest("https://admin.craves.in/admin")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(new NextRequest("https://admin.craves.in/sign-in?returnTo=%2Fadmin")).headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps local development on the local app", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(proxy(new NextRequest("http://localhost:3000/admin")).headers.has("location")).toBe(false);
  });
});
