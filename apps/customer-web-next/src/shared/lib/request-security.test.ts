import assert from "node:assert/strict";
import test from "node:test";
import { isRequestOriginAllowed, socketPeerKey } from "./request-security.ts";
import type { NextRequest } from "next/server";

const peer = (headers: Record<string, string>) => socketPeerKey({ headers: new Headers(headers) } as unknown as NextRequest);

test("keys a visitor on the socket address only: IPv4 as is, IPv6 by /64, nothing else", () => {
  assert.equal(peer({ "x-azure-socketip": " 203.0.113.9 " }), "203.0.113.9");
  assert.equal(peer({ "x-azure-socketip": "2001:db8::1" }), "2001:0db8:0000:0000::/64");
  assert.equal(peer({ "x-azure-socketip": "2001:DB8:0:0:ffff:ffff:ffff:fffe" }), "2001:0db8:0000:0000::/64");
  assert.equal(peer({ "x-azure-socketip": "2001:db8:0:1::1" }), "2001:0db8:0000:0001::/64");
  assert.equal(peer({ "x-azure-socketip": "::ffff:203.0.113.9" }), "203.0.113.9");
  assert.equal(peer({ "x-azure-socketip": "evil.example" }), null);
  assert.equal(peer({ "x-forwarded-for": "203.0.113.9", "x-azure-clientip": "203.0.113.9" }), null);
  assert.equal(peer({}), null);
});

const publicOrigin =
  "https://ca-craves-web-prodlow.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io";

test("accepts a direct same-origin request", () => {
  assert.equal(
    isRequestOriginAllowed({
      origin: "http://localhost:3000",
      requestUrl: "http://localhost:3000/api/auth/session",
    }),
    true,
  );
});

test("accepts the Azure Container Apps public origin behind its internal proxy", () => {
  assert.equal(
    isRequestOriginAllowed({
      origin: publicOrigin,
      requestUrl: "http://localhost:3000/api/auth/session",
      forwardedProto: "https",
      forwardedHost: "ca-craves-web-prodlow.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io",
      host: "localhost:3000",
    }),
    true,
  );
});

test("uses the public Host header when Azure forwards only the protocol", () => {
  assert.equal(
    isRequestOriginAllowed({
      origin: publicOrigin,
      requestUrl: "http://localhost:3000/api/auth/session",
      forwardedProto: "https",
      host: "ca-craves-web-prodlow.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io",
    }),
    true,
  );
});

test("uses the value added by the closest trusted proxy", () => {
  assert.equal(
    isRequestOriginAllowed({
      origin: publicOrigin,
      requestUrl: "http://localhost:3000/api/auth/session",
      forwardedProto: "http, https",
      forwardedHost:
        "attacker.example, ca-craves-web-prodlow.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io",
    }),
    true,
  );
});

test("rejects a cross-origin request", () => {
  assert.equal(
    isRequestOriginAllowed({
      origin: "https://attacker.example",
      requestUrl: "http://localhost:3000/api/auth/session",
      forwardedProto: "https",
      forwardedHost: "ca-craves-web-prodlow.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io",
    }),
    false,
  );
});

test("rejects missing or malformed origins", () => {
  assert.equal(
    isRequestOriginAllowed({
      origin: null,
      requestUrl: "http://localhost:3000/api/auth/session",
    }),
    false,
  );
  assert.equal(
    isRequestOriginAllowed({
      origin: "https://attacker.example/path",
      requestUrl: "http://localhost:3000/api/auth/session",
      forwardedProto: "https",
      forwardedHost: "attacker.example",
    }),
    false,
  );
});
