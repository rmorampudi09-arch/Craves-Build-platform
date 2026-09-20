import assert from "node:assert/strict";
import test from "node:test";
import { adminSignInUrl } from "./admin-sign-in.ts";

test("sign-in exits the delivery app while preserving its return destination", () => {
  const target = new URL(adminSignInUrl("https://admin.craves.in"));
  assert.equal(target.origin, "https://admin.craves.in");
  assert.equal(target.pathname, "/sign-in");
  assert.equal(target.searchParams.get("returnTo"), "/delivery-intelligence");
});

test("existing paths and queries cannot replace the fixed sign-in destination", () => {
  const target = new URL(adminSignInUrl("http://localhost:4178/delivery-intelligence?returnTo=https://example.invalid"));
  assert.equal(target.origin, "http://localhost:4178");
  assert.equal(target.pathname, "/sign-in");
  assert.equal(target.searchParams.get("returnTo"), "/delivery-intelligence");
  assert.equal([...target.searchParams].length, 1);
});
