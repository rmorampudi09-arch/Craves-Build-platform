import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/lib/server-api", () => ({
  authenticatedApiFetch: upstream,
  SessionRequiredError: class extends Error {},
}));
import { onboardingBff } from "./chef-onboarding-bff";
function request(method = "PUT", origin = "https://craves.in", contentType = "application/json") {
  return new NextRequest("https://craves.in/api/chef/onboarding", {
    method,
    headers: { origin, "Content-Type": contentType },
    ...(method === "GET" ? {} : { body: JSON.stringify({ expectedVersion: 1, details: {} }) }),
  });
}
beforeEach(() => upstream.mockReset());
it("rejects cross-origin mutations before forwarding a private draft", async () => {
  expect((await onboardingBff(request("PUT", "https://attacker.invalid"), [], false)).status).toBe(
    403,
  );
  expect(upstream).not.toHaveBeenCalled();
});
it("requires JSON mutations and rejects unknown operations", async () => {
  expect(
    (await onboardingBff(request("PUT", "https://craves.in", "text/plain"), [], false)).status,
  ).toBe(415);
  expect(
    (await onboardingBff(request(), ["content", "invalid", "publication"], false)).status,
  ).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});
it("preserves conflicts and suppresses upstream service diagnostics", async () => {
  upstream.mockResolvedValue(
    Response.json({ code: "DRAFT_VERSION_CHANGED", message: "Reload this draft" }, { status: 409 }),
  );
  const conflict = await onboardingBff(request(), [], false);
  expect(conflict.status).toBe(409);
  expect((await conflict.json()).message).toBe("Reload this draft");
  upstream.mockResolvedValue(
    Response.json({ code: "ONBOARDING_ERROR", message: "private storage detail" }, { status: 500 }),
  );
  const unavailable = await onboardingBff(request(), [], false);
  expect(unavailable.status).toBe(503);
  expect(JSON.stringify(await unavailable.json())).not.toContain("private storage");
});
it("never caches private state and refuses malformed upstream success", async () => {
  upstream.mockResolvedValue(Response.json(null));
  expect((await onboardingBff(request("GET"), [], false)).status).toBe(502);
  upstream.mockResolvedValue(Response.json({ version: 1 }));
  const response = await onboardingBff(request("GET"), [], false);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
});
