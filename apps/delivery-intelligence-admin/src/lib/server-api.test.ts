import assert from "node:assert/strict";
import test from "node:test";
import { safeReference } from "./server-api.ts";

void test("safeReference accepts order/provider references and rejects header injection", () => {
  assert.equal(safeReference("ecebf6fe-0c1b-4e7a-b84e-58fbce2f5aea"), "ecebf6fe-0c1b-4e7a-b84e-58fbce2f5aea");
  assert.equal(safeReference("BZ-9481021"), "BZ-9481021");
  assert.equal(safeReference("bad%0Aheader"), null);
  assert.equal(safeReference("x".repeat(201)), null);
  assert.equal(safeReference("bad%ZZ"), null);
});
