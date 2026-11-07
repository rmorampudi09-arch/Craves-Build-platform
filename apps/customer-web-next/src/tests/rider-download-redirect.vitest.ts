import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

beforeEach(() => { vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CRAVES_ADMIN_PORTAL", "false"); });
afterEach(() => vi.unstubAllEnvs());

// Printed as a QR on the rider flyers: renaming or removing the path breaks every printed copy.
it("craves.in/rider sends the phone straight to the rider app download, never edge-cached", async () => {
  const response = await proxy(new NextRequest("https://craves.in/rider"));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toMatch(/^https:\/\//);
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("does not redirect a POST to /rider", async () => {
  expect((await proxy(new NextRequest("https://craves.in/rider", { method: "POST" }))).headers.has("location")).toBe(false);
});
