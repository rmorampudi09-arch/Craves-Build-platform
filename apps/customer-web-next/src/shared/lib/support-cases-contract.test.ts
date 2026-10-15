import assert from "node:assert/strict";
import test from "node:test";
import { parseSupportCase, parseSupportCasePage, parseSupportCaseSummary } from "./support-cases-contract.ts";

const CASE_ID = "5a0c0000-0000-4000-8000-0000000000c1";
const ORDER_ID = "0bde0000-0000-4000-8000-000000000101";
const ME = "1d000000-0000-4000-8000-000000000001";

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: CASE_ID, caseNumber: "CRV-5A0C000000004000800000000000", requesterIdentityId: ME, requesterRole: "CHEF", orderId: ORDER_ID,
    subject: "Change my meal plan", status: "OPEN", assignedToIdentityId: null, lastRequesterMessageAt: "2026-10-10T08:00:00Z",
    lastSupportMessageAt: null, resolvedAt: null, closedAt: null, createdAt: "2026-10-10T08:00:00Z", updatedAt: "2026-10-10T08:00:00.123456Z", ...overrides,
  };
}
function message(overrides: Record<string, unknown> = {}) {
  return { id: "3e000000-0000-4000-8000-000000000001", senderIdentityId: ME, senderRole: "CHEF", body: "Please move Monday to Tuesday.", internalNote: false, createdAt: "2026-10-10T08:00:00Z", ...overrides };
}
const detail = (overrides: Record<string, unknown> = {}) => ({ supportCase: summary(), messages: [message(), message({ id: "3e000000-0000-4000-8000-000000000002", senderIdentityId: null, senderRole: "SUPPORT", body: "Done." })], statusHistory: [], ...overrides });

test("a backend case detail becomes one flat case with its messages, and parsing it again keeps it", () => {
  const parsed = parseSupportCase(detail());
  assert.ok(parsed);
  assert.equal(parsed.subject, "Change my meal plan");
  assert.equal(parsed.caseNumber, "CRV-5A0C000000004000800000000000");
  assert.deepEqual(parsed.messages.map(entry => entry.senderRole), ["CHEF", "SUPPORT"]);
  assert.equal("requesterIdentityId" in parsed, false);
  assert.equal("senderIdentityId" in parsed.messages[0], false);
  assert.deepEqual(parseSupportCase(parsed), parsed);
});

test("unknown optional fields are tolerated, broken cases are rejected", () => {
  assert.ok(parseSupportCaseSummary(summary({ somethingNew: 1 })));
  assert.equal(parseSupportCaseSummary(summary({ orderId: null }))?.orderId, null);
  for (const bad of [
    summary({ id: "nope" }), summary({ status: "ESCALATED" }), summary({ requesterRole: "SUPPORT_ADMIN" }), summary({ orderId: "x" }),
    summary({ subject: "" }), summary({ subject: "s".repeat(161) }), summary({ createdAt: "yesterday" }), summary({ resolvedAt: "soon" }),
    summary({ caseNumber: "<b>" }), null, [],
  ]) assert.equal(parseSupportCaseSummary(bad), null);
  assert.equal(parseSupportCase(detail({ messages: [message({ internalNote: true })] })), null);
  assert.equal(parseSupportCase(detail({ messages: [message({ body: "b".repeat(5001) })] })), null);
  assert.equal(parseSupportCase(detail({ messages: [message({ senderRole: "PLATFORM_ADMIN" })] })), null);
  assert.equal(parseSupportCase(detail({ messages: undefined })), null);
});

test("pages read the backend's cases and the BFF's items, with a bounded opaque cursor", () => {
  const page = parseSupportCasePage({ cases: [summary()], nextCursor: "abc", hasMore: true });
  assert.ok(page);
  assert.equal(page.items[0].id, CASE_ID);
  assert.equal(page.nextCursor, "abc");
  assert.deepEqual(parseSupportCasePage(page), page);
  assert.deepEqual(parseSupportCasePage({ cases: [], nextCursor: null, hasMore: false }), { items: [], nextCursor: null });
  assert.equal(parseSupportCasePage({ cases: [summary()], nextCursor: "c".repeat(513) }), null);
  assert.equal(parseSupportCasePage({ cases: [summary({ status: "?" })], nextCursor: null }), null);
  assert.equal(parseSupportCasePage({ nextCursor: null }), null);
});
