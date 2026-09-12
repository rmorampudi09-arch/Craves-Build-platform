import assert from "node:assert/strict";
import test from "node:test";
import { academyRoute } from "./academy-route-policy.ts";
const route = (method: string, path: string, query = "") => academyRoute(method, path.split("/"), new URLSearchParams(query));
test("academy permits only the declared read routes", () => {
  for (const p of ["catalog", "me", "plans", "analytics", "sources/auth/0"]) assert.equal(route("GET", p), p);
});
test("academy rejects traversal, encoding and open-proxy paths", () => {
  for (const p of ["", "../auth/me", "sources/../0", "sources/auth/10", "sources/auth/%30", "auth/me", "https://evil.test", "sources//0", "sources/Auth/0"])
    assert.equal(route("GET", p), null, p);
});
test("academy method allowlist prevents endpoint confusion", () => {
  assert.equal(route("POST", "attempts"), "attempts");
  assert.equal(route("POST", "events"), "events");
  assert.equal(route("PUT", "preferences"), "preferences");
  assert.equal(route("PUT", "plans"), "plans");
  for (const method of ["GET", "PUT", "DELETE", "PATCH", "HEAD"]) assert.equal(route(method, "attempts"), null);
});
test("query parameters are bounded and cannot be duplicated", () => {
  assert.equal(route("GET", "analytics", "page=10000"), "analytics?page=10000");
  for (const q of ["page=10001", "page=-1", "page=1&page=2", "identityId=someone", "page=x", "page=1&foo=2"])
    assert.equal(route("GET", "analytics", q), null);
  assert.equal(route("GET", "catalog", "page=1"), null);
});
test("plan deletion requires an exact UUID and positive revision", () => {
  const p = "plans/11111111-2222-3333-4444-555555555555";
  assert.equal(route("DELETE", p, "revision=1"), p+"?revision=1");
  for(const q of ["", "revision=0", "revision=-1", "revision=2&revision=3", "version=1"]) assert.equal(route("DELETE", p, q), null);
  assert.equal(route("DELETE", "plans/not-a-uuid", "revision=1"), null);
});
