import { describe, expect, it } from "vitest";
import {
  parseNotificationBacklog,
  parseNotificationBacklogQuery,
  parseNotificationRecoveryRequest,
  parseNotificationRecoveryResult
} from "./admin-notification-recovery-contract";

const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("admin notification recovery contract", () => {
  it("bounds backlog filters", () => {
    expect(parseNotificationBacklogQuery(new URLSearchParams("status=FAILED&limit=25"))).toEqual({ status: "FAILED", limit: 25 });
    expect(parseNotificationBacklogQuery(new URLSearchParams("status=SENT"))).toBeNull();
    expect(parseNotificationBacklogQuery(new URLSearchParams("limit=101"))).toBeNull();
  });

  it("omits recipient identity and accepts bounded operational fields", () => {
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
    expect(result?.[0].requestId).toBe(ID);
    expect(result?.[0]).not.toHaveProperty("recipientIdentityId");
    expect(result?.[0]).not.toHaveProperty("requestKey");
  });

  it("requires exact RETRY confirmation", () => {
    expect(parseNotificationRecoveryRequest({ requestId: ID, reason: "Support case requires retry", confirmation: "RETRY" })?.confirmation).toBe("RETRY");
    expect(parseNotificationRecoveryRequest({ requestId: ID, reason: "Support case requires retry", confirmation: "retry" })).toBeNull();
  });

  it("validates the recovery audit response", () => {
    expect(parseNotificationRecoveryResult({
      recoveryAuditId: ID,
      requestId: ID,
      previousStatus: "FAILED",
      newStatus: "PENDING",
      previousAttemptCount: 3,
      correlationId: ID,
      requeuedAt: "2026-07-31T00:00:00Z"
    })?.newStatus).toBe("PENDING");
  });
});
