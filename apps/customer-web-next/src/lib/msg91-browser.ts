"use client";

import { signInWithCustomToken, type UserCredential } from "firebase/auth";
import { getFirebaseBrowserClient } from "@/lib/firebase-client";

export type PhoneConfirmation = {
  confirm: (code: string, currentAttempt?: () => boolean) => Promise<UserCredential>;
  resend?: () => Promise<void>;
  /** The same server/local deadline enforced by resend; refreshed after each send. */
  readonly resendAvailableAt?: number;
};
type OtpChallenge = { challengeId: string; expiresAt: number; resendAvailableAt: number };
const RESPONSE_CODES = new Set(["OTP_INVALID", "OTP_RESTART", "OTP_EXPIRED", "OTP_BUSY", "OTP_COOLDOWN", "OTP_RATE_LIMIT", "OTP_RESEND_LIMIT"]);
let activeAttempt = 0;
let busy = false;
const cooldowns = new Map<string, number>();

/** Retained for existing callers; closing a form now invalidates its server challenge attempt. */
export function parkMsg91Captcha() { activeAttempt += 1; }

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeError(error: unknown): Error {
  return error instanceof Error && (RESPONSE_CODES.has(error.message) || error.message === "OTP_CANCELLED")
    ? new Error(error.message) : new Error("OTP_UNAVAILABLE");
}

async function request(action: "send" | "verify", payload: Record<string, string>): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`/api/auth/otp/${action}`, {
      method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const body = record(await response.json().catch(() => null));
    if (!response.ok || !Object.keys(body).length)
      throw new Error(typeof body.code === "string" && RESPONSE_CODES.has(body.code) ? body.code : "OTP_UNAVAILABLE");
    return body;
  } catch (error) { throw safeError(error); }
}

function parseChallenge(body: Record<string, unknown>): OtpChallenge {
  if (typeof body.challengeId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.challengeId) ||
      typeof body.expiresAt !== "number" || !Number.isSafeInteger(body.expiresAt) || body.expiresAt <= Date.now() ||
      typeof body.resendAvailableAt !== "number" || !Number.isSafeInteger(body.resendAvailableAt))
    throw new Error("OTP_UNAVAILABLE");
  return { challengeId: body.challengeId, expiresAt: body.expiresAt, resendAvailableAt: body.resendAvailableAt };
}

function checkCooldown(phone: string) {
  const now = Date.now();
  for (const [key, until] of cooldowns) if (until <= now) cooldowns.delete(key);
  if ((cooldowns.get(phone) ?? 0) > now) throw new Error("OTP_COOLDOWN");
  cooldowns.set(phone, now + 30000);
}

/** Uses the existing server OTP challenge contract; never selects a browser widget or phone-provider fallback. */
export async function beginMsg91PhoneSignIn(phone: string, _captchaRenderId: string,
  currentAttempt: () => boolean = () => true): Promise<PhoneConfirmation | null> {
  if (!/^\+91[6-9]\d{9}$/.test(phone)) throw new Error("OTP_INVALID");
  if (busy) throw new Error("OTP_BUSY");
  busy = true;
  const attempt = ++activeAttempt;
  const assertCurrent = () => { if (attempt !== activeAttempt) throw new Error("OTP_CANCELLED"); };
  let challenge: OtpChallenge;
  try {
    assertCurrent();
    if (!currentAttempt()) throw new Error("OTP_CANCELLED");
    checkCooldown(phone);
    const body = await request("send", { phoneNumber: phone.slice(3), countryCode: "91" });
    assertCurrent();
    if (!currentAttempt()) throw new Error("OTP_CANCELLED");
    challenge = parseChallenge(body);
  } finally { busy = false; }

  let completed = false;
  let resends = 0;
  const assertChallenge = () => {
    assertCurrent();
    if (completed || challenge.expiresAt <= Date.now()) throw new Error("OTP_RESTART");
    if (busy) throw new Error("OTP_BUSY");
  };
  return {
    get resendAvailableAt() { return Math.max(challenge.resendAvailableAt, cooldowns.get(phone) ?? 0); },
    async resend() {
      assertChallenge();
      if (resends >= 2) throw new Error("OTP_RESEND_LIMIT");
      if (challenge.resendAvailableAt > Date.now()) throw new Error("OTP_COOLDOWN");
      checkCooldown(phone);
      busy = true;
      resends += 1;
      try {
        challenge = parseChallenge(await request("send", { phoneNumber: phone.slice(3), countryCode: "91", challengeId: challenge.challengeId }));
        assertCurrent();
      } catch (error) { completed = true; throw safeError(error); }
      finally { busy = false; }
    },
    async confirm(code, ownerCurrent = () => true) {
      assertChallenge();
      if (!ownerCurrent()) throw new Error("OTP_CANCELLED");
      if (!/^\d{6}$/.test(code)) throw new Error("OTP_INVALID");
      busy = true;
      try {
        const body = await request("verify", { challengeId: challenge.challengeId, otp: code });
        assertCurrent();
        if (!ownerCurrent()) throw new Error("OTP_CANCELLED");
        completed = true;
        if (typeof body.firebaseCustomToken !== "string" || body.firebaseCustomToken.length < 100 || body.firebaseCustomToken.length > 20000)
          throw new Error("OTP_RESTART");
        const credential = await signInWithCustomToken(getFirebaseBrowserClient().auth, body.firebaseCustomToken);
        assertCurrent();
        if (!ownerCurrent()) throw new Error("OTP_CANCELLED");
        return credential;
      } catch (error) {
        const safe = safeError(error);
        if (!["OTP_INVALID", "OTP_BUSY"].includes(safe.message)) completed = true;
        throw safe;
      } finally { busy = false; }
    },
  };
}
