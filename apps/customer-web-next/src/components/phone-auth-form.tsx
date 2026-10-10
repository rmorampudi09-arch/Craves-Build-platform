"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { beginMsg91PhoneSignIn, parkMsg91Captcha, type PhoneConfirmation } from "@/lib/msg91-browser";
import { phoneCodeRequestError, phoneCodeVerifyError } from "@/lib/phone-auth-errors";
import { getFirebaseBrowserClient } from "@/lib/firebase-client";
import { safeReturnPath, type CravesIdentity } from "@/lib/auth-contract";

type Stage = "phone" | "otp" | "creating-session" | "done";
type RecaptchaMode = "visible" | "invisible";

const RESEND_DELAY_SECONDS = 30;
// Unlayered theme rules style every <button>; ! keeps these neutral actions on the brand palette.
const SECONDARY_BUTTON =
  "min-h-12 w-full rounded-full !border !border-[#E5E7EB] !bg-white px-5 font-semibold !text-[#1A1A1A] disabled:opacity-50";
const TERTIARY_BUTTON =
  "min-h-12 w-full rounded-full !border-0 !bg-[#F1F3F5] px-5 font-semibold !text-[#1A1A1A] !shadow-none disabled:opacity-50";
const FIELD =
  "min-h-12 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1A1A1A] outline-none transition focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10";

/**
 * Phone OTP sign-in shared by /sign-in, the admin portal and Chef Mode.
 * centralOtp=false: this host has no central MSG91 OTP (admin portal), so sign in with Firebase phone auth.
 */
