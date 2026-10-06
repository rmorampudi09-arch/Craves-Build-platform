// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signin: vi.fn() }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: mocks.signin }));
vi.mock("./firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: "firebase-auth" }) }));
const phone = "+919876543210";
const customToken = "synthetic-custom-token".repeat(6);
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function challenge(id = "a".repeat(43), cooldown = 30000) {
  return { challengeId: id, expiresAt: Date.now() + 300000, resendAvailableAt: Date.now() + cooldown };
}
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
async function helper() { return import("./msg91-browser"); }
async function begin(current = () => true) { return (await helper()).beginMsg91PhoneSignIn(phone, "unused-captcha", current); }
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T00:00:00Z"));
  mocks.signin.mockReset().mockResolvedValue({ user: { uid: "existing-uid" } });
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  fetcher = vi.fn<typeof fetch>(async input => String(input).endsWith("/send")
    ? Response.json(challenge()) : Response.json({ firebaseCustomToken: customToken }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("pairs server send/verify payloads with the existing custom-token exchange without a widget or fallback", async () => {
  const confirmation = await begin();
  expect(confirmation).not.toBeNull();
  await confirmation!.confirm("123456");
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/auth/otp/send", "/api/auth/otp/verify"]);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ phoneNumber: "9876543210", countryCode: "91" });
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ challengeId: "a".repeat(43), otp: "123456" });
  for (const [, options] of fetcher.mock.calls) {
    expect(options).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" } });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  }
  expect(mocks.signin).toHaveBeenCalledWith("firebase-auth", customToken);
  expect(document.querySelector("script")).toBeNull();
  expect(document.querySelector("#craves-msg91-captcha")).toBeNull();
});

it.each(["+119876543210", "9876543210", "+911234567890", "+91987654321", "+9198765432100"])("rejects an unsupported phone %s before requesting a code", async invalid => {
  await expect((await helper()).beginMsg91PhoneSignIn(invalid, "unused")).rejects.toThrow("OTP_INVALID");
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["short-id", "unsafe-id", "expired", "text-expiry", "unsafe-expiry", "text-cooldown"])("rejects a %s challenge without an identity exchange", async state => {
  const body: Record<string, unknown> = challenge();
  if (state === "short-id") body.challengeId = "short";
  if (state === "unsafe-id") body.challengeId = "/".repeat(43);
  if (state === "expired") body.expiresAt = Date.now();
  if (state === "text-expiry") body.expiresAt = String(body.expiresAt);
  if (state === "unsafe-expiry") body.expiresAt = Number.MAX_SAFE_INTEGER + 1;
  if (state === "text-cooldown") body.resendAvailableAt = String(body.resendAvailableAt);
  fetcher.mockResolvedValue(Response.json(body));
  await expect(begin()).rejects.toThrow("OTP_UNAVAILABLE");
  expect(mocks.signin).not.toHaveBeenCalled();
});

it.each([404, 503])("keeps a failed server send %s private and never uses the widget", async status => {
  fetcher.mockResolvedValue(Response.json({ code: "PRIVATE_PROVIDER_FAILURE", message: `${phone} private provider token` }, { status }));
  await expect(begin()).rejects.toThrow("OTP_UNAVAILABLE");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(mocks.signin).not.toHaveBeenCalled();
});

it("sanitizes network and malformed response failures", async () => {
  fetcher.mockRejectedValue(new Error(`${phone} private provider token`));
  await expect(begin()).rejects.toThrow("OTP_UNAVAILABLE");
  vi.setSystemTime(Date.now() + 31000);
  fetcher.mockResolvedValue(new Response("not json"));
  await expect(begin()).rejects.toThrow("OTP_UNAVAILABLE");
});

it.each(["OTP_RATE_LIMIT", "OTP_COOLDOWN", "OTP_RESEND_LIMIT"])("preserves only the reviewed %s response code", async code => {
  fetcher.mockResolvedValue(Response.json({ code, message: `${phone} private provider token` }, { status: 429 }));
  await expect(begin()).rejects.toThrow(code);
});

it("does not send for an already cancelled owner", async () => {
  await expect(begin(() => false)).rejects.toThrow("OTP_CANCELLED");
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["owner", "close"])("rejects a late initial send after %s cancellation", async mode => {
  const late = deferred<Response>(); let current = true;
  fetcher.mockReturnValue(late.promise);
  const started = begin(() => current);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  if (mode === "owner") current = false; else (await helper()).parkMsg91Captcha();
  late.resolve(Response.json(challenge()));
  await expect(started).rejects.toThrow("OTP_CANCELLED");
  expect(mocks.signin).not.toHaveBeenCalled();
});

it("serializes concurrent sends and invalidates an old confirmation when another attempt starts", async () => {
  const late = deferred<Response>(); fetcher.mockReturnValueOnce(late.promise);
  const started = begin();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  await expect((await helper()).beginMsg91PhoneSignIn("+918765432109", "unused")).rejects.toThrow("OTP_BUSY");
  late.resolve(Response.json(challenge()));
  const old = await started;
  await (await helper()).beginMsg91PhoneSignIn("+918765432109", "unused");
  await expect(old!.confirm("123456")).rejects.toThrow("OTP_CANCELLED");
  await expect(old!.resend!()).rejects.toThrow("OTP_CANCELLED");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("honors server cooldown and resends with the prior challenge while accepting a changed owner counter", async () => {
  let initialOwner = true;
  fetcher.mockResolvedValueOnce(Response.json(challenge("a".repeat(43), 60000)));
  const confirmation = await begin(() => initialOwner);
  initialOwner = false;
  vi.setSystemTime(Date.now() + 31000);
  await expect(confirmation!.resend!()).rejects.toThrow("OTP_COOLDOWN");
  expect(fetcher).toHaveBeenCalledOnce();
  vi.setSystemTime(Date.now() + 30000);
  fetcher.mockResolvedValueOnce(Response.json(challenge("b".repeat(43))));
  await confirmation!.resend!();
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ phoneNumber: "9876543210", countryCode: "91", challengeId: "a".repeat(43) });
  await confirmation!.confirm("123456", () => true);
  expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ challengeId: "b".repeat(43), otp: "123456" });
  expect(mocks.signin).toHaveBeenCalledOnce();
});

it("retains the local request cooldown even if a response permits immediate resend", async () => {
  fetcher.mockResolvedValueOnce(Response.json(challenge("a".repeat(43), 0)));
  const confirmation = await begin();
  await expect(confirmation!.resend!()).rejects.toThrow("OTP_COOLDOWN");
  expect(fetcher).toHaveBeenCalledOnce();
});

it("does not revive a challenge when a pending resend finishes after the form closes", async () => {
  const confirmation = await begin(); const late = deferred<Response>();
  vi.setSystemTime(Date.now() + 31000);
  fetcher.mockReturnValueOnce(late.promise);
  const pending = confirmation!.resend!();
  (await helper()).parkMsg91Captcha();
  late.resolve(Response.json(challenge("b".repeat(43))));
  await expect(pending).rejects.toThrow("OTP_CANCELLED");
  await expect(confirmation!.confirm("123456")).rejects.toThrow("OTP_CANCELLED");
  expect(mocks.signin).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("limits resends and invalidates a confirmation after an uncertain resend", async () => {
  const confirmation = await begin();
  for (let index = 0; index < 2; index += 1) {
    vi.setSystemTime(Date.now() + 31000);
    await confirmation!.resend!();
  }
  vi.setSystemTime(Date.now() + 31000);
  await expect(confirmation!.resend!()).rejects.toThrow("OTP_RESEND_LIMIT");
  expect(fetcher).toHaveBeenCalledTimes(3);
  (await helper()).parkMsg91Captcha();
  vi.setSystemTime(Date.now() + 31000);
  const next = await begin();
  vi.setSystemTime(Date.now() + 31000);
  fetcher.mockResolvedValueOnce(Response.json({ code: "PRIVATE_PROVIDER_FAILURE" }, { status: 503 }));
  await expect(next!.resend!()).rejects.toThrow("OTP_UNAVAILABLE");
  await expect(next!.confirm("123456")).rejects.toThrow("OTP_RESTART");
});

it("does not verify an expired challenge or malformed code", async () => {
  const confirmation = await begin();
  await expect(confirmation!.confirm("12345")).rejects.toThrow("OTP_INVALID");
  vi.setSystemTime(Date.now() + 300000);
  await expect(confirmation!.confirm("123456")).rejects.toThrow("OTP_RESTART");
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each([null, "short", "x".repeat(20001)])("rejects an invalid custom token before calling Firebase", async token => {
  const confirmation = await begin();
  fetcher.mockResolvedValueOnce(Response.json({ firebaseCustomToken: token }));
  await expect(confirmation!.confirm("123456")).rejects.toThrow("OTP_RESTART");
  expect(mocks.signin).not.toHaveBeenCalled();
});

it("allows a corrected OTP after OTP_INVALID but prevents replay after verification succeeds", async () => {
  const confirmation = await begin();
  fetcher.mockResolvedValueOnce(Response.json({ code: "OTP_INVALID", message: `${phone} private provider token` }, { status: 400 }));
  await expect(confirmation!.confirm("654321")).rejects.toThrow("OTP_INVALID");
  await confirmation!.confirm("123456");
  await expect(confirmation!.confirm("123456")).rejects.toThrow("OTP_RESTART");
  expect(mocks.signin).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it.each(["owner", "close"])("does not invoke an identity exchange after a pending verify is cancelled by %s", async mode => {
  const confirmation = await begin(); const late = deferred<Response>(); let current = true;
  fetcher.mockReturnValueOnce(late.promise);
  const pending = confirmation!.confirm("123456", () => current);
  if (mode === "owner") current = false; else (await helper()).parkMsg91Captcha();
  late.resolve(Response.json({ firebaseCustomToken: customToken }));
  await expect(pending).rejects.toThrow("OTP_CANCELLED");
  expect(mocks.signin).not.toHaveBeenCalled();
});

it("does not return delayed credentials after owner cancellation and never reveals exchange errors", async () => {
  const confirmation = await begin(); const late = deferred<{ user: { uid: string } }>(); let current = true;
  mocks.signin.mockReturnValueOnce(late.promise);
  const pending = confirmation!.confirm("123456", () => current);
  await vi.waitFor(() => expect(mocks.signin).toHaveBeenCalledOnce());
  current = false; late.resolve({ user: { uid: "existing-uid" } });
  await expect(pending).rejects.toThrow("OTP_CANCELLED");
  vi.setSystemTime(Date.now() + 31000);
  const next = await begin();
  mocks.signin.mockRejectedValueOnce(new Error(`${phone} private provider token`));
  await expect(next!.confirm("123456")).rejects.toThrow("OTP_UNAVAILABLE");
});

it("exposes exactly the deadline used by resend and updates it after a replacement challenge", async () => {
  fetcher.mockResolvedValueOnce(Response.json(challenge("a".repeat(43), 30675)));
  const confirmation = await begin();
  const first = confirmation!.resendAvailableAt!;
  expect(first).toBe(Date.now() + 30675);
  vi.setSystemTime(first - 1);
  await expect(confirmation!.resend!()).rejects.toThrow("OTP_COOLDOWN");
  expect(fetcher).toHaveBeenCalledOnce();
  vi.setSystemTime(first);
  fetcher.mockResolvedValueOnce(Response.json(challenge("b".repeat(43), 45000)));
  await confirmation!.resend!();
  expect(confirmation!.resendAvailableAt).toBe(Date.now() + 45000);
});
it("includes the local cooldown in the exposed deadline when the server permits an earlier resend", async () => {
  fetcher.mockResolvedValueOnce(Response.json(challenge("a".repeat(43), 0)));
  const confirmation = await begin();
  expect(confirmation!.resendAvailableAt).toBe(Date.now() + 30000);
});
