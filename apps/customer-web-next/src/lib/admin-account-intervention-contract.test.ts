import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAdminAccountAction,
  parseAdminAccountInterventionStatus,
  parseAdminAccountLookup
} from "./admin-account-intervention-contract";

const ID = "123e4567-e89b-42d3-a456-426614174000";

test("accepts an exact identity UUID lookup", () => {
  assert.deepEqual(parseAdminAccountLookup({ identityId: ID }), { identityId: ID });
  assert.equal(parseAdminAccountLookup({ identityId: "not-a-uuid" }), null);
});

test("requires matching typed confirmation and a bounded reason", () => {
  assert.deepEqual(
    parseAdminAccountAction({
      identityId: ID,
      action: "SUSPEND",
      reason: "Confirmed support escalation",
      confirmation: "SUSPEND"
    }),
    {
      identityId: ID,
      action: "SUSPEND",
      reason: "Confirmed support escalation",
      confirmation: "SUSPEND"
    }
  );
  assert.equal(
    parseAdminAccountAction({
      identityId: ID,
      action: "SUSPEND",
      reason: "Confirmed support escalation",
      confirmation: "REACTIVATE"
    }),
    null
  );
  assert.equal(
    parseAdminAccountAction({
      identityId: ID,
      action: "SUSPEND",
      reason: "short",
      confirmation: "SUSPEND"
    }),
    null
  );
});

test("validates bounded backend data", () => {
  const parsed = parseAdminAccountInterventionStatus({
    interventionId: ID,
    identityId: ID,
    maskedPhoneNumber: "********1234",
    status: "SUSPENDED",
    tokenVersion: 4,
    action: "SUSPEND",
    requestedStatus: "SUSPENDED",
    providerStatus: "PENDING",
    providerAttemptCount: 0,
    providerLastError: null,
    requestedAt: "2026-07-31T00:00:00Z",
    providerCompletedAt: null,
    correlationId: ID,
    changed: true
  });
  assert.equal(parsed?.status, "SUSPENDED");
  assert.equal(
    parseAdminAccountInterventionStatus({
      identityId: ID,
      status: "ACTIVE",
      tokenVersion: -1,
      providerAttemptCount: 0,
      changed: false
    }),
    null
  );
  assert.equal(
    parseAdminAccountInterventionStatus({
      identityId: ID,
      status: "ACTIVE",
      tokenVersion: 1,
      providerAttemptCount: 0,
      changed: "yes"
    }),
    null
  );
});
