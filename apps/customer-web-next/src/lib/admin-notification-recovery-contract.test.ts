import assert from "node:assert/strict";
import test from "node:test";
import {
  parseNotificationBacklog,
  parseNotificationBacklogQuery,
  parseNotificationRecoveryRequest,
  parseNotificationRecoveryResult
} from "./admin-notification-recovery-contract";

const ID = "123e4567-e89b-42d3-a456-426614174000";

test("bounds backlog filters", () => {
  assert.deepEqual(
    parseNotificationBacklogQuery(new URLSearchParams("status=FAILED&limit=25")),
    { status: "FAILED", limit: 25 }
  );
  assert.equal(parseNotificationBacklogQuery(new URLSearchParams("status=SENT")), null);
  assert.equal(parseNotificationBacklogQuery(new URLSearchParams("limit=101")), null);
});

test("omits recipient identity and accepts bounded operational fields", () => {
  const result = parseNotificationBacklog([{
    requestId: ID,
    requestKey: "private-key",
    recipientIdentityId: ID,
    sourceService: "ORDER",
    eventType: "ORDER_CONFIRMED",
    channel: "PUSH",
    status: "DEAD_LETTER",
    attemptCount: 4,
    lastError: "provider unavailable",
    finalErrorCode: "MAX_ATTEMPTS"
  }]);
  assert.equal(result?.[0]?.requestId, ID);
  assert.equal(Object.hasOwn(result?.[0] ?? {}, "recipientIdentityId"), false);
  assert.equal(Object.hasOwn(result?.[0] ?? {}, "requestKey"), false);
});

test("requires exact RETRY confirmation", () => {
  assert.equal(
    parseNotificationRecoveryRequest({
      requestId: ID,
      reason: "Support case requires retry",
      confirmation: "RETRY"
    })?.confirmation,
    "RETRY"
  );
  assert.equal(
    parseNotificationRecoveryRequest({
      requestId: ID,
      reason: "Support case requires retry",
      confirmation: "retry"
    }),
    null
  );
});

test("validates the recovery audit response", () => {
  assert.equal(parseNotificationRecoveryResult({
    recoveryAuditId: ID,
    requestId: ID,
    previousStatus: "FAILED",
    newStatus: "PENDING",
    previousAttemptCount: 3,
    correlationId: ID,
    requeuedAt: "2026-07-31T00:00:00Z"
  })?.newStatus, "PENDING");
});
