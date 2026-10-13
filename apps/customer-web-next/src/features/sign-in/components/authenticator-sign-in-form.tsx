"use client";

import { type FormEvent, useRef, useState } from "react";
import {
  getMultiFactorResolver,
  multiFactor,
  signInWithEmailAndPassword,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from "firebase/auth";
import { getFirebaseBrowserClient } from "@/features/auth/lib/firebase-client";
import { CodeSlots, type CodeSlotsStatus } from "@/shared/ui/forms/code-slots";

type Step =
  | { name: "credentials" }
  | { name: "enrol"; user: User; secret: TotpSecret }
  | { name: "code"; resolver: MultiFactorResolver; hintUid: string };

const FIELD =
  "min-h-12 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1A1A1A] outline-none transition focus:border-[#F62E18] focus:ring-2 focus:ring-[#1A1A1A]/10";
const WRONG_CREDENTIALS = "Email or password is incorrect.";
const NOT_AVAILABLE = "Authenticator sign-in isn’t available yet.";
const GENERIC = "We couldn’t sign you in. Please try again.";
const ERROR_COPY: Record<string, string> = {
  "auth/invalid-credential": WRONG_CREDENTIALS,
  "auth/wrong-password": WRONG_CREDENTIALS,
  "auth/user-not-found": WRONG_CREDENTIALS,
  "auth/invalid-email": WRONG_CREDENTIALS,
  "auth/invalid-verification-code":
    "That code didn’t match. Enter the latest code from your authenticator app.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/unverified-email":
    "Your staff email isn’t verified yet. Ask Craves operations to verify it.",
  "auth/operation-not-allowed": NOT_AVAILABLE,
  "auth/admin-restricted-operation": NOT_AVAILABLE,
  "auth/requires-recent-login": "Please sign in again.",
  TOTP_NOT_ENROLLED:
    "This account uses a different second factor. Ask Craves operations to reset it.",
};

const errorCode = (error: unknown) =>
  error && typeof error === "object" && "code" in error
    ? String(error.code)
    : error instanceof Error
      ? error.message
      : "";

/** Reviewed copy only: Firebase error text never reaches the screen. */
export function authenticatorSignInError(error: unknown): string {
  return ERROR_COPY[errorCode(error)] ?? GENERIC;
}

/**
 * Administrator sign-in with staff email, password and an authenticator app (Firebase TOTP MFA).
 * Auth issues an admin session only for an ID token that passed the TOTP challenge (CH-09).
 */
export function AuthenticatorSignInForm({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<CodeSlotsStatus>("idle");
  const [step, setStep] = useState<Step>({ name: "credentials" });
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const working = useRef(false);

  async function attempt(task: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setFailed(false);
    setCodeStatus("verifying");
    try {
      await task();
      setCodeStatus("idle");
    } catch (error) {
      setFailed(true);
      setCodeStatus("error");
      setMessage(authenticatorSignInError(error));
      setCode("");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  /** Email and password. An enrolled account then needs its code; a new one enrols first. */
  async function firstFactor() {
    const { auth } = getFirebaseBrowserClient();
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      const secret = await TotpMultiFactorGenerator.generateSecret(
        await multiFactor(user).getSession(),
      );
      setStep({ name: "enrol", user, secret });
      setMessage("Add Craves to your authenticator app, then enter the six-digit code it shows.");
    } catch (error) {
      if (errorCode(error) !== "auth/multi-factor-auth-required") throw error;
      const resolver = getMultiFactorResolver(auth, error as MultiFactorError);
      const hint = resolver.hints.find(
        (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
      );
      if (!hint) throw new Error("TOTP_NOT_ENROLLED");
      setStep({ name: "code", resolver, hintUid: hint.uid });
      setMessage("Enter the six-digit code from your authenticator app.");
    }
  }

  async function checkCode(value: string) {
    if (!/^\d{6}$/.test(value)) {
      setFailed(true);
      setCodeStatus("error");
      setMessage("Enter the six-digit code.");
      return;
    }
    await attempt(async () => {
      if (step.name === "enrol") {
        await multiFactor(step.user).enroll(
          TotpMultiFactorGenerator.assertionForEnrollment(step.secret, value),
          "Authenticator app",
        );
        setCode("");
        // Sign in again so the session always comes from a TOTP challenge, never from the enrolment itself.
        await firstFactor();
        setMessage("Authenticator added. When the app shows a new code, enter it to sign in.");
        return;
      }
      if (step.name !== "code") return;
      const credential = await step.resolver.resolveSignIn(
        TotpMultiFactorGenerator.assertionForSignIn(step.hintUid, value),
      );
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ firebaseIdToken: await credential.user.getIdToken() }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        // The resolver is spent; the session service's message is reviewed copy.
        setStep({ name: "credentials" });
        setFailed(true);
        setMessage(body.message ?? GENERIC);
        return;
      }
      setPassword("");
      setDone(true);
      setMessage("Signed in. Opening…");
      window.location.replace(returnTo);
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step.name === "credentials") void attempt(firstFactor);
    else void checkCode(code);
  }

  const locked = busy || done;
  return (
    <section className="mb-4 w-full rounded-3xl border border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] sm:p-8">
      <h1 className="text-3xl font-bold tracking-tight text-[#1A1A1A]">
        Sign in with authenticator app
      </h1>
      <form className="mt-7 space-y-4" noValidate onSubmit={submit}>
        {step.name === "credentials" ? (
          <>
            <label className="block text-left text-sm font-semibold" htmlFor="staff-email">
              Staff email
            </label>
            <input
              id="staff-email"
              className={FIELD}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={locked}
              required
            />
            <label className="block text-left text-sm font-semibold" htmlFor="staff-password">
              Password
            </label>
            <input
              id="staff-password"
              className={FIELD}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={locked}
              required
            />
          </>
        ) : (
          <>
            {step.name === "enrol" ? (
              <div className="space-y-2 text-sm">
                <p>Setup key</p>
                <p className="font-mono text-base font-semibold tracking-wide">
                  {step.secret.secretKey.replace(/(.{4})(?=.)/g, "$1 ")}
                </p>
                {/* shortcut: no QR image (no QR dependency); add one if staff ask. */}
                <a
                  className="font-semibold text-[#C4200F] underline"
                  href={step.secret.generateQrCodeUrl(email, "Craves Admin")}
                >
                  Add to authenticator app
                </a>
              </div>
            ) : null}
            <label className="block text-left text-sm font-semibold" htmlFor="authenticator-code">
              Authenticator code
            </label>
            <CodeSlots
              id="authenticator-code"
              length={6}
              value={code}
              status={codeStatus}
              onChange={(next) => {
                setCode(next);
                if (!busy) setCodeStatus("idle");
              }}
              onComplete={(next) => void checkCode(next)}
              readOnly={busy}
              disabled={done}
              autoFocus
              required
            />
          </>
        )}
        <button className="craves-primary-action w-full" aria-busy={locked} disabled={locked}>
          {done
            ? "Opening…"
            : busy
              ? "Checking…"
              : step.name === "credentials"
                ? "Continue"
                : "Verify code"}
        </button>
      </form>
      <p
        role={failed ? "alert" : undefined}
        aria-live="polite"
        className={`mt-4 text-sm leading-6 ${failed ? "font-medium text-[#C4200F]" : "text-[#1A1A1A]"}`}
      >
        {message}
      </p>
    </section>
  );
}
