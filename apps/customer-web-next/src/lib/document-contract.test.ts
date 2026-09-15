import assert from "node:assert/strict";
import test from "node:test";
import { documentCapabilitiesSchema, documentEmailSchema, documentRequestSchema, documentSummarySchema } from "./document-contract.ts";
import { documentQuery, documentRoute, readDocumentBytes } from "./document-transport.ts";

const id = "11111111-1111-4111-8111-111111111111";
const ready = { id, type: "PAYMENT_RECEIPT", reference: id, currency: "INR", status: "READY", createdAt: "2026-09-01T06:00:00Z", readyAt: "2026-09-01T06:00:01Z", sha256: "a".repeat(64), bytes: 120, templateVersion: "craves-documents-v1", errorCode: null };

test("customer requests require a source and reject supplied money or recipient", () => {
  assert.equal(documentRequestSchema.safeParse({ type: "PAYMENT_RECEIPT", sourceId: id }).success, true);
  assert.equal(documentRequestSchema.safeParse({ type: "PAYMENT_RECEIPT" }).success, false);
  assert.equal(documentRequestSchema.safeParse({ type: "PAYMENT_RECEIPT", sourceId: id, amount: 1 }).success, false);
  assert.equal(documentRequestSchema.safeParse({ type: "PAYMENT_RECEIPT", sourceId: id, email: "someone@example.test" }).success, false);
});
test("chef period is end exclusive and bounded to 31 calendar days", () => {
  assert.equal(documentRequestSchema.safeParse({ type: "CHEF_EARNINGS_STATEMENT", from: "2026-09-01", to: "2026-10-01" }).success, true);
  for (const to of ["2026-09-01", "2026-12-01", "2026-09-99"]) assert.equal(documentRequestSchema.safeParse({ type: "CHEF_ORDER_STATEMENT", from: "2026-09-01", to }).success, false);
});
test("unknown tax invoice types and invalid timezones are rejected", () => {
  assert.equal(documentRequestSchema.safeParse({ type: "TAX_INVOICE", sourceId: id }).success, false);
  assert.equal(documentRequestSchema.safeParse({ type: "ORDER_SUMMARY", sourceId: id, timezone: "not-a-zone" }).success, false);
});
test("ready PDFs require integrity metadata and exclude private blob paths", () => {
  assert.equal(documentSummarySchema.safeParse(ready).success, true);
  assert.equal(documentSummarySchema.safeParse({ ...ready, sha256: null }).success, false);
  assert.equal(documentSummarySchema.safeParse({ ...ready, bytes: 5 * 1024 * 1024 }).success, false);
  assert.equal(documentSummarySchema.safeParse({ ...ready, blobKey: "private/path" }).success, false);
});
test("provider acceptance is not relabelled as inbox delivery", () => {
  const email = { id, documentId: id, status: "ACCEPTED", createdAt: ready.createdAt, updatedAt: ready.createdAt, errorCode: null };
  assert.equal(documentEmailSchema.safeParse(email).success, true);
  assert.equal(documentEmailSchema.safeParse({ ...email, status: "DELIVERED" }).success, false);
  assert.equal(documentEmailSchema.safeParse({ ...email, status: "UNKNOWN" }).success, true);
});
test("capabilities cannot enable unimplemented tax invoices", () => {
  assert.equal(documentCapabilitiesSchema.safeParse({ enabled: true, emailEnabled: false, types: ["ORDER_SUMMARY"], maxPeriodDays: 31, maxRows: 1000, taxInvoicesEnabled: true }).success, false);
});
test("proxy allows only exact document operations", () => {
  assert.equal(documentRoute("GET", [id, "download"]), "download");
  assert.equal(documentRoute("POST", [id, "email"]), "email");
  assert.equal(documentRoute("GET", []), "list");
  for (const route of [["..", "admin"], [id, "email", "extra"], ["https://other.test"], [id, "erase"]]) assert.equal(documentRoute("POST", route), null);
  assert.equal(documentRoute("POST", [id, "download"]), null);
});
test("queries preserve cursor and reference and reject duplicates", () => {
  const query = documentQuery("list", new URLSearchParams({ cursor: "abc-_", reference: id, limit: "20" }));
  assert.match(query, /cursor=abc-_/); assert.match(query, /reference=/);
  assert.throws(() => documentQuery("list", new URLSearchParams("limit=20&limit=50")));
  assert.throws(() => documentQuery("download", new URLSearchParams("url=https://other.test")));
  assert.throws(() => documentQuery("list", new URLSearchParams("limit=99")));
});
test("body reader enforces the aggregate size limit", async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)); controller.close(); } });
  await assert.rejects(readDocumentBytes(body, 10, 1000), /DOCUMENT_BODY_TOO_LARGE/);
});
test("body reader terminates a stalled stream", async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); } });
  await assert.rejects(readDocumentBytes(body, 10, 20), /DOCUMENT_BODY_TIMEOUT/);
});
test("body reader preserves bytes without encoding them", async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([37, 80, 68, 70, 45])); controller.close(); } });
  assert.deepEqual(await readDocumentBytes(body, 10, 1000), new Uint8Array([37, 80, 68, 70, 45]));
});
