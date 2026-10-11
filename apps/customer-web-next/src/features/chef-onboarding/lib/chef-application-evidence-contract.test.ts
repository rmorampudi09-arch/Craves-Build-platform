import assert from "node:assert/strict";
import test from "node:test";
import { parseChefEvidenceList, parseChefEvidenceMetadata } from "./chef-application-evidence-contract.ts";

const document = {
  id: "998ec1b8-1b7f-4e60-89e5-a5eb4ed6da1b",
  documentType: "GOVERNMENT_ID_FRONT",
  originalFileName: "government-id-front.pdf",
  fileSizeBytes: 204800,
  status: "REJECTED",
  reviewReason: "The image is blurred. Upload a clear replacement.",
  reviewedAt: "2026-08-20T08:00:00Z",
  blobContainer: "private-kyc",
  blobName: "kyc/private/document.pdf",
  reviewedByIdentityId: "cc62bb4f-f06a-4a2c-9dc3-cdc518be8b02",
};

test("Chef evidence includes only the safe per-document decision fields", () => {
  const parsed = parseChefEvidenceMetadata(document);
  assert.equal(parsed?.status, "REJECTED");
  assert.equal(parsed?.reviewReason, "The image is blurred. Upload a clear replacement.");
  assert.equal(parsed?.reviewedAt, "2026-08-20T08:00:00Z");
  assert.equal("blobContainer" in (parsed ?? {}), false);
  assert.equal("blobName" in (parsed ?? {}), false);
  assert.equal("reviewedByIdentityId" in (parsed ?? {}), false);
});

test("Chef evidence accepts uploaded, approved and rejected states only", () => {
  for (const status of ["UPLOADED", "APPROVED", "REJECTED"] as const) {
    assert.equal(parseChefEvidenceMetadata({ ...document, status })?.status, status);
  }
  assert.equal(parseChefEvidenceMetadata({ ...document, status: "PENDING" }), null);
});

test("Chef evidence sanitizes rejection reason and invalid review time", () => {
  const parsed = parseChefEvidenceMetadata({
    ...document,
    reviewReason: "Bad scan\r\nUpload again",
    reviewedAt: "not-a-date",
  });
  assert.equal(parsed?.reviewReason, "Bad scan Upload again");
  assert.equal(parsed?.reviewedAt, null);
});

test("Chef evidence rejects unbounded lists", () => {
  assert.equal(parseChefEvidenceList(Array.from({ length: 21 }, () => document)), null);
});
