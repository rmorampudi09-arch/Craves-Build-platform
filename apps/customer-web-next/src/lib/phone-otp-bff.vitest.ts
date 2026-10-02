import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Request as RuntimeRequest } from "next/dist/compiled/@edge-runtime/primitives";
import { POST as send } from "../app/api/auth/otp/send/route";
import { POST as verify } from "../app/api/auth/otp/verify/route";

const challengeId = "synthetic_".padEnd(43, "_");
const phoneNumber = "9999999999";
const challenge = { challengeId, expiresAt: 1_800_000_000_000, resendAvailableAt: 1_799_999_760_000 };
const customToken = "synthetic-custom-token-not-valid-in-production".repeat(3);
const sendBody = { phoneNumber, countryCode: "91" };
const verifyBody = { challengeId, otp: "000123" };

function request(action: "send" | "verify", body: unknown, headers: Record<string, string> = {}) {
  return rawRequest(action, JSON.stringify(body), headers);
}
function rawRequest(action: "send" | "verify", body: string, headers: Record<string, string> = {}) {
  return new RuntimeRequest(`https://craves.example.test/api/auth/otp/${action}`, {
    method: "POST", headers: { Origin: "https://craves.example.test", "Content-Type": "application/json", ...headers }, body,
  }) as unknown as NextRequest;
}
function privateReply(response: Response) {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.has("set-cookie")).toBe(false);
}

beforeEach(() => {
  vi.stubEnv("CRAVES_CENTRAL_OTP_ENABLED", "true");
  vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.test/api/v1");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each(["", "false", "TRUE"])("keeps central OTP unavailable for disabled flag %s without upstream effects", async (flag) => {
  vi.stubEnv("CRAVES_CENTRAL_OTP_ENABLED", flag);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  for (const action of [send, verify]) {
    const response = await action(request("send", sendBody));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "OTP_UNAVAILABLE" }); privateReply(response);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  null, [], {}, { ...sendBody, phoneNumber: "+919999999999" }, { ...sendBody, phoneNumber: "5999999999" },
  { ...sendBody, phoneNumber: 9999999999 }, { ...sendBody, countryCode: 91 }, { ...sendBody, countryCode: "1" },
  { ...sendBody, challengeId: null }, { ...sendBody, challengeId: "short" },
])("rejects invalid send payload before an OTP can be issued: %j", async (body) => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const response = await send(request("send", body));
  expect(response.status).toBe(400); expect(await response.json()).toEqual({ code: "OTP_INVALID" });
  privateReply(response); expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  {}, { ...verifyBody, challengeId: "x".repeat(42) }, { ...verifyBody, challengeId: "!".repeat(43) },
  { ...verifyBody, otp: 123456 }, { ...verifyBody, otp: "12345" }, { ...verifyBody, otp: " 123456" },
])("rejects invalid challenge verification before upstream access: %j", async (body) => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const response = await verify(request("verify", body));
  expect(response.status).toBe(400); expect(await response.json()).toEqual({ code: "OTP_INVALID" });
  privateReply(response); expect(fetcher).not.toHaveBeenCalled();
});

it("applies same-origin, JSON and 1024-byte bounds without upstream side effects", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const rejected = [
    [request("send", sendBody, { Origin: "https://attacker.invalid" }), 403],
    [request("send", sendBody, { "Content-Type": "text/plain" }), 415],
    [request("send", { ...sendBody, padding: "x".repeat(1024) }), 413],
    [rawRequest("send", "{broken-json"), 400],
  ] as const;
  for (const [input, status] of rejected) {
    const response = await send(input); expect(response.status).toBe(status); privateReply(response);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([false, true])("sends only the recovered phone/challenge fields, including resend=%s", async (resend) => {
  const fetcher = vi.fn(async () => Response.json({ ...challenge, providerSecret: "never-publish" }, {
    headers: { "Set-Cookie": "upstream-session=never-publish" },
  }));
  vi.stubGlobal("fetch", fetcher);
  const payload = { ...sendBody, ...(resend ? { challengeId } : {}) };
  const response = await send(request("send", { ...payload, uid: "client-selected", provider: "firebase" }, {
    Cookie: "craves_access_token=synthetic-session", Authorization: "Bearer synthetic-session",
  }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual(challenge); privateReply(response);
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/auth/otp/send");
  expect(init.method).toBe("POST"); expect(init.cache).toBe("no-store"); expect(init.redirect).toBe("error");
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(init.headers).toEqual({ "Content-Type": "application/json", Accept: "application/json" });
  expect(JSON.parse(String(init.body))).toEqual(payload);
});

it("verifies the existing challenge and preserves leading-zero OTP without setting a session", async () => {
  const fetcher = vi.fn(async () => Response.json({ firebaseCustomToken: customToken, uid: "server-private" }));
  vi.stubGlobal("fetch", fetcher);
  const response = await verify(request("verify", { ...verifyBody, phoneNumber, uid: "client-selected" }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ firebaseCustomToken: customToken }); privateReply(response);
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/auth/otp/verify");
  expect(JSON.parse(String(init.body))).toEqual(verifyBody);
});

it.each([
  { ...challenge, challengeId: "short" }, { ...challenge, expiresAt: "1800000000000" },
  { ...challenge, expiresAt: Number.MAX_SAFE_INTEGER + 1 }, { ...challenge, resendAvailableAt: 1.5 },
  { ...challenge, resendAvailableAt: null }, null,
])("fails closed for malformed successful challenge responses: %j", async (body) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
  const response = await send(request("send", sendBody));
  expect(response.status).toBe(502); expect(await response.json()).toEqual({ code: "OTP_UNAVAILABLE" }); privateReply(response);
});

it.each([99, 20_001])("rejects successful custom tokens outside recovered length bounds: %s", async (length) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ firebaseCustomToken: "x".repeat(length) })));
  const response = await verify(request("verify", verifyBody));
  expect(response.status).toBe(502); expect(await response.json()).toEqual({ code: "OTP_UNAVAILABLE" }); privateReply(response);
});

it.each([
  "OTP_INVALID", "OTP_RESTART", "OTP_EXPIRED", "OTP_BUSY", "OTP_COOLDOWN", "OTP_RATE_LIMIT",
  "OTP_RESEND_LIMIT", "IDENTITY_INACTIVE", "PHONE_IDENTITY_MISMATCH",
])("preserves safe backend error %s without private diagnostics", async (code) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code, message: "private-phone-or-provider-detail", token: customToken }, { status: 429 })));
  const response = await verify(request("verify", verifyBody));
  expect(response.status).toBe(429); expect(await response.json()).toEqual({ code }); privateReply(response);
});

it("masks unknown upstream errors and discards upstream cookies", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "PROVIDER_PRIVATE", secret: "private-provider-detail" }, {
    status: 500, headers: { "Set-Cookie": "provider=private" },
  })));
  const response = await send(request("send", sendBody));
  expect(response.status).toBe(500); expect(await response.json()).toEqual({ code: "OTP_UNAVAILABLE" }); privateReply(response);
});

it("rejects malformed JSON, oversized upstream responses and transport failure safely", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
    .mockResolvedValueOnce(Response.json({ ...challenge, padding: "x".repeat(24_000) }))
    .mockRejectedValueOnce(new Error("private-upstream-location"));
  vi.stubGlobal("fetch", fetcher);
  for (const status of [502, 503, 503]) {
    const response = await send(request("send", sendBody));
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ code: "OTP_UNAVAILABLE" }); privateReply(response);
  }
});