export function PhoneAuthForm({
  returnTo,
  centralOtp = true,
  initialPhone,
  onSignedIn,
}: {
  returnTo?: string;
  centralOtp?: boolean;
  /** The signed-in customer's number; shown with "Use another number". */
  initialPhone?: string;
  /** Takes over once the session exists (Chef Mode) instead of opening returnTo. */
  onSignedIn?: (identity: CravesIdentity) => Promise<void> | void;
}) {
  const destination = safeReturnPath(returnTo);
  const chefJourney = destination.startsWith("/chef");
  const [phone, setPhone] = useState(initialPhone ?? "+91");
  const [prefilled, setPrefilled] = useState(Boolean(initialPhone));
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<Stage>("phone");
  const [message, setMessage] = useState(
    "Use your mobile number to receive a one-time password.",
  );
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const confirmation = useRef<PhoneConfirmation | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const phoneInput = useRef<HTMLInputElement>(null);

  const clearVerifier = useCallback(() => {
    verifier.current?.clear();
    verifier.current = null;
  }, []);

  useEffect(() => () => { clearVerifier(); parkMsg91Captcha(); }, [clearVerifier]);

  useEffect(() => {
    if (stage !== "otp" || resendIn <= 0) return;
    const timer = window.setTimeout(
      () => setResendIn((current) => Math.max(0, current - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resendIn, stage]);

  async function recaptcha(mode: RecaptchaMode): Promise<RecaptchaVerifier> {
    clearVerifier();
    const { auth } = getFirebaseBrowserClient();
    const visible = mode === "visible";
    const instance = new RecaptchaVerifier(
      auth,
      visible ? "craves-recaptcha" : "craves-recaptcha-resend",
      {
        size: visible ? "normal" : "invisible",
        callback: () => {
          if (visible)
            setMessage("Security check completed. You can request the OTP.");
        },
        "expired-callback": () => {
          if (visible)
            setMessage("The security check expired. Complete it again.");
        },
      },
    );
    await instance.render();
    verifier.current = instance;
    return instance;
  }

  async function sendOtp(isResend: boolean) {
    const normalized = phone.replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setMessage(
        "Enter the mobile number with country code, for example +919876543210.",
      );
      return;
    }

    setBusy(true);
    setMessage(
      chefJourney
        ? isResend
          ? "Sending a new OTP…"
          : "Sending your OTP…"
        : isResend
          ? "Requesting a new verification code..."
          : "Requesting your verification code...",
    );
    try {
      if (isResend && confirmation.current?.resend) {
        await confirmation.current.resend();
      } else {
        const msg91 = centralOtp ? await beginMsg91PhoneSignIn(normalized, "craves-recaptcha") : null;
        if (msg91) confirmation.current = msg91;
        else {
          const { auth } = getFirebaseBrowserClient();
          confirmation.current = await signInWithPhoneNumber(
            auth, normalized, await recaptcha(isResend ? "invisible" : "visible"),
          );
        }
      }
      clearVerifier();
      setOtp("");
      setStage("otp");
      setResendIn(RESEND_DELAY_SECONDS);
      setMessage(
        isResend
          ? "A new OTP was sent. Enter the latest six-digit code."
          : "OTP sent. Enter the six-digit code.",
      );
    } catch (error) {
      clearVerifier();
      setMessage(phoneCodeRequestError(error));
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    await sendOtp(false);
  }

  async function resendOtp() {
    if (busy || resendIn > 0) return;
    await sendOtp(true);
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    if (!confirmation.current || !/^\d{6}$/.test(otp)) {
      setMessage("Enter the six-digit OTP.");
      return;
    }
    setBusy(true);
    setStage("creating-session");
    setMessage(chefJourney ? "Checking your OTP…" : "Verifying OTP and creating your Craves session...");
    try {
      const credential = await confirmation.current.confirm(otp);
      const firebaseIdToken = await credential.user.getIdToken(true);
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ firebaseIdToken }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        identity?: CravesIdentity;
        message?: string;
      };
      if (!response.ok) throw new Error(body.message ?? "Sign-in failed.");
      setStage("done");
      setMessage(chefJourney ? "Verified. Opening Chef Mode…" : "Signed in successfully.");
      if (onSignedIn) {
        if (!body.identity?.id) throw new Error("Sign-in failed. Please try again.");
        await onSignedIn(body.identity);
      } else {
        // Replace, so Back from the signed-in page never returns to this OTP form.
        window.location.replace(destination);
      }
    } catch (error) {
      setStage("otp");
      setMessage(phoneCodeVerifyError(error));
    } finally {
      setBusy(false);
    }
  }

  function useAnotherNumber() {
    clearVerifier();
    confirmation.current = null;
    setOtp("");
    setResendIn(0);
    setPrefilled(false);
    setStage("phone");
    setMessage("Request a new OTP.");
  }

  function enterAnotherNumber() {
    setPrefilled(false);
    setPhone("+91");
    requestAnimationFrame(() => phoneInput.current?.focus());
  }

  const otpStage = stage !== "phone";

  return (
    <section className="w-full rounded-3xl border border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] shadow-[0_8px_30px_rgba(0,0,0,0.08)] sm:p-8">
      {chefJourney ? null : (
        <p className="text-sm font-semibold text-[#C4200F]">Secure Craves access</p>
      )}
      <h1 className={`text-3xl font-bold tracking-tight text-[#1A1A1A] ${chefJourney ? "" : "mt-2"}`}>
        {chefJourney ? "Sign in to Chef Mode" : "Sign in with mobile OTP"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">
        {chefJourney
          ? "Confirm your phone number to open your kitchen. This keeps your orders, menu and earnings safe."
          : "Use one mobile number for both customer and chef mode."}
      </p>

      <form
        className="mt-7 space-y-4"
        onSubmit={otpStage ? verifyOtp : requestOtp}
      >
        {otpStage ? (
          <>
            <label
              className="block text-left text-sm font-semibold text-[#1A1A1A]"
              htmlFor="otp"
            >
              Six-digit OTP
            </label>
            <input
              id="otp"
              className={`craves-otp-field ${FIELD} text-center text-2xl tracking-[0.45em]`}
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              autoComplete="one-time-code"
              inputMode="numeric"
              // Mounts only after "Send OTP", replacing the focused phone field.
              autoFocus
              required
            />
          </>
        ) : prefilled ? (
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-[#F1F3F5] py-2 pl-4 pr-2">
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[#6B6B6B]">Signed in as</span>
              <strong className="block text-base tabular-nums text-[#1A1A1A]">{phone}</strong>
            </span>
            <button
              type="button"
              className="shrink-0 rounded-full !border-0 !bg-transparent px-3 text-sm font-semibold !text-[#C4200F] !shadow-none hover:underline"
              disabled={busy}
              onClick={enterAnotherNumber}
            >
              Use another number
            </button>
          </div>
        ) : (
          <>
            <label
              className="block text-left text-sm font-semibold text-[#1A1A1A]"
              htmlFor="phone"
            >
              Mobile number
            </label>
            <input
              id="phone"
              ref={phoneInput}
              className={FIELD}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              inputMode="tel"
              required
            />
          </>
        )}

        {!otpStage && (
          <div
            id="craves-recaptcha"
            className="min-h-20 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F1F3F5] p-2 empty:min-h-0 empty:border-0 empty:p-0"
          />
        )}
        <div
          id="craves-recaptcha-resend"
          className="hidden"
          aria-hidden="true"
        />

        {otpStage ? (
          <>
            <button
              className="craves-primary-action w-full"
              aria-busy={busy}
              disabled={busy || stage === "done"}
            >
              {busy ? "Signing in..." : "Verify OTP"}
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busy || resendIn > 0 || stage === "done"}
              onClick={() => void resendOtp()}
            >
              {resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend OTP"}
            </button>
            <button
              type="button"
              className={TERTIARY_BUTTON}
              disabled={busy}
              onClick={useAnotherNumber}
            >
              Use another number
            </button>
          </>
        ) : (
          <button className="craves-primary-action w-full" aria-busy={busy} disabled={busy}>
            {busy ? "Requesting OTP..." : "Send OTP"}
          </button>
        )}
      </form>

      <p
        aria-live="polite"
        className="mt-4 text-sm leading-6 text-[#1A1A1A]"
      >
        {message}
      </p>
      <p className="mt-4 text-xs leading-5 text-[#6B6B6B]">
        {chefJourney
          ? "Your OTP is used only to securely confirm your Craves account."
          : "Your phone number and OTP help securely confirm your Craves account."}
      </p>
    </section>
  );
}
