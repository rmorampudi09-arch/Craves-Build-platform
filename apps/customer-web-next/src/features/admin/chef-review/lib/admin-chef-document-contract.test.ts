import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminChefDocument, parseAdminChefDocuments } from "./admin-chef-document-contract.ts";

const document = {
  id: "998ec1b8-1b7f-4e60-89e5-a5eb4ed6da1b",
  documentType: "GOVERNMENT_ID_FRONT",
  originalFileName: "id-front.pdf",
  fileSizeBytes: 204800,
  status: "REJECTED",
  reviewReason: "The image is blurred. Upload a clear replacement.",
  reviewedAt: "2026-08-20T08:00:00Z",
  blobContainer: "private-container",
  blobName: "kyc/private-path.pdf",
  reviewedByIdentityId: "cc62bb4f-f06a-4a2c-9dc3-cdc518be8b02",
};

test("Chef document contract preserves the individual decision without private storage fields", () => {
  const parsed = parseAdminChefDocument(document);
  assert.equal(parsed?.status, "REJECTED");
  assert.equal(parsed?.reviewReason, "The image is blurred. Upload a clear replacement.");
  assert.equal("blobContainer" in (parsed ?? {}), false);
  assert.equal("blobName" in (parsed ?? {}), false);
  assert.equal("reviewedByIdentityId" in (parsed ?? {}), false);
});

test("Chef document contract supports all three review states", () => {
  for (const status of ["UPLOADED", "APPROVED", "REJECTED"]) {
    assert.equal(parseAdminChefDocument({ ...document, status })?.status, status);
  }
});

test("Chef document contract rejects unsupported state and unbounded arrays", () => {
  assert.equal(parseAdminChefDocument({ ...document, status: "PENDING" }), null);
  assert.equal(parseAdminChefDocuments(Array.from({ length: 21 }, () => document)), null);
});
