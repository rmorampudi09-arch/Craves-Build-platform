import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { Request as RuntimeRequest } from "next/dist/compiled/@edge-runtime/primitives";
import { boundBffRequest } from "./bff-request-limits";

afterEach(() => vi.useRealTimers());
function request(body: BodyInit | null, headers: Record<string, string> = {}, path = "/api/cart/items") {
  return new NextRequest(`https://craves.in${path}`, { method: "POST", body,
    headers: { Origin: "https://craves.in", "Content-Type": "application/json", Cookie: "craves_access_token=fixture-only", ...headers } });
}

describe("BFF actual-stream request limits", () => {
  it("preserves JSON, URL and server cookie through the bounded request", async () => {
    const output = await boundBffRequest(request('{"quantity":2}'));
    expect(output).toBeInstanceOf(NextRequest);
    const bounded = output as NextRequest;
    expect(bounded.cookies.get("craves_access_token")?.value).toBe("fixture-only");
    expect(bounded.nextUrl.pathname).toBe("/api/cart/items");
    expect(await bounded.json()).toEqual({ quantity: 2 });
  });
  it("accepts a request from the framework runtime without losing its method", async () => {
    const controller = new AbortController();
    const input = new RuntimeRequest("https://admin.craves.in/api/auth/session?returnTo=%2Fadmin", {
      method: "POST", body: JSON.stringify({ firebaseIdToken: "fixture-token" }), signal: controller.signal,
      headers: { Origin: "https://admin.craves.in", "Content-Type": "application/json", Cookie: "craves_refresh_token=fixture-only" },
    });
    expect(input).not.toBeInstanceOf(Request);
    const output = await boundBffRequest(input as unknown as NextRequest);
    expect(output).toBeInstanceOf(NextRequest);
    const bounded = output as NextRequest;
    expect(bounded.method).toBe("POST");
    expect(bounded.nextUrl.pathname).toBe("/api/auth/session");
    expect(bounded.nextUrl.searchParams.get("returnTo")).toBe("/admin");
    expect(bounded.cookies.get("craves_refresh_token")?.value).toBe("fixture-only");
    expect(await bounded.json()).toEqual({ firebaseIdToken: "fixture-token" });
    controller.abort();
    expect(bounded.signal.aborted).toBe(true);
  });
  it("does not reopen a consumed empty request", async () => {
    const output = await boundBffRequest(request(""));
    expect(output).toBeInstanceOf(NextRequest);
    expect(await output.text()).toBe("");
  });
  it("rejects missing and cross-origin writes before reading", async () => {
    for (const Origin of ["", "https://attacker.invalid"]) {
      const output = await boundBffRequest(request("{}", { Origin }));
      expect(output).toBeInstanceOf(NextResponse);
      expect((output as NextResponse).status).toBe(403);
      expect(output.headers.get("cache-control")).toContain("no-store");
    }
  });
  it("rejects declared oversized JSON before buffering", async () => {
    const output = await boundBffRequest(request("{}", { "Content-Length": "65537" }));
    expect((output as NextResponse).status).toBe(413);
  });
  it("enforces aggregate chunks with absent or dishonest Content-Length", async () => {
    for (const headers of [{}, { "Content-Length": "2" }] as Record<string, string>[]) {
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new Uint8Array(40000)); controller.enqueue(new Uint8Array(40000)); controller.close();
      } });
      const output = await boundBffRequest(request(body, headers));
      expect((output as NextResponse).status).toBe(413);
    }
  });
  it("rejects unsupported content type and compressed input", async () => {
    for (const headers of [{ "Content-Type": "text/plain" }, { "Content-Encoding": "gzip" }] as Record<string, string>[]) {
      const output = await boundBffRequest(request("{}", headers));
      expect((output as NextResponse).status).toBe(415);
    }
  });
  it("keeps multipart parsing available only at owned upload routes", async () => {
    const form = new FormData(); form.set("file", new File(["fixture"], "meal.png", { type: "image/png" }));
    const input = new NextRequest("https://craves.in/api/chef/menu/11111111-1111-4111-8111-111111111111/images",
      { method: "POST", headers: { Origin: "https://craves.in" }, body: form });
    const output = await boundBffRequest(input);
    expect(output).toBeInstanceOf(NextRequest);
    expect((await (output as NextRequest).formData()).get("file")).toBeInstanceOf(File);
    const rejected = await boundBffRequest(request("unused", { "Content-Type": "multipart/form-data; boundary=fixture" }));
    expect((rejected as NextResponse).status).toBe(415);
  });
  it("terminates stalled reads and releases its in-flight slot", async () => {
    vi.useFakeTimers();
    const pending = boundBffRequest(request(new ReadableStream<Uint8Array>({ start() {} })));
    await vi.advanceTimersByTimeAsync(5001);
    expect((await pending as NextResponse).status).toBe(408);
    expect(await boundBffRequest(request("{}"))).toBeInstanceOf(NextRequest);
  });
  it("caps simultaneous JSON readers without waiting for the entire body", async () => {
    vi.useFakeTimers();
    const pending = Array.from({ length: 16 }, () => boundBffRequest(request(new ReadableStream<Uint8Array>({ start() {} }))));
    const excess = await boundBffRequest(request("{}"));
    expect((excess as NextResponse).status).toBe(429);
    await vi.advanceTimersByTimeAsync(5001);
    expect((await Promise.all(pending)).every(result => (result as NextResponse).status === 408)).toBe(true);
  });
});
