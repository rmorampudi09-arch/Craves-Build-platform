import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

beforeEach(() => { vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CRAVES_ADMIN_PORTAL", "false"); });
afterEach(() => vi.unstubAllEnvs());

// /rider is printed as a QR on the rider flyers: renaming or removing the path breaks every printed copy. /rider/version
// is what installed apps read to ask for an update; a cached answer would hold riders on an old build.
it.each([
  ["/rider", /^https:\/\/.+\.apk$/],
  ["/rider/version", /^https:\/\/.+\.json$/],
])("craves.in%s redirects to the newest release, never edge-cached", async (path, location) => {
  const response = await proxy(new NextRequest(`https://craves.in${path}`));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toMatch(location);
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("does not redirect a POST to /rider", async () => {
  expect((await proxy(new NextRequest("https://craves.in/rider", { method: "POST" }))).headers.has("location")).toBe(false);
});
