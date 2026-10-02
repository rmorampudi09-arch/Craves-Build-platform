import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/chef/application/route";
import { POST as uploadProof } from "../app/api/chef/application/proof-files/route";

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
  ["DOCUMENT_STORE_NOT_CONFIGURED", "file format is not the issue"],
  ["DOCUMENT_UPLOAD_FAILED", "could not store"],
  ["DOCUMENT_CONTENT_TYPE_MISMATCH", "contents do not match"],
  ["DOCUMENT_FILE_TOO_LARGE", "no larger than 10 MB"],
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
