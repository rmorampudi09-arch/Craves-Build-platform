import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminIdentity } from "./admin-contract.ts";

test("enables an active platform administrator from the Java auth/me identity envelope", () => {
  const parsed = parseAdminIdentity({
    identity: {
      id: "11111111-1111-4111-8111-111111111111",
      firebaseUid: "private-firebase-uid",
      phoneNumber: "+919876543210",
      displayName: "Admin",
      email: "admin@example.com",
      status: "ACTIVE",
      roles: ["CUSTOMER", "PLATFORM_ADMIN"]
    }
  });

  assert.equal(parsed?.adminEnabled, true);
  assert.equal(parsed?.displayName, "Admin");
  assert.equal(parsed?.email, "admin@example.com");
  assert.equal("id" in (parsed ?? {}), false);
  assert.equal("roles" in (parsed ?? {}), false);
  assert.equal("phoneNumber" in (parsed ?? {}), false);
  assert.equal("firebaseUid" in (parsed ?? {}), false);
});

test("retains compatibility with an older flat identity response", () => {
  const parsed = parseAdminIdentity({
    displayName: "Admin",
    email: "admin@example.com",
    status: "active",
    roles: ["platform_admin"]
  });

  assert.equal(parsed?.adminEnabled, true);
  assert.equal(parsed?.status, "ACTIVE");
});

test("accepts the privacy-reduced admin BFF response", () => {
  const parsed = parseAdminIdentity({
    displayName: "Operations Admin",
    email: "admin@example.com",
    status: "ACTIVE",
    adminEnabled: true,
  });

  assert.equal(parsed?.adminEnabled, true);
  assert.equal(parsed?.displayName, "Operations Admin");
});

test("does not enable inactive or non-admin identity", () => {
  assert.equal(parseAdminIdentity({ identity: { status: "INACTIVE", roles: ["PLATFORM_ADMIN"] } })?.adminEnabled, false);
  assert.equal(parseAdminIdentity({ identity: { status: "ACTIVE", roles: ["CUSTOMER"] } })?.adminEnabled, false);
});

for (const role of ["PLATFORM_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "CHEF_ADMIN", "COMPLIANCE_ADMIN", "SUBSCRIPTION_ADMIN", "NOTIFICATION_ADMIN", "AUDIT_ADMIN"]) {
  test(`accepts the documented ${role} without a legacy ADMIN grant`, () => {
    assert.equal(parseAdminIdentity({ identity: { status: "ACTIVE", roles: ["CUSTOMER", role] } })?.adminEnabled, true);
  });
}

test("does not treat the legacy ADMIN alias or unknown roles as an internal role", () => {
  for (const role of ["ADMIN", "SUPER_ADMIN", "CUSTOMER", "CHEF"]) {
    assert.equal(parseAdminIdentity({ identity: { status: "ACTIVE", roles: [role] } })?.adminEnabled, false);
  }
});

test("rejects malformed or incomplete identity envelopes", () => {
  assert.equal(parseAdminIdentity(null), null);
  assert.equal(parseAdminIdentity({ identity: null }), null);
  assert.equal(parseAdminIdentity({ identity: { status: "ACTIVE", roles: [] } }), null);
});
