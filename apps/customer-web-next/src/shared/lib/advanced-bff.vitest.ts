// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const publicFetch = vi.hoisted(() => vi.fn());
const userFetch = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/public-api", () => ({ publicApiFetch: publicFetch }));
vi.mock("@/shared/lib/server-api", () => ({
  authenticatedApiFetch: userFetch,
  SessionRequiredError: class SessionRequiredError extends Error {},
}));
import { DELETE, GET, POST, PUT } from "@/app/api/advanced/[...path]/route";
import { SessionRequiredError } from "@/shared/lib/server-api";

const LIST = "8f0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const DISH = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCde";
const at = (path: string[]) => ({ params: Promise.resolve({ path }) });
const request = (method: string, path: string[], init: { body?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`https://craves.in/api/advanced/${path.join("/")}`, {
    method,
    headers: { origin: "https://craves.in", host: "craves.in", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    body: init.body,
  });

beforeEach(() => {
  publicFetch.mockReset();
  userFetch.mockReset();
});

describe("advanced API proxy", () => {
  it("reads a shared list without the person's token, uncached", async () => {
    publicFetch.mockResolvedValue(Response.json({ name: "Sunday lunch", items: [] }));
    const response = await GET(request("GET", ["shared-food-lists", TOKEN]), at(["shared-food-lists", TOKEN]));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(publicFetch).toHaveBeenCalledWith(`/advanced/shared-food-lists/${TOKEN}`, { method: "GET", headers: {} });
    expect(userFetch).not.toHaveBeenCalled();
  });

  it("signs a person's call, forwards only the idempotency key and passes 201 through", async () => {
    userFetch.mockResolvedValue(Response.json({ id: LIST }, { status: 201 }));
    const response = await POST(
      request("POST", ["food-lists"], { body: '{"name":"Sunday lunch"}', headers: { "idempotency-key": "key-12345678", "if-match": '"3"', cookie: "x=y" } }),
      at(["food-lists"]),
    );
    expect(response.status).toBe(201);
    const [, path, init] = userFetch.mock.calls[0]!;
    expect(path).toBe("/advanced/food-lists");
    expect(init).toEqual({ method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "key-12345678" }, body: '{"name":"Sunday lunch"}' });
  });

  it("keeps 204 and lets an optional body be empty", async () => {
    userFetch.mockResolvedValue(new Response(null, { status: 204 }));
    expect((await DELETE(request("DELETE", ["food-lists", LIST, "share"]), at(["food-lists", LIST, "share"]))).status).toBe(204);
    userFetch.mockResolvedValue(Response.json({ id: LIST }));
    expect((await PUT(request("PUT", ["food-lists", LIST, "items", DISH]), at(["food-lists", LIST, "items", DISH]))).status).toBe(200);
  });

  it("passes a bodyless delete that arrives as an empty stream, as a real server hands it over", async () => {
    userFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const init = { method: "DELETE", headers: { origin: "https://craves.in", host: "craves.in" }, body: new ReadableStream({ start: (controller) => controller.close() }), duplex: "half" };
    const response = await DELETE(new NextRequest(`https://craves.in/api/advanced/food-lists/${LIST}`, init as unknown as ConstructorParameters<typeof NextRequest>[1]), at(["food-lists", LIST]));
    expect(response.status).toBe(204);
    expect(userFetch).toHaveBeenCalledWith(expect.anything(), `/advanced/food-lists/${LIST}`, { method: "DELETE", headers: {} });
  });

  it("lets one visitor read 30 shared lists a minute, then asks them to wait", async () => {
    publicFetch.mockImplementation(async () => Response.json({ name: "Sunday lunch", items: [] }));
    const read = () => GET(request("GET", ["shared-food-lists", TOKEN], { headers: { "x-azure-socketip": "203.0.113.7" } }), at(["shared-food-lists", TOKEN]));
    for (let index = 0; index < 30; index += 1) expect((await read()).status).toBe(200);
    const refused = await read();
    expect([refused.status, refused.headers.get("retry-after"), (await refused.json()).code]).toEqual([429, "60", "TOO_MANY_REQUESTS"]);
    expect(publicFetch).toHaveBeenCalledTimes(30);
  });

  it.each([
    ["an id that is not a UUID", () => GET(request("GET", ["food-lists", "items"]), at(["food-lists", "items"])), 404, "ADVANCED_OPERATION_NOT_FOUND"],
    ["an unlisted call", () => GET(request("GET", ["group-orders"]), at(["group-orders"])), 404, "ADVANCED_OPERATION_NOT_FOUND"],
    ["reordering", () => PUT(request("PUT", ["food-lists", LIST, "items-order"], { body: "{}" }), at(["food-lists", LIST, "items-order"])), 404, "ADVANCED_OPERATION_NOT_FOUND"],
    ["a write from another site", () => POST(request("POST", ["food-lists"], { body: "{}", headers: { origin: "https://evil.example" } }), at(["food-lists"])), 403, "ORIGIN_REJECTED"],
    ["a create without a body", () => POST(request("POST", ["food-lists"]), at(["food-lists"])), 400, "INVALID_REQUEST"],
    ["a body that is not JSON", () => POST(request("POST", ["food-lists"], { body: "name=x" }), at(["food-lists"])), 400, "INVALID_REQUEST"],
    ["a body where none is allowed", () => DELETE(request("DELETE", ["food-lists", LIST], { body: "{}" }), at(["food-lists", LIST])), 400, "INVALID_REQUEST"],
  ])("refuses %s before calling the service", async (_name, call, status, code) => {
    const response = await call();
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
    expect(publicFetch).not.toHaveBeenCalled();
    expect(userFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["the service's own code", () => userFetch.mockResolvedValue(Response.json({ code: "LIST_LIMIT_REACHED" }, { status: 409 })), 409, "LIST_LIMIT_REACHED"],
    ["a route the gateway does not have", () => userFetch.mockResolvedValue(new Response(null, { status: 404 })), 404, "FEATURE_NOT_AVAILABLE"],
    ["a switched-off module", () => userFetch.mockResolvedValue(Response.json({ code: "FEATURE_DISABLED" }, { status: 503 })), 503, "FEATURE_DISABLED"],
    ["no session", () => userFetch.mockRejectedValue(new SessionRequiredError("no")), 401, "SESSION_EXPIRED"],
    ["a network failure", () => userFetch.mockRejectedValue(new TypeError("fetch failed")), 503, "ADVANCED_UNAVAILABLE"],
  ])("answers %s", async (_name, arrange, status, code) => {
    arrange();
    const response = await GET(request("GET", ["food-lists"]), at(["food-lists"]));
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });
});
