import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { parseChefApplicationReadiness, chefReadinessSummary } from "./chef-readiness-contract";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", () => ({ authenticatedApiFetch: upstream, SessionRequiredError: class extends Error {} }));
import { GET } from "@/app/api/chef/application/readiness/route";

function ready() {
  return {
    contractVersion: 1, applicationStatus: "PENDING", emailStatus: "VERIFIED", approvalReady: true,
    requiredDocumentCount: 4, uploadedDocumentCount: 4, approvedDocumentCount: 4,
    documents: ["APPLICANT_PHOTO", "GOVERNMENT_ID_FRONT", "GOVERNMENT_ID_BACK", "TAX_ID_CARD"].map(documentType => ({
      documentType, status: "APPROVED", rejectionReason: null, blobName: "private-path",
    })), blockingIssues: [], evaluatedAt: "2026-10-01T00:00:00Z", lastSavedAt: null,
  };
}
const request = () => new NextRequest("https://craves.in/api/chef/application/readiness");

describe("Chef application readiness contract and authenticated proxy", () => {
  beforeEach(() => upstream.mockReset());
  it("shows final admin review, never claims a pending application is approved", async () => {
    upstream.mockResolvedValue(Response.json({ ...ready(), identityId: "private-identity" }));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(JSON.stringify(body)).not.toMatch(/private-path|private-identity|blobName/);
    expect(chefReadinessSummary(body)).toContain("awaiting the final admin decision");
    expect(upstream.mock.calls[0][1]).toBe("/chef/application/readiness");
  });
  it("rejects legacy proof types, duplicated evidence, inconsistent counts and premature readiness", () => {
    const legacy = ready(); legacy.documents[0].documentType = "AADHAAR_CARD";
    const duplicate = ready(); duplicate.documents[0] = duplicate.documents[1];
    const unverified = { ...ready(), emailStatus: "VERIFICATION_REQUIRED" };
    const premature = ready(); premature.documents[0].status = "UPLOADED";
    for (const payload of [legacy, duplicate, unverified, premature, { ...ready(), approvedDocumentCount: 3 }, { ...ready(), contractVersion: 2 }]) {
      expect(parseChefApplicationReadiness(payload)).toBeNull();
    }
  });
  it("preserves rejected evidence and its repair reason", () => {
    const payload = ready();
    const rejected = { ...payload, approvalReady: false, approvedDocumentCount: 3,
      documents: payload.documents.map((document, index) => index === 0 ? { ...document, status: "REJECTED", rejectionReason: "Image is unreadable" } : document),
      blockingIssues: [{ code: "DOCUMENT_REJECTED", documentType: "APPLICANT_PHOTO" }] };
    expect(parseChefApplicationReadiness(rejected)?.documents[0].rejectionReason).toBe("Image is unreadable");
  });
  it.each([401, 403, 500])("sanitizes upstream %s without showing a successful checklist", async status => {
    upstream.mockResolvedValue(Response.json({ message: "sensitive-provider-detail" }, { status }));
    const response = await GET(request());
    expect(response.status).toBe(status === 401 ? 401 : 503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("sensitive-provider-detail");
  });
  it("rejects malformed successful responses", async () => {
    upstream.mockResolvedValue(Response.json({ approvalReady: true }));
    expect((await GET(request())).status).toBe(502);
  });
});
