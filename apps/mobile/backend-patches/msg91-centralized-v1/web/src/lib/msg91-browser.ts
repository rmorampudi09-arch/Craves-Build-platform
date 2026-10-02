"use client";
import { signInWithCustomToken, type UserCredential } from "firebase/auth";
import { getFirebaseBrowserClient } from "./firebase-client";

export type PhoneConfirmation = {
  confirm(code: string, currentAttempt?: () => boolean): Promise<UserCredential>;
  resend?(): Promise<void>;
};
type Challenge = { challengeId: string; expiresAt: number; resendAvailableAt: number };
let generation = 0;
let pending = false;
const sends = new Map<string, number>();

export function parkMsg91Captcha() { generation += 1; }

async function post(action: "send" | "verify", payload: object): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`/api/auth/otp/${action}`, {
      method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !result) {
      const safe = new Set(["OTP_INVALID", "OTP_RESTART", "OTP_EXPIRED", "OTP_BUSY", "OTP_COOLDOWN", "OTP_RATE_LIMIT", "OTP_RESEND_LIMIT"]);
      throw new Error(typeof result?.code === "string" && safe.has(result.code) ? result.code : "OTP_UNAVAILABLE");
    }
    return result;
  } catch (error) {
    if (error instanceof Error && /^OTP_[A-Z_]+$/.test(error.message)) throw error;
    throw new Error("OTP_UNAVAILABLE");
  }
}
function parseChallenge(result: Record<string, unknown>): Challenge {
  if (typeof result.challengeId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(result.challengeId)
    || typeof result.expiresAt !== "number" || !Number.isSafeInteger(result.expiresAt) || result.expiresAt <= Date.now()
    || typeof result.resendAvailableAt !== "number" || !Number.isSafeInteger(result.resendAvailableAt))
    throw new Error("OTP_UNAVAILABLE");
  return { challengeId: result.challengeId, expiresAt: result.expiresAt, resendAvailableAt: result.resendAvailableAt };
}
function reserve(phone: string) {
  const now=Date.now();
  for(const [key,deadline] of sends) if(deadline<=now) sends.delete(key);
  if((sends.get(phone)??0)>now) throw new Error("OTP_COOLDOWN");
  sends.set(phone,now+30000);
}
export async function beginMsg91PhoneSignIn(phone: string, _captchaRenderId: string,
  currentAttempt: () => boolean = () => true): Promise<PhoneConfirmation | null> {
  if(!/^\+91[6-9]\d{9}$/.test(phone)) throw new Error("OTP_INVALID");
  if(pending) throw new Error("OTP_BUSY");
  pending=true; const owner=++generation;
  const active=() => { if(owner!==generation) throw new Error("OTP_CANCELLED"); };
  let challenge: Challenge;
  try {
    active(); if(!currentAttempt()) throw new Error("OTP_CANCELLED"); reserve(phone);
    challenge=parseChallenge(await post("send", {phoneNumber:phone.slice(3),countryCode:"91"}));
    active(); if(!currentAttempt()) throw new Error("OTP_CANCELLED");
  }
  finally { pending=false; }
  let used=false; let resends=0;
  const ready=() => { active(); if(used || challenge.expiresAt<=Date.now()) throw new Error("OTP_RESTART"); if(pending) throw new Error("OTP_BUSY"); };
  return {
    async resend() {
      ready();
      if(resends>=2) throw new Error("OTP_RESEND_LIMIT");
      if(challenge.resendAvailableAt>Date.now()) throw new Error("OTP_COOLDOWN");
      reserve(phone); pending=true; resends+=1;
      try { challenge=parseChallenge(await post("send", {phoneNumber:phone.slice(3),countryCode:"91",challengeId:challenge.challengeId})); active(); }
      catch(error) { used=true; throw error; } finally { pending=false; }
    },
    async confirm(code, stillCurrent=()=>true) {
      ready(); if(!stillCurrent()) throw new Error("OTP_CANCELLED");
      if(!/^\d{6}$/.test(code)) throw new Error("OTP_INVALID");
      pending=true;
      try {
        const result=await post("verify",{challengeId:challenge.challengeId,otp:code});
        active(); if(!stillCurrent()) throw new Error("OTP_CANCELLED");
        used=true;
        if(typeof result.firebaseCustomToken!=="string" || result.firebaseCustomToken.length<100 || result.firebaseCustomToken.length>20000)
          throw new Error("OTP_RESTART");
        return await signInWithCustomToken(getFirebaseBrowserClient().auth,result.firebaseCustomToken);
      } catch(error) {
        if(!(error instanceof Error) || !["OTP_INVALID","OTP_BUSY"].includes(error.message)) used=true;
        throw error;
      } finally { pending=false; }
    },
  };
}
