import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/chef/application/route";
import { POST as uploadProof } from "../app/api/chef/application/proof-files/route";
import { GET as readProfile } from "../app/api/customer/profile/route";
import { GET as readMenu, POST as createDish } from "../app/api/chef/menu/route";
import { PUT as editDish } from "../app/api/chef/menu/[menuItemId]/route";
import { PATCH as updateAvailability } from "../app/api/chef/menu/[menuItemId]/availability/route";

const upstream = vi.hoisted(() => vi.fn());
vi.mock("./bounded-fetch", () => ({ boundedFetch: upstream }));
afterEach(() => { upstream.mockReset(); vi.unstubAllEnvs(); });
const details = { email: "chef@example.invalid", firstName: "Test", lastName: "Chef", addressLine1: "Test kitchen", city: "Hyderabad", state: "Telangana", latitude: null, longitude: null };
function request() {
  vi.stubEnv("CRAVES_API_BASE_URL", "https://api.craves.in/api/v1");
  return new NextRequest("https://craves.in/api/chef/application", {
    method: "POST", headers: { Origin: "https://craves.in", "Content-Type": "application/json", Cookie: "craves_access_token=fixture-only" },
    body: JSON.stringify(details),
  });
}

it("forwards a new application to the correct authenticated APIM operation", async () => {
  upstream.mockResolvedValue(Response.json({ ...details, id: "11111111-1111-4111-8111-111111111111", status: "PENDING", documents: [] }));
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect((await response.json()).status).toBe("PENDING");
  expect(upstream).toHaveBeenCalledWith("https://api.craves.in/api/v1/chef/application", expect.objectContaining({
    method: "POST", headers: expect.objectContaining({ Authorization: "Bearer fixture-only" }),
  }), 40_000);
  expect(JSON.parse(upstream.mock.calls[0][1].body)).toMatchObject(details);
});

function menuRequest(method: "GET" | "POST" | "PUT" | "PATCH") {
  vi.stubEnv("CRAVES_API_BASE_URL", "https://api.craves.in/api/v1");
  return new NextRequest("https://craves.in/api/chef/menu", {
    method, headers: { Origin: "https://craves.in", Cookie: "craves_access_token=fixture-only", ...(method !== "GET" ? { "Content-Type": "application/json" } : {}) },
    ...(method !== "GET" ? { body: JSON.stringify(method === "PATCH" ? { available: false } : { itemName: "Fixture dish", category: "Meals", foodType: "VEG", price: 180, currency: "INR", unitPackageWeightGrams: 500, available: false, status: "DRAFT" }) } : {}),
  });
}

it.each(["GET", "POST", "PUT", "PATCH"] as const)("preserves the exact missing-kitchen error for menu %s without leaking backend diagnostics", async method => {
  upstream.mockResolvedValue(Response.json({ code: "KITCHEN_PROFILE_REQUIRED", message: "private upstream diagnostics" }, { status: 400 }));
  const context = { params: Promise.resolve({ menuItemId: "11111111-1111-4111-8111-111111111111" }) };
  const response = await (method === "GET" ? readMenu(menuRequest(method)) : method === "POST" ? createDish(menuRequest(method)) : method === "PUT" ? editDish(menuRequest(method), context) : updateAvailability(menuRequest(method), context));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "KITCHEN_PROFILE_REQUIRED", message: "Set up your kitchen before adding or managing dishes." });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const path = method === "PUT" || method === "PATCH" ? "/11111111-1111-4111-8111-111111111111" + (method === "PATCH" ? "/availability" : "") : "";
  expect(upstream).toHaveBeenCalledWith(`https://api.craves.in/api/v1/kitchens/me/menu-items${path}`, expect.objectContaining({ method, headers: expect.objectContaining({ Authorization: "Bearer fixture-only" }) }), 40_000);
});

it("does not reinterpret another menu rejection as a missing kitchen", async () => {
  upstream.mockResolvedValue(Response.json({ code: "INVALID_PACKAGE_WEIGHT", message: "private diagnostics" }, { status: 400 }));
  const response = await readMenu(menuRequest("GET"));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "MENU_REQUEST_FAILED" });
});

it.each([
  [409, "EMAIL_VERIFICATION_REQUIRED", "Verify the email"],
  [503, "EMAIL_AUTHORITY_UNAVAILABLE", "confirm your verified email"],
  [409, "CHEF_ALREADY_APPROVED", "already approved"],
])("preserves an actionable %s %s error without exposing upstream internals", async (status, code, expected) => {
  upstream.mockResolvedValue(Response.json({ code, message: "private upstream diagnostics" }, { status }));
  const response = await POST(request());
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(body.code).toBe(code);
  expect(body.message).toContain(expected);
  expect(body.message).not.toContain("private upstream");
});

it("tells the applicant to check saved status after a timeout", async () => {
  upstream.mockRejectedValue(new DOMException("Timed out", "AbortError"));
  const response = await POST(request());
  expect(response.status).toBe(504);
  expect((await response.json()).message).toContain("check whether it was saved");
});

function uploadRequest() {
  vi.stubEnv("CRAVES_API_BASE_URL", "https://api.craves.in/api/v1");
  const body = new FormData();
  body.set("documentType", "GOVERNMENT_ID_FRONT");
  body.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "fixture.jpg", { type: "image/jpeg" }));
  return new NextRequest("https://craves.in/api/chef/application/proof-files", {
    method: "POST", headers: { Origin: "https://craves.in", Cookie: "craves_access_token=fixture-only" }, body,
  });
}

it.each([
  ["CUSTOMER_PROFILE_NOT_FOUND", 200],
  ["ResourceNotFound", 404],
])("treats only %s as an empty customer profile and preserves routing failures", async (code, status) => {
  vi.stubEnv("CRAVES_API_BASE_URL", "https://api.craves.in/api/v1");
  upstream.mockResolvedValue(Response.json({ code }, { status: 404 }));
  const response = await readProfile(new NextRequest("https://craves.in/api/customer/profile", {
    headers: { Cookie: "craves_access_token=fixture-only" },
  }));
  expect(response.status).toBe(status);
  if (status === 200) {
    expect(await response.json()).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  }
});

it.each([
  ["DOCUMENT_STORE_NOT_CONFIGURED", "file format is not the issue"],
  ["DOCUMENT_UPLOAD_FAILED", "could not store"],
  ["DOCUMENT_CONTENT_TYPE_MISMATCH", "contents do not match"],
  ["DOCUMENT_FILE_TOO_LARGE", "no larger than 10 MB"],
  ["CHEF_APPLICATION_REQUIRED", "Save your Chef application details"],
])("distinguishes %s from an unsupported file without exposing internal diagnostics", async (code, message) => {
  upstream.mockResolvedValue(Response.json({ code, message: "private storage diagnostics" }, { status: 400 }));
  const response = await uploadProof(uploadRequest());
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.code).toBe(code);
  expect(body.message).toContain(message);
  expect(body.message).not.toContain("private storage");
  const [url, options] = upstream.mock.calls[0];
  expect(url).toBe("https://api.craves.in/api/v1/chef/application/proof-files?documentType=GOVERNMENT_ID_FRONT");
  expect(options.headers.Authorization).toBe("Bearer fixture-only");
  expect(options.headers["Content-Type"]).toBeUndefined();
  expect((options.body as FormData).get("file")).toMatchObject({ name: "fixture.jpg", type: "image/jpeg", size: 4 });
});
