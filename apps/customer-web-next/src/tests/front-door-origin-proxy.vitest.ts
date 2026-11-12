import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const OURS = "59117d14-1c4f-402e-a98b-0fa1009de276";
const THEIRS = "0c0ffee0-0000-4000-8000-000000000000";

// Sent as Front Door sends it; Next reads it as x-azure-fdid.
const get = (url: string, fdid?: string) =>
  new NextRequest(url, { headers: { "X-Azure-SocketIP": "203.0.113.9", ...(fdid === undefined ? {} : { "X-Azure-FDID": fdid }) } });
const passedOn = (response: Response) => response.headers.get("x-middleware-next") === "1";
const logs = () => ({
  warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
  error: vi.spyOn(console, "error").mockImplementation(() => undefined),
});

describe("proxy answers only our Front Door", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRAVES_ADMIN_PORTAL", "false");
    vi.stubEnv("CRAVES_WEB_LAUNCH_BLOB_URL", "");
    vi.stubEnv("CRAVES_FRONT_DOOR_ID", OURS);
    vi.stubEnv("CRAVES_FRONT_DOOR_CHECK", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is off by default: requests without the header behave as before", async () => {
    const { warn, error } = logs();
    expect(passedOn(await proxy(get("https://craves.in/home")))).toBe(true);
    expect((await proxy(get("https://craves.in/admin/analytics"))).headers.get("location")).toBe("https://admin.craves.in/admin/analytics");
    vi.stubEnv("CRAVES_ADMIN_PORTAL", "true");
    expect(passedOn(await proxy(get("https://admin.craves.in/admin")))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("enforce: answers 403 before every other branch of the customer site", async () => {
    vi.stubEnv("CRAVES_FRONT_DOOR_CHECK", "enforce");
    const { warn } = logs();
    // A static file, an old admin bookmark (otherwise a redirect), the landing page and the API.
    for (const path of ["/home", "/", "/robots.txt", "/admin/analytics", "/sign-in?returnTo=%2Fadmin", "/api/auth/session"]) {
      for (const fdid of [undefined, "", THEIRS, OURS.toUpperCase()]) {
        const response = await proxy(get(`https://craves.in${path}`, fdid));
        expect(response.status, `${path} ${fdid}`).toBe(403);
        expect(await response.text()).toBe("Forbidden");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.has("location")).toBe(false);
      }
    }
    expect(passedOn(await proxy(get("https://craves.in/home", OURS)))).toBe(true);
    expect((await proxy(get("https://craves.in/admin/analytics", OURS))).headers.get("location")).toBe("https://admin.craves.in/admin/analytics");
    expect(warn).not.toHaveBeenCalled();
  });

  it("enforce covers the admin portal too", async () => {
    vi.stubEnv("CRAVES_ADMIN_PORTAL", "true");
    vi.stubEnv("CRAVES_FRONT_DOOR_CHECK", "enforce");
    for (const path of ["/admin", "/sign-in", "/api/admin/orders", "/api/auth/session", "/home", "/brand/logo.svg"]) {
      const response = await proxy(get(`https://admin.craves.in${path}`));
      expect(response.status, path).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(passedOn(await proxy(get("https://admin.craves.in/admin", OURS)))).toBe(true);
    expect((await proxy(get("https://admin.craves.in/api/orders", OURS))).status).toBe(404);
  });

  it("report: lets the request through and logs one line with the path only", async () => {
    vi.stubEnv("CRAVES_FRONT_DOOR_CHECK", "report");
    const { warn } = logs();
    expect(passedOn(await proxy(get("https://craves.in/home?token=query-secret")))).toBe(true);
    expect(passedOn(await proxy(get("https://craves.in/home", THEIRS)))).toBe(true);
    expect(passedOn(await proxy(get("https://craves.in/home", OURS)))).toBe(true);
    // The rest of the proxy still runs after the report line.
    expect((await proxy(get("https://craves.in/admin/analytics"))).headers.get("location")).toBe("https://admin.craves.in/admin/analytics");
    vi.stubEnv("CRAVES_ADMIN_PORTAL", "true");
    expect(passedOn(await proxy(get("https://admin.craves.in/admin")))).toBe(true);
    expect(warn.mock.calls).toEqual([
      ["ORIGIN_CHECK_MISMATCH mode=report path=/home hasFdid=false"],
      ["ORIGIN_CHECK_MISMATCH mode=report path=/home hasFdid=true"],
      ["ORIGIN_CHECK_MISMATCH mode=report path=/admin/analytics hasFdid=false"],
      ["ORIGIN_CHECK_MISMATCH mode=report path=/admin hasFdid=false"],
    ]);
  });

  it("a mode without an id lets every request through and says so once per process", async () => {
    for (const mode of ["report", "enforce"]) {
      vi.stubEnv("CRAVES_FRONT_DOOR_CHECK", mode);
      vi.stubEnv("CRAVES_FRONT_DOOR_ID", "");
      vi.resetModules();
      const fresh = (await import("../proxy")).proxy;
      const { warn, error } = logs();
      for (const fdid of [undefined, THEIRS, OURS, undefined]) expect(passedOn(await fresh(get("https://craves.in/home", fdid)))).toBe(true);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0]?.[0]).toMatch(/^ORIGIN_CHECK_MISCONFIGURED /);
      expect(warn).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });
});
