import assert from "node:assert/strict";
import test from "node:test";
import { shortOrderNumber, supportCaseNumber } from "./order-number.ts";

test("order numbers are the first 8 characters of the id, like the app", () => {
  assert.equal(shortOrderNumber("0bde0000-0000-4000-8000-000000000101"), "0BDE0000");
  assert.equal(shortOrderNumber("ab-cd"), "ABCD");
});

test("support case numbers are the last 5 characters without dashes", () => {
  assert.equal(supportCaseNumber("CRV-0BDE00000000400080000000000a"), "0000A");
  assert.equal(supportCaseNumber("0bde0000-0000-4000-8000-0000000abc12"), "ABC12");
});
