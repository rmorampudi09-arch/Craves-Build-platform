"use client";

import { signInWithCustomToken, type UserCredential } from "firebase/auth";
import { getFirebaseBrowserClient } from "@/lib/firebase-client";

export type PhoneConfirmation = {
  confirm: (code: string, currentAttempt?: () => boolean) => Promise<UserCredential>;
  resend?: () => Promise<void>;
};
type Callback = (value: unknown) => void;
type WidgetWindow = Window & {
  initSendOTP?: (config: Record<string, unknown>) => void;
  sendOtp?: (phone: string, success: Callback, failure: Callback) => void;
  verifyOtp?: (otp: string, success: Callback, failure: Callback, requestId?: string) => void;
  retryOtp?: (channel: null, success: Callback, failure: Callback, requestId?: string) => void;
  getWidgetData?: () => unknown;
  isCaptchaVerified?: () => boolean;
};
let scriptLoading: Promise<void> | undefined;
let activeAttempt = 0;
let captchaRoot: HTMLElement | null = null;
let captchaParking: HTMLElement | null = null;
let initializedConfig = "";

export function parkMsg91Captcha() {
  if (!captchaRoot) return;
  if (!captchaParking) {
    captchaParking = document.createElement("div");
    captchaParking.hidden = true;
    document.body.appendChild(captchaParking);
  }
  captchaParking.appendChild(captchaRoot);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function loadWidget(): Promise<void> {
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://verify.msg91.com/otp-provider.js";
    script.async = true;
    const timer = window.setTimeout(() => { script.remove(); reject(new Error("OTP_UNAVAILABLE")); }, 12000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("OTP_UNAVAILABLE")); };
    document.head.appendChild(script);
  }).catch(error => { scriptLoading = undefined; throw error; });
  return scriptLoading;
}

function invoke(call: (success: Callback, failure: Callback) => void, current: () => boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("OTP_TIMEOUT")), 30000);
    const finish = (success: boolean, result: unknown) => {
      clearTimeout(timer);
      if (!current()) { reject(new Error("OTP_CANCELLED")); return; }
      if (success && record(result).type !== "error") resolve(result);
      else reject(new Error("The verification could not be completed. Check the code or security check and try again."));
    };
    try { call(value => finish(true, value), error => finish(false, error)); }
    catch { finish(false, null); }
  });
}

/** Phone OTP is MSG91-only; an invalid deployment configuration must fail closed. */
export async function beginMsg91PhoneSignIn(phone: string, captchaRenderId: string,
  currentAttempt: () => boolean = () => true): Promise<PhoneConfirmation> {
  const response = await fetch("/api/auth/otp-config", { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("OTP_UNAVAILABLE");
  const config = record(await response.json());
  if (config.provider !== "msg91" || typeof config.widgetId !== "string" || typeof config.tokenAuth !== "string")
    throw new Error("OTP_UNAVAILABLE");
  if (!/^\+91[6-9]\d{9}$/.test(phone)) throw new Error("Enter a valid Indian mobile number.");
  await loadWidget();
  if (!currentAttempt()) throw new Error("OTP_CANCELLED");
  const attempt = ++activeAttempt;
  const current = () => attempt === activeAttempt && currentAttempt();
  const sdk = window as WidgetWindow;
  if (!sdk.initSendOTP) throw new Error("OTP_UNAVAILABLE");
  const container = document.getElementById(captchaRenderId);
  const configKey = `${config.widgetId}:${config.tokenAuth}`;
  if (!container) throw new Error("OTP_UNAVAILABLE");
  // The provider exposes non-configurable window methods bound to its first instance.
  // Keep that instance and its CAPTCHA alive across modal close/reopen and OTP stages.
  if (initializedConfig && initializedConfig !== configKey) throw new Error("Refresh the page to continue signing in.");
  if (!captchaRoot) {
    captchaRoot = document.createElement("div");
    captchaRoot.id = "craves-msg91-captcha";
  }
  container.appendChild(captchaRoot);
  if (!initializedConfig) {
    sdk.initSendOTP({
      widgetId: config.widgetId, tokenAuth: config.tokenAuth, exposeMethods: true, captchaRenderId: captchaRoot.id,
      // Required by the official SDK even when using explicit per-method callbacks.
      // Authentication is handled only by confirm() after server verification.
      success: () => {}, failure: () => {},
    });
    initializedConfig = configKey;
  }
  const deadline = Date.now() + 10000;
  while (!sdk.sendOtp || !sdk.verifyOtp || !sdk.retryOtp || !record(sdk.getWidgetData?.()).widgetId) {
    if (!current() || Date.now() > deadline) throw new Error("OTP_UNAVAILABLE");
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }
  const widget = record(sdk.getWidgetData?.());
  // MSG91 documents this switch as mobile-SDK-only; such widgets cannot send from a website.
  // Do not fall back silently or bypass the provider's security configuration.
  if (widget.mobileIntegration === true || Number(widget.mobileIntegration) === 1)
    throw new Error("OTP_WEB_UNAVAILABLE");
  if (widget.captchaValidations && Number(record(widget.widgetMeta).captcha_type) !== 2) {
    // With captchaRenderId, sendOtp does nothing until the user has solved the
    // visible challenge. Wait before sending; never bypass or solve it in code.
    const captchaDeadline = Date.now() + 120000;
    while (!sdk.isCaptchaVerified?.()) {
      if (!current()) throw new Error("OTP_CANCELLED");
      if (Date.now() > captchaDeadline) throw new Error("OTP_CAPTCHA_TIMEOUT");
      await new Promise(resolve => window.setTimeout(resolve, 100));
    }
  }
  const sent = record(await invoke((ok, fail) => sdk.sendOtp!(phone.slice(1), ok, fail), current));
  const requestId = typeof sent.message === "string" ? sent.message : undefined;
  if (!requestId) throw new Error("OTP_UNAVAILABLE");
  parkMsg91Captcha();
  return {
    async resend() { await invoke((ok, fail) => sdk.retryOtp!(null, ok, fail, requestId), () => attempt === activeAttempt); },
    async confirm(code, ownerCurrent = () => true) {
      const verifyCurrent = () => attempt === activeAttempt && ownerCurrent();
      if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit verification code.");
      // The owner checks stale attempts; verification never trusts the entered phone as identity.
      const result = record(await invoke((ok, fail) => sdk.verifyOtp!(code, ok, fail, requestId), verifyCurrent));
      const accessToken = result.message;
      if (typeof accessToken !== "string" || accessToken.length < 40 || accessToken.length > 20000)
        throw new Error("OTP_VERIFICATION_FAILED");
      const verified = await fetch("/api/auth/msg91/verify", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken }),
      });
      const body = record(await verified.json().catch(() => null));
      if (!verifyCurrent()) throw new Error("OTP_CANCELLED");
      if (!verified.ok || typeof body.firebaseCustomToken !== "string")
        throw new Error("The verification could not be completed. Please request a new code.");
      try {
        return await signInWithCustomToken(getFirebaseBrowserClient().auth, body.firebaseCustomToken);
      } catch {
        throw new Error("Your phone was verified, but sign-in could not finish. Please try again.");
      }
    },
  };
}
