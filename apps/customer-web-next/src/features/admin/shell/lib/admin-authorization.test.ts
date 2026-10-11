import assert from "node:assert/strict";
import test from "node:test";
import { createAdminAuthorization, INITIAL_ADMIN_AUTHORIZATION, type AdminAuthorization } from "./admin-authorization.ts";
import type { AdminIdentity } from "./admin-contract.ts";

const admin: AdminIdentity = { displayName: "Test administrator", email: null, status: "ACTIVE", adminEnabled: true };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  let snapshot = INITIAL_ADMIN_AUTHORIZATION;
  let closes = 0;
  const published: AdminAuthorization[] = [];
  const requests: ReturnType<typeof deferred<AdminIdentity>>[] = [];
  const authorization = createAdminAuthorization({
    loadIdentity: () => { const request = deferred<AdminIdentity>(); requests.push(request); return request.promise; },
    publish: state => { snapshot = state; published.push(state); },
    closeDialogs: () => { closes++; },
  });
  const ready = async () => { const pending = authorization.accept("ready"); requests.at(-1)!.resolve(admin); await pending; };
  return { authorization, requests, published, ready, state: () => snapshot, closes: () => closes };
}

test("initial access remains hidden until live identity verification completes", async () => {
  const f = fixture();
  const pending = f.authorization.accept("ready");
  assert.equal(f.state().identity, null);
  assert.match(f.state().message, /Verifying/);
  f.requests[0].resolve(admin); await pending;
  assert.deepEqual(f.state(), { identity: admin, sessionState: "ready", message: "" });
});

test("healthy periodic and focus checks retain visible authorization and open dialogs", async () => {
  const f = fixture(); await f.ready();
  for (let i = 0; i < 3; i++) {
    const before = f.published.length;
    const pending = f.authorization.accept("ready");
    assert.equal(f.published.length, before, "a pending healthy recheck must not publish a hidden state");
    assert.equal(f.state().identity, admin);
    assert.equal(f.state().message, "");
    assert.equal(f.closes(), 0);
    f.requests.at(-1)!.resolve(admin); await pending;
  }
  assert.equal(f.requests.length, 4, "healthy checks still revalidate live administrator identity");
});

test("reconnect preserves mounted identity but keeps work hidden until identity is reverified", async () => {
  const f = fixture(); await f.ready();
  await f.authorization.accept("reconnecting");
  assert.equal(f.state().identity, admin);
  assert.equal(f.state().sessionState, "reconnecting");
  assert.equal(f.closes(), 1);
  const pending = f.authorization.accept("ready");
  assert.match(f.state().message, /Verifying/);
  f.requests.at(-1)!.resolve(admin); await pending;
  assert.equal(f.state().message, "");
});

test("failed background identity check clears stale access and closes dialogs", async () => {
  const f = fixture(); await f.ready();
  const pending = f.authorization.accept("ready");
  f.requests.at(-1)!.reject(new Error("Administrator access is unavailable.")); await pending;
  assert.equal(f.state().identity, null);
  assert.equal(f.closes(), 1);
  await f.ready();
  assert.equal(f.state().identity, admin);
});

for (const identity of [{ ...admin, adminEnabled: false }, { ...admin, status: "SUSPENDED" }]) {
  test(`identity cannot authorize admin=${identity.adminEnabled}, status=${identity.status}`, async () => {
    const f = fixture(); await f.ready();
    const pending = f.authorization.accept("ready");
    f.requests.at(-1)!.resolve(identity); await pending;
    assert.equal(f.state().identity, null);
    assert.match(f.state().message, /does not have administrator access/);
  });
}

test("latest identity result wins when concurrent checks resolve out of order", async () => {
  const f = fixture(); await f.ready();
  const old = f.authorization.accept("ready");
  const newer = f.authorization.accept("ready");
  f.requests[2].reject(new Error("Role revoked.")); await newer;
  f.requests[1].resolve(admin); await old;
  assert.equal(f.state().identity, null);
  assert.equal(f.state().message, "Role revoked.");
});

test("a pending identity success cannot reveal work after reconnect starts", async () => {
  const f = fixture(); await f.ready();
  const pending = f.authorization.accept("ready");
  await f.authorization.accept("reconnecting");
  f.requests.at(-1)!.resolve(admin); await pending;
  assert.equal(f.state().sessionState, "reconnecting");
  assert.notEqual(f.state().message, "");
});

test("session end cannot be undone by a pending success or later ready event", async () => {
  const f = fixture(); await f.ready();
  const pending = f.authorization.accept("ready");
  await f.authorization.accept("ended");
  f.requests.at(-1)!.resolve(admin); await pending;
  const requestCount = f.requests.length;
  await f.authorization.accept("ready");
  assert.equal(f.state().identity, null);
  assert.equal(f.state().sessionState, "ended");
  assert.equal(f.requests.length, requestCount);
});

test("unmount prevents late publication and further identity requests", async () => {
  const f = fixture();
  const pending = f.authorization.accept("ready");
  const publications = f.published.length;
  f.authorization.dispose();
  f.requests[0].resolve(admin); await pending;
  await f.authorization.accept("ready");
  assert.equal(f.published.length, publications);
  assert.equal(f.requests.length, 1);
});
