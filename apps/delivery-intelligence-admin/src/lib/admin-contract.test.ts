import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminIdentity } from "./admin-contract.ts";

test("the retired ADMIN role does not open the workspace", () => {
  assert.equal(parseAdminIdentity({ identity: { status: "ACTIVE", roles: ["CUSTOMER", "ADMIN"] } })?.adminEnabled, false);
});

test("a scoped operations role opens the workspace", () => {
  assert.equal(parseAdminIdentity({ identity: { status: "ACTIVE", roles: ["OPERATIONS_ADMIN"] } })?.adminEnabled, true);
});
