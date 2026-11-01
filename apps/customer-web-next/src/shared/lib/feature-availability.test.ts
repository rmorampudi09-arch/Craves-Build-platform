import assert from "node:assert/strict";
import test from "node:test";
import { FEATURE_NOT_AVAILABLE, isFeatureUnavailable, upstreamFailure } from "./feature-availability.ts";

test("only a 404 with the FEATURE_NOT_AVAILABLE code means Coming soon", () => {
  assert.equal(isFeatureUnavailable(404, { code: FEATURE_NOT_AVAILABLE }), true);
  assert.equal(isFeatureUnavailable(404, { code: "SUPPORT_CASE_NOT_FOUND" }), false);
  assert.equal(isFeatureUnavailable(503, { code: FEATURE_NOT_AVAILABLE }), false);
  assert.equal(isFeatureUnavailable(404, null), false);
  assert.equal(isFeatureUnavailable(404, "FEATURE_NOT_AVAILABLE"), false);
});

test("upstream failures keep real Craves codes and turn missing routes into Coming soon", () => {
  assert.deepEqual(upstreamFailure(404, { statusCode: 404, message: "Resource not found" }, "X_FAILED"), { status: 404, code: FEATURE_NOT_AVAILABLE });
  assert.deepEqual(upstreamFailure(405, null, "X_FAILED"), { status: 404, code: FEATURE_NOT_AVAILABLE });
  assert.deepEqual(upstreamFailure(404, { code: "SUPPORT_CASE_NOT_FOUND" }, "X_FAILED"), { status: 404, code: "SUPPORT_CASE_NOT_FOUND" });
  assert.deepEqual(upstreamFailure(401, { code: "TOKEN_EXPIRED" }, "X_FAILED"), { status: 401, code: "SESSION_EXPIRED" });
  assert.deepEqual(upstreamFailure(400, { code: "SUBJECT_TOO_LONG" }, "X_FAILED"), { status: 400, code: "SUBJECT_TOO_LONG" });
  assert.deepEqual(upstreamFailure(400, { code: "<script>" }, "X_FAILED"), { status: 400, code: "X_FAILED" });
  assert.deepEqual(upstreamFailure(500, { code: "INTERNAL" }, "X_FAILED"), { status: 503, code: "INTERNAL" });
  assert.deepEqual(upstreamFailure(502, "bad gateway", "X_FAILED"), { status: 503, code: "X_FAILED" });
});
