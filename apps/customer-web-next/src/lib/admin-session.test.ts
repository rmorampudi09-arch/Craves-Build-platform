import assert from "node:assert/strict";
import test from "node:test";
import { AdminSessionError, loadAdminIdentity } from "./admin-session.ts";

const admin = {
  displayName: "Operations Admin",
  email: "admin@example.com",
  status: "ACTIVE",
  adminEnabled: true,
};

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("loads a currently authorized administrator", async () => {
  const calls: string[] = [];
  const identity = await loadAdminIdentity(async input => {
    calls.push(String(input));
    return response(200, admin);
  });

  assert.deepEqual(identity, admin);
  assert.deepEqual(calls, ["/api/admin/me"]);
});

test("refreshes an expired access token and retries the admin gate", async () => {
  const calls: string[] = [];
  const identity = await loadAdminIdentity(async input => {
    const url = String(input);
    calls.push(url);
    if (calls.length === 1) return response(401, { code: "SESSION_EXPIRED" });
    if (url === "/api/auth/refresh") return response(200, { identity: admin });
    return response(200, admin);
  });

  assert.deepEqual(identity, admin);
  assert.deepEqual(calls, ["/api/admin/me", "/api/auth/refresh", "/api/admin/me"]);
});

test("reports a signed-out session after refresh is rejected", async () => {
  await assert.rejects(
    loadAdminIdentity(async input => response(String(input) === "/api/auth/refresh" ? 401 : 401, { code: "SESSION_EXPIRED" })),
    (error: unknown) => error instanceof AdminSessionError && error.status === 401,
  );
});

test("rejects a successful but non-admin identity response", async () => {
  await assert.rejects(
    loadAdminIdentity(async () => response(200, { ...admin, adminEnabled: false })),
    (error: unknown) => error instanceof AdminSessionError && error.status === 403,
  );
});
