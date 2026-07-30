import { describe, expect, it } from "vitest";
import {
  parseAdminAccountAction,
  parseAdminAccountInterventionStatus,
  parseAdminAccountLookup
} from "./admin-account-intervention-contract";

const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("admin account intervention contract", () => {
  it("accepts an exact identity UUID lookup", () => {
    expect(parseAdminAccountLookup({ identityId: ID })).toEqual({ identityId: ID });
    expect(parseAdminAccountLookup({ identityId: "not-a-uuid" })).toBeNull();
  });

  it("requires matching typed confirmation and a bounded reason", () => {
    expect(parseAdminAccountAction({ identityId: ID, action: "SUSPEND", reason: "Confirmed support escalation", confirmation: "SUSPEND" }))
      .toEqual({ identityId: ID, action: "SUSPEND", reason: "Confirmed support escalation", confirmation: "SUSPEND" });
    expect(parseAdminAccountAction({ identityId: ID, action: "SUSPEND", reason: "Confirmed support escalation", confirmation: "REACTIVATE" })).toBeNull();
    expect(parseAdminAccountAction({ identityId: ID, action: "SUSPEND", reason: "short", confirmation: "SUSPEND" })).toBeNull();
  });

  it("rejects unbounded or malformed backend data", () => {
    expect(parseAdminAccountInterventionStatus({
      interventionId: ID,
      identityId: ID,
      maskedPhoneNumber: "+91******1234",
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
    })?.status).toBe("SUSPENDED");
    expect(parseAdminAccountInterventionStatus({ identityId: ID, status: "ACTIVE", tokenVersion: -1, providerAttemptCount: 0, changed: false })).toBeNull();
    expect(parseAdminAccountInterventionStatus({ identityId: ID, status: "ACTIVE", tokenVersion: 1, providerAttemptCount: 0, changed: "yes" })).toBeNull();
  });
});
