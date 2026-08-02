"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  type ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { getFirebaseBrowserClient } from "@/lib/firebase-client";
import { safeReturnPath } from "@/lib/auth-contract";

type Stage = "phone" | "otp" | "creating-session" | "done";

export function PhoneAuthForm({ returnTo }: { returnTo?: string }) {
  const destination = safeReturnPath(returnTo);
  const chefJourney = destination.startsWith("/chef");
  const [phone, setPhone] = useState("+91");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<Stage>("phone");
  const [message, setMessage] = useState(
    "Use your mobile number to receive a one-time password.",
  );
  const [busy, setBusy] = useState(false);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(
    () => () => {
      verifier.current?.clear();
      verifier.current = null;
    },
    [],
  );

  async function recaptcha(): Promise<RecaptchaVerifier> {
    if (verifier.current) return verifier.current;
    const { auth } = getFirebaseBrowserClient();
    const instance = new RecaptchaVerifier(auth, "craves-recaptcha", {
      size: "normal",
      callback: () =>
        setMessage("Security check completed. You can request the OTP."),
      "expired-callback": () =>
        setMessage("The security check expired. Complete it again."),
    });
    await instance.render();
    verifier.current = instance;
    return instance;
  }

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    const normalized = phone.replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setMessage(
        "Enter the mobile number with country code, for example +919876543210.",
      );
      return;
    }
    setBusy(true);
    setMessage("Requesting OTP securely through Firebase...");
    try {
      const { auth } = getFirebaseBrowserClient();
      confirmation.current = await signInWithPhoneNumber(
        auth,
        normalized,
        await recaptcha(),
      );
      setStage("otp");
      setMessage("OTP sent. Enter the six-digit code.");
    } catch (error) {
      verifier.current?.clear();
      verifier.current = null;
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      setMessage(
        code.includes("too-many-requests")
          ? "Too many OTP attempts. Please try again later."
          : "OTP could not be sent. Check the number and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    if (!confirmation.current || !/^\d{6}$/.test(otp)) {
      setMessage("Enter the six-digit OTP.");
      return;
    }
    setBusy(true);
    setStage("creating-session");
    setMessage("Verifying OTP and creating your Craves session...");
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
        message?: string;
      };
      if (!response.ok) throw new Error(body.message ?? "Sign-in failed.");
      setStage("done");
      setMessage("Signed in successfully.");
      window.location.assign(destination);
    } catch (error) {
      setStage("otp");
      setMessage(
        error instanceof Error
          ? error.message
          : "The OTP could not be verified.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="w-full rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 shadow-2xl shadow-black/30 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">
        Secure Craves access
      </p>
      <h1 className="mt-3 text-3xl font-bold">
        {chefJourney ? "Sign in to Chef Mode" : "Sign in with mobile OTP"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        The same Firebase-verified mobile identity supports customer and chef
        mode. Craves tokens stay in secure HTTP-only cookies.
      </p>

      {stage === "phone" ? (
        <form className="mt-7 space-y-4" onSubmit={requestOtp}>
          <label
            className="block text-left text-sm font-semibold"
            htmlFor="phone"
          >
            Mobile number
          </label>
          <input
            id="phone"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#6930CA]"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            inputMode="tel"
            required
          />
          <div
            id="craves-recaptcha"
            className="min-h-20 overflow-hidden rounded-2xl bg-white p-2"
          />
          <button
            className="w-full rounded-full bg-[#6930CA] px-5 py-3 font-semibold text-white disabled:opacity-50"
            disabled={busy}
          >
            {busy ? "Requesting OTP..." : "Send OTP"}
          </button>
        </form>
      ) : (
        <form className="mt-7 space-y-4" onSubmit={verifyOtp}>
          <label
            className="block text-left text-sm font-semibold"
            htmlFor="otp"
          >
            Six-digit OTP
          </label>
          <input
            id="otp"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-2xl tracking-[0.45em] outline-none focus:border-[#6930CA]"
            value={otp}
            onChange={(event) =>
              setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            autoComplete="one-time-code"
            inputMode="numeric"
            required
          />
          <button
            className="w-full rounded-full bg-[#6930CA] px-5 py-3 font-semibold text-white disabled:opacity-50"
            disabled={busy || stage === "done"}
          >
            {busy ? "Signing in..." : "Verify OTP"}
          </button>
          <button
            type="button"
            className="w-full rounded-full border border-[#6930CA] px-5 py-3 font-semibold text-[#6930CA]"
            disabled={busy}
            onClick={() => {
              confirmation.current = null;
              setOtp("");
              setStage("phone");
              setMessage("Request a new OTP.");
            }}
          >
            Use another number
          </button>
        </form>
      )}

      <p
        aria-live="polite"
        className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700"
      >
        {message}
      </p>
      <p className="mt-4 text-xs leading-5 text-slate-500">
        By continuing, the phone number is processed by Firebase for
        authentication and abuse prevention. Use Firebase test numbers during
        development.
      </p>
    </section>
  );
}
