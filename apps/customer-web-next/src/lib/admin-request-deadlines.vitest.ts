import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { authenticatedApiFetch } from "./server-api";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function request() {
  vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.com/api/v1");
  return new NextRequest("https://admin.example.com/api/admin/finance", {
    headers: { Cookie: "craves_access_token=synthetic-test-only" },
  });
}

describe("admin authorization and service deadlines", () => {
  it("gives the operation its full deadline after a slow successful authorization", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Deadline", "AbortError")), { once: true });
      setTimeout(() => resolve(String(input).endsWith("/auth/me")
        ? Response.json({ identity: { status: "ACTIVE", roles: ["PLATFORM_ADMIN"] } })
        : Response.json({ saved: true })), 9_000);
    }));
    vi.stubGlobal("fetch", fetcher);
    const outcome = authenticatedApiFetch(request(), "/integration/admin/finance", { method: "GET" });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(9_000);
    const response = await outcome;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true });
  });

  it("still stops before the operation on a live authorization denial", async () => {
    const fetcher = vi.fn(async () => Response.json({ code: "ADMIN_ACCESS_REQUIRED" }, { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    expect((await authenticatedApiFetch(request(), "/integration/admin/finance")).status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cancellation during authorization cannot dispatch the operation", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const outcome = authenticatedApiFetch(request(), "/integration/admin/finance", { signal: controller.signal });
    controller.abort();
    await expect(outcome).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
