import test from "node:test";
import assert from "node:assert/strict";
import { AcademyRequestError, academyProblem, academyReturnTo, parseRetryAfter, ACADEMY_MOTION } from "./academy-ux-state.ts";
test("session and permission failures never offer unsafe silent retries", () => {
  assert.equal(academyProblem(new AcademyRequestError(401)).kind, "session");
  assert.equal(academyProblem(new AcademyRequestError(403)).retryable, false);
  assert.equal(academyProblem(new AcademyRequestError(401), true).kind, "session");
});
test("offline, timeout, conflicts and unavailable responses have distinct recovery copy", () => {
  assert.equal(academyProblem(new Error(), true).kind, "offline");
  const timeout = new Error(); timeout.name = "AbortError";
  assert.equal(academyProblem(timeout).kind, "timeout");
  assert.equal(academyProblem(new AcademyRequestError(409)).retryable, false);
  assert.equal(academyProblem(new AcademyRequestError(404)).kind, "unavailable");
});
test("retry-after supports seconds and dates with bounded safe fallback", () => {
  assert.equal(parseRetryAfter("45"), 45);
  assert.equal(parseRetryAfter("Sun, 13 Sep 2026 10:00:30 GMT", Date.parse("2026-09-13T10:00:00Z")), 30);
  assert.equal(parseRetryAfter("bad"), 30);
  assert.equal(parseRetryAfter("999999999"), 86400);
  assert.equal(parseRetryAfter(null), 30);
  assert.equal(academyProblem(new AcademyRequestError(429, 45)).retryAfter, 45);
});
test("raw server messages are not disclosed in user-facing error panels", () => {
  const problem = academyProblem(new Error("database-password=secret SQL customer payload"));
  assert.equal(JSON.stringify(problem).includes("secret"), false);
});
test("return links preserve only validated Academy location, never arbitrary URLs", () => {
  assert.equal(academyReturnTo("?course=auth&lesson=auth-identity&returnTo=https://evil.test"), "/admin/academy?course=auth&lesson=auth-identity");
  assert.equal(academyReturnTo("?course=../secret&lesson=<script>"), "/admin/academy");
});
test("motion avoids long stagger cascades", () => {
  assert.ok(ACADEMY_MOTION.enterMs <= 300);
  assert.ok(ACADEMY_MOTION.maxStaggerMs <= 150);
});
