import assert from "node:assert/strict";
import test from "node:test";
import { ADVANCED_OPERATIONS, findAdvancedOperation } from "./advanced-operations.ts";

const LIST = "8f0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const DISH = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCde";
const GROUP = "2b3c4d5e-6f70-4a8b-9c0d-1e2f3a4b5c6d";

test("every food-list call the website makes is listed, with its sign-in rule", () => {
  assert.equal(findAdvancedOperation("GET", ["food-lists"])?.auth, "user");
  assert.equal(findAdvancedOperation("POST", ["food-lists"])?.body, "required");
  assert.equal(findAdvancedOperation("PATCH", ["food-lists", LIST])?.body, "required");
  assert.equal(findAdvancedOperation("PUT", ["food-lists", LIST, "items", DISH])?.body, "optional");
  assert.equal(findAdvancedOperation("DELETE", ["food-lists", LIST, "share"])?.body, "none");
  assert.equal(findAdvancedOperation("GET", ["shared-food-lists", TOKEN])?.auth, "public");
  assert.equal(findAdvancedOperation("POST", ["shared-food-lists", TOKEN, "copy"])?.auth, "user");
  assert.equal(ADVANCED_OPERATIONS.filter((operation) => operation.auth === "public").length, 1);
});

test("every group-order call is listed for signed-in people only, and checkout may take 30 s", () => {
  assert.equal(findAdvancedOperation("POST", ["group-orders", "join"])?.body, "required");
  assert.equal(findAdvancedOperation("GET", ["group-orders", GROUP])?.auth, "user");
  assert.equal(findAdvancedOperation("PUT", ["group-orders", GROUP, "my-items", DISH])?.body, "required");
  assert.equal(findAdvancedOperation("DELETE", ["group-orders", GROUP, "participants", LIST])?.body, "none");
  assert.equal(findAdvancedOperation("POST", ["group-orders", GROUP, "leave"])?.body, "none");
  assert.equal(findAdvancedOperation("POST", ["group-orders", GROUP, "unlock"])?.body, "required");
  assert.equal(findAdvancedOperation("POST", ["group-orders", GROUP, "checkout"])?.timeoutMs, 30_000);
  assert.equal(findAdvancedOperation("GET", ["group-orders", GROUP])?.timeoutMs, undefined);
  assert.ok(ADVANCED_OPERATIONS.filter((operation) => operation.pattern[0] === "group-orders").every((operation) => operation.auth === "user"));
});

test("anything else is refused: other methods, other paths, reordering, odd segments", () => {
  assert.equal(findAdvancedOperation("POST", ["shared-food-lists", TOKEN]), null);
  assert.equal(findAdvancedOperation("PUT", ["food-lists", LIST, "items-order"]), null);
  assert.equal(findAdvancedOperation("GET", ["taste-memory"]), null);
  assert.equal(findAdvancedOperation("PUT", ["group-orders", GROUP, "items-order"]), null);
  assert.equal(findAdvancedOperation("GET", ["group-orders", "join"]), null);
  assert.equal(findAdvancedOperation("GET", ["food-lists", "..", "admin"]), null);
  assert.equal(findAdvancedOperation("GET", ["food-lists", "a b"]), null);
  assert.equal(findAdvancedOperation("GET", ["food-lists", "items"]), null);
  assert.equal(findAdvancedOperation("PUT", ["food-lists", LIST, "items", "not-a-dish"]), null);
  assert.equal(findAdvancedOperation("GET", ["shared-food-lists", "short-token"]), null);
  assert.equal(findAdvancedOperation("GET", []), null);
  assert.equal(findAdvancedOperation("HEAD", ["food-lists"]), null);
});
