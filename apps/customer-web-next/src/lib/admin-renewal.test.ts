import assert from "node:assert/strict";
import test from "node:test";
import { createAdminRenewal, RenewalError, type SessionState } from "./admin-renewal.ts";
import { refreshFailure } from "./refresh-policy.ts";

function fixture() {
  let now = 1_800_000_000_000;
  const started = now;
  let accessEnd = now + 900_000;
  let refreshStatus = 200;
  let requests = 0;
  let refreshes = 0;
  let reads = 0;
  let apiStatus = 200;
  const states: SessionState[] = [];
  const paths: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const path = String(input); paths.push(path);
    if (path === "/api/auth/admin-session") {
      reads++;
      return now < accessEnd ? Response.json({ timing: { accessExpiresAt: accessEnd, sessionExpiresAt: started + 28_800_000 } }) : Response.json({}, { status: 401 });
    }
    if (path === "/api/auth/refresh") {
      refreshes++;
      if (now >= started + 28_800_000) return Response.json({}, { status: 401 });
      if (refreshStatus !== 200) return Response.json({}, { status: refreshStatus, headers: { "retry-after": "5" } });
      accessEnd = Math.min(now + 900_000, started + 28_800_000);
      return Response.json({});
    }
    if (path === "/api/auth/logout") return Response.json({ signedOut: true });
    requests++;
    return Response.json({ saved: true }, { status: apiStatus });
  };
  const client = createAdminRenewal({ fetcher, now: () => now, lock: work => work(), notify: state => states.push(state) });
  return { client, fetcher, states, paths, advance: (ms: number) => { now += ms; },
    failRefresh: (status: number) => { refreshStatus = status; }, apiStatus: (status: number) => { apiStatus = status; },
    counts: () => ({ requests, refreshes, reads }) };
}

test("active admin renews before 15 minutes without extending the original eight-hour deadline", async () => {
  const f = fixture(); await f.client.ensure();
  f.advance(840_000); await f.client.ensure();
  assert.equal(f.counts().refreshes, 1);
  f.advance(28_800_000 - 840_000 - 1000); await f.client.ensure();
  assert.equal(f.counts().refreshes, 2);
  f.advance(1000); await assert.rejects(f.client.ensure(), (error: unknown) => error instanceof RenewalError && error.status === 401);
  assert.equal(f.states.at(-1), "ended");
  f.advance(1000); await assert.rejects(f.client.ensure(), /sign-in/);
});

test("40 concurrent reads produce a single renewal and all complete", async () => {
  const f = fixture(); f.advance(901_000);
  const results = await Promise.all(Array.from({ length: 40 }, () => f.client.request("/api/admin/test")));
  assert.ok(results.every(r => r.status === 200));
  assert.equal(f.counts().refreshes, 1);
});

test("tabs sharing a lock recheck shared cookies and do not rotate the same token twice", async () => {
  const f = fixture(); f.advance(901_000);
  let tail = Promise.resolve();
  const lock = <T>(work: () => Promise<T>): Promise<T> => { const result = tail.then(work); tail = result.then(() => undefined, () => undefined); return result; };
  const tabs = Array.from({ length: 8 }, () => createAdminRenewal({ fetcher: f.fetcher, now: () => 1_800_000_901_000, lock, notify: () => undefined }));
  await Promise.all(tabs.map(tab => tab.ensure()));
  assert.equal(f.counts().refreshes, 1);
});

for (const status of [429, 500, 502, 503, 504]) test(`refresh ${status} preserves the session and recovers`, async () => {
  const f = fixture(); f.advance(901_000); f.failRefresh(status);
  const failed = await f.client.request("/delivery-intelligence/api/delivery-intelligence/overview");
  assert.equal(failed.status, status); assert.ok(!f.states.includes("ended"));
  f.failRefresh(200); f.advance(6000);
  assert.equal((await f.client.request("/delivery-intelligence/api/delivery-intelligence/overview")).status, 200);
  assert.ok(f.paths.includes("/api/auth/refresh"));
  assert.ok(!f.paths.some(path => path.startsWith("/delivery-intelligence/api/auth")));
});

for (const status of [401, 403]) test(`definitive refresh ${status} ends the session`, async () => {
  const f = fixture(); f.advance(901_000); f.failRefresh(status);
  assert.equal((await f.client.request("/api/admin/test")).status, status);
  assert.equal(f.states.at(-1), "ended");
});

test("operation 403 never refreshes, and a mutation 401 is never automatically replayed", async () => {
  const f = fixture(); f.apiStatus(403);
  assert.equal((await f.client.request("/api/admin/test")).status, 403);
  assert.equal(f.counts().refreshes, 0);
  f.apiStatus(401);
  assert.equal((await f.client.request("/api/admin/test", { method: "POST", body: "unchanged quiz receipt" })).status, 409);
  assert.equal(f.counts().requests, 2);
});

test("a safe read retries once and a repeated 401 stops without a refresh loop", async () => {
  const f = fixture(); f.apiStatus(401);
  assert.equal((await f.client.request("/api/admin/test")).status, 401);
  assert.equal(f.counts().requests, 2);
  assert.equal(f.states.at(-1), "ended");
});

test("offline, timeout and malformed responses retain recoverable state", async () => {
  for (const mode of ["offline", "timeout", "malformed"]) {
    let fail = true; const states: SessionState[] = [];
    const client = createAdminRenewal({ now: () => 1000, lock: work => work(), notify: state => states.push(state), fetcher: async () => {
      if (fail && mode === "offline") throw new TypeError("offline");
      if (fail && mode === "timeout") throw new DOMException("timeout", "TimeoutError");
      if (fail) return new Response("invalid JSON");
      return Response.json({ timing: { accessExpiresAt: 100_000, sessionExpiresAt: 28_800_000 } });
    } });
    await assert.rejects(client.ensure()); assert.ok(!states.includes("ended"));
    fail = false; await client.ensure(); assert.equal(states.at(-1), "ready");
  }
});

test("logout while renewal is pending cannot restore ready state", async () => {
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
  let called!: () => void; const started = new Promise<void>(resolve => { called = resolve; });
  const states: SessionState[] = [];
  const client = createAdminRenewal({ now: () => 1000, lock: work => work(), notify: state => states.push(state), fetcher: async input => {
    if (String(input).endsWith("logout")) return Response.json({});
    called(); await waiting;
    return Response.json({ timing: { accessExpiresAt: 100_000, sessionExpiresAt: 28_800_000 } });
  } });
  const pending = client.ensure(); await started; await client.logout(); release();
  await assert.rejects(pending); assert.equal(states.at(-1), "ended");
});

test("BFF only clears cookies on definitive auth rejection", () => {
  for (const status of [429, 500, 502, 503, 504, 200, 400]) assert.equal(refreshFailure(status).terminal, false);
  for (const status of [401, 403]) assert.equal(refreshFailure(status).terminal, true);
  assert.equal(refreshFailure(429, "99999").retryAfter, "300");
});

test("client clock skew and clock jumps cannot independently expire a server-valid session", async () => {
  let clientNow = 99_000_000;
  const states: SessionState[] = [];
  const client = createAdminRenewal({ now: () => clientNow, lock: work => work(), notify: state => states.push(state), fetcher: async () =>
    Response.json({ timing: { serverTime: 1000, accessExpiresAt: 901000, sessionExpiresAt: 28_801_000 } }) });
  await client.ensure();
  clientNow += 40_000_000;
  await client.ensure();
  assert.ok(!states.includes("ended"));
  assert.equal(states.at(-1), "ready");
});
