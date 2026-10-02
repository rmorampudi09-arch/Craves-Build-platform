// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signin: vi.fn() }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: mocks.signin }));
vi.mock("./firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: "firebase-auth" }) }));
type Callback = (value: unknown) => void;
const sdk = window as unknown as Record<string, unknown>;
const accessToken = "synthetic-provider-token".repeat(5);

beforeEach(() => {
  vi.resetModules(); mocks.signin.mockReset().mockResolvedValue({ user: { uid: "existing-uid" } });
  document.body.innerHTML = '<div id="captcha"></div>';
  document.head.innerHTML = "";
  sdk.initSendOTP = vi.fn((config: Record<string, unknown>) => {
    if (typeof config.success !== "function" || typeof config.failure !== "function")
      throw new Error("Official SDK initialization callbacks are required");
  });
  sdk.getWidgetData = vi.fn(() => ({ widgetId: "widget", captchaValidations: true, widgetMeta: { captcha_type: 1 } }));
  sdk.isCaptchaVerified = vi.fn(() => true);
  sdk.sendOtp = vi.fn((_phone: string, ok: Callback) => ok({ type: "success", message: "request-id" }));
  sdk.retryOtp = vi.fn((_channel: null, ok: Callback) => ok({ type: "success" }));
  sdk.verifyOtp = vi.fn((_code: string, ok: Callback) => ok({ type: "success", message: accessToken }));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("otp-config")
    ? Response.json({ provider: "msg91", widgetId: "widget", tokenAuth: "scoped-token" })
    : Response.json({ firebaseCustomToken: "custom-token" })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function begin() {
  const { beginMsg91PhoneSignIn } = await import("./msg91-browser");
  const result = beginMsg91PhoneSignIn("+919876543210", "captcha");
  await vi.waitFor(() => expect(document.querySelector("script")).not.toBeNull());
  document.querySelector("script")!.dispatchEvent(new Event("load"));
  return result;
}
it.each(["firebase", "unknown", undefined])("rejects provider %s without loading another OTP provider", async provider => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ provider }));
  const { beginMsg91PhoneSignIn } = await import("./msg91-browser");
  await expect(beginMsg91PhoneSignIn("+919876543210", "captcha")).rejects.toThrow("OTP_UNAVAILABLE");
  expect(document.querySelector("script")).toBeNull();
  expect(sdk.sendOtp).not.toHaveBeenCalled();
  expect(mocks.signin).not.toHaveBeenCalled();
});
it.each([1, "1", true])("rejects a mobile-only widget (%s) before sending an OTP", async mobileIntegration => {
  sdk.getWidgetData = () => ({ widgetId: "widget", mobileIntegration, captchaValidations: false });
  await expect(begin()).rejects.toThrow("OTP_WEB_UNAVAILABLE");
  expect(sdk.sendOtp).not.toHaveBeenCalled();
  expect(mocks.signin).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("supports a web widget without a CAPTCHA and leaves security decisions with MSG91", async () => {
  sdk.getWidgetData = () => ({ widgetId: "widget", mobileIntegration: 0, captchaValidations: false });
  sdk.isCaptchaVerified = () => false;
  expect(await begin()).not.toBeNull();
  expect(sdk.sendOtp).toHaveBeenCalledOnce();
});
it("uses the captured request ID for verification and preserves Firebase sign-in", async () => {
  const confirmation = await begin();
  expect(confirmation).not.toBeNull();
  await confirmation!.resend!();
  await confirmation!.confirm("123456");
  expect(sdk.verifyOtp).toHaveBeenCalledWith("123456", expect.any(Function), expect.any(Function), "request-id");
  expect(sdk.retryOtp).toHaveBeenCalledWith(null, expect.any(Function), expect.any(Function), "request-id");
  expect(mocks.signin).toHaveBeenCalledWith("firebase-auth", "custom-token");
  const calls = vi.mocked(fetch).mock.calls;
  expect(JSON.parse(String(calls[1][1]?.body))).toEqual({ accessToken });
});
it("rejects non-token verify responses before contacting the bridge", async () => {
  const confirmation = await begin();
  sdk.verifyOtp = (_code: string, ok: Callback) => ok({ type: "success", message: "unverified" });
  await expect(confirmation!.confirm("123456")).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(mocks.signin).not.toHaveBeenCalled();
});
it("shows a useful session error without exposing Firebase implementation details", async () => {
  mocks.signin.mockRejectedValueOnce(new Error("Firebase: Error (auth/internal-error)."));
  const confirmation = await begin();
  await expect(confirmation.confirm("123456")).rejects.toThrow(
    "Your phone was verified, but sign-in could not finish. Please try again.",
  );
});
it("does not install a Firebase identity after its owner cancels the attempt", async () => {
  const confirmation = await begin();
  await expect(confirmation!.confirm("123456", () => false)).rejects.toThrow("OTP_CANCELLED");
  expect(mocks.signin).not.toHaveBeenCalled();
});
it("waits for widget configuration and the user's CAPTCHA before sending an OTP", async () => {
  let loaded = false;
  let verified = false;
  sdk.getWidgetData = () => loaded ? { widgetId: "widget", captchaValidations: true, widgetMeta: { captcha_type: 1 } } : null;
  sdk.isCaptchaVerified = () => verified;
  const started = begin();
  await vi.waitFor(() => expect(sdk.initSendOTP).toHaveBeenCalledOnce());
  expect(sdk.sendOtp).not.toHaveBeenCalled();
  loaded = true;
  await new Promise(resolve => setTimeout(resolve, 150));
  expect(sdk.sendOtp).not.toHaveBeenCalled();
  verified = true;
  await started;
  expect(sdk.sendOtp).toHaveBeenCalledOnce();
});
