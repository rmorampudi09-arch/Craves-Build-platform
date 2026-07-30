import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminIdentity } from "./admin-contract.ts";

test("enables only active admin role", () => {
  const parsed = parseAdminIdentity({ displayName: "Admin", email: "admin@example.com", status: "ACTIVE", roles: ["CUSTOMER", "ADMIN"], id: "private" });
  assert.equal(parsed?.adminEnabled, true);
  assert.equal("id" in (parsed ?? {}), false);
  assert.equal("roles" in (parsed ?? {}), false);
});

test("does not enable inactive or non-admin identity", () => {
  assert.equal(parseAdminIdentity({ status: "INACTIVE", roles: ["ADMIN"] })?.adminEnabled, false);
  assert.equal(parseAdminIdentity({ status: "ACTIVE", roles: ["CUSTOMER"] })?.adminEnabled, false);
});
