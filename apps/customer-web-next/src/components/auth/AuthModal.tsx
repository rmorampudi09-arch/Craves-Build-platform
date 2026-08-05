"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChefHat, UserRound, X } from "lucide-react";
import {
  type ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { getFirebaseBrowserClient } from "@/lib/firebase-client";
import {
  loadSession,
  setSessionIdentity,
  setSessionProfile,
  type CravesUser,
} from "@/services/auth/cravesAuth";
import type { CravesIdentity } from "@/lib/auth-contract";
import { parseCustomerProfile } from "@/lib/profile-contract";
import { CravesLogo } from "@/components/brand/CravesLogo";

type Mode = "login" | "register";
export type AccountMode = "customer" | "chef";

interface AuthModalProps {
  open: boolean;
  mode: Mode;
  initialAccountMode?: AccountMode;
  onClose: () => void;
  onSwitchMode: (mode: Mode) => void;
  onAuthenticated?: (user: CravesUser, accountMode: AccountMode) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthModal({
  open,
  mode,
  initialAccountMode = "customer",
  onClose,
  onSwitchMode,
  onAuthenticated,
}: AuthModalProps) {
  const fieldPrefix = useId();
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [accountMode, setAccountMode] =
    useState<AccountMode>(initialAccountMode);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(
    () => () => {
      verifier.current?.clear();
      verifier.current = null;
    },
    [],
  );

  useEffect(() => {
    if (open) setAccountMode(initialAccountMode);
  }, [initialAccountMode, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!open) return null;

  const reset = () => {
    verifier.current?.clear();
    verifier.current = null;
    confirmation.current = null;
    setPhone("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setAccountMode(initialAccountMode);
    setOtp("");
    setOtpSent(false);
    setBusy(false);
    setError(null);
    setInfo(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  async function recaptcha(): Promise<RecaptchaVerifier> {
    if (verifier.current) return verifier.current;
    const { auth } = getFirebaseBrowserClient();
    const instance = new RecaptchaVerifier(auth, "craves-recaptcha", {
      size: "normal",
      callback: () =>
        setInfo("Security check completed. You can request the OTP."),
      "expired-callback": () =>
        setInfo("The security check expired. Complete it again."),
    });
    await instance.render();
    verifier.current = instance;
    return instance;
  }

  function validateRegistration(): string | null {
    if (firstName.trim().length < 2)
      return "Enter your first name using at least two characters.";
    if (lastName.trim().length < 1) return "Enter your last name.";
    if (email.trim() && !EMAIL_PATTERN.test(email.trim()))
      return "Enter a valid email address or leave it blank.";
    return null;
  }

  const handleGenerateOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    if (!/^\d{10}$/.test(phone))
      return setError("Enter a valid 10-digit mobile number.");
    if (mode === "register") {
      const validationError = validateRegistration();
      if (validationError) return setError(validationError);
    }
    setBusy(true);
    try {
      const { auth } = getFirebaseBrowserClient();
      confirmation.current = await signInWithPhoneNumber(
        auth,
        `+91${phone}`,
        await recaptcha(),
      );
      setOtpSent(true);
      setInfo("OTP sent securely through Firebase.");
    } catch (caught) {
      verifier.current?.clear();
      verifier.current = null;
      const code =
        caught && typeof caught === "object" && "code" in caught
          ? String(caught.code)
          : "";
      setError(
        code.includes("too-many-requests")
          ? "Too many OTP attempts. Please try again later."
          : "OTP could not be sent. Check the number and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!confirmation.current || !/^\d{6}$/.test(otp))
      return setError("Enter the six-digit OTP.");
    setBusy(true);
    try {
      const credential = await confirmation.current.confirm(otp);
      const firebaseIdToken = await credential.user.getIdToken(true);
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ firebaseIdToken }),
      });
      const body = (await response.json().catch(() => null)) as {
        identity?: CravesIdentity;
        message?: string;
      } | null;
      if (!response.ok || !body?.identity)
        throw new Error(body?.message ?? "Sign-in failed.");

      let user = setSessionIdentity(body.identity);

      if (mode === "register") {
        const profileResponse = await fetch("/api/customer/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim() || null,
          }),
        });
        const rawProfile = await profileResponse.json().catch(() => null);
        if (!profileResponse.ok) {
          const message =
            rawProfile &&
            typeof rawProfile === "object" &&
            "message" in rawProfile &&
            typeof rawProfile.message === "string"
              ? rawProfile.message
              : "Your verified phone was saved, but the profile could not be completed. Please try again.";
          throw new Error(message);
        }
        const profile = parseCustomerProfile(rawProfile);
        if (!profile)
          throw new Error("Craves returned an invalid profile response.");
        user = setSessionProfile(profile) ?? user;
      } else {
        user = (await loadSession()) ?? user;
      }

      onAuthenticated?.(user, accountMode);
      reset();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The OTP could not be verified.",
      );
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (next: Mode) => {
    reset();
    onSwitchMode(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#261A15]/70 px-0 md:items-center md:px-4"
      onClick={handleClose}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldPrefix}-title`}
        className="relative max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-white shadow-[var(--shadow-pop)] md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <CravesLogo size="sm" />
            <div>
              <p className="craves-overline">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </p>
              <h2
                id={`${fieldPrefix}-title`}
                className="font-display text-xl font-semibold text-ink"
              >
                {mode === "login" ? "Sign in to Craves" : "Join Craves"}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-secondary"
            aria-label="Close sign-in dialog"
            disabled={busy}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="px-6 py-6">
          <p className="text-sm leading-6 text-muted-foreground">
            Your phone is verified with Firebase. Craves keeps the application
            session in secure HTTP-only cookies.
          </p>

          <fieldset className="mt-6" disabled={otpSent || busy}>
            <legend className="craves-overline text-ink">
              {mode === "register" ? "Register as" : "Continue as"}
            </legend>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                aria-pressed={accountMode === "customer"}
                onClick={() => setAccountMode("customer")}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                  accountMode === "customer"
                    ? "border-primary bg-secondary text-ink"
                    : "border-border bg-white text-muted-foreground hover:border-primary"
                }`}
              >
                <UserRound className="h-5 w-5" aria-hidden="true" /> Customer
              </button>
              <button
                type="button"
                aria-pressed={accountMode === "chef"}
                onClick={() => setAccountMode("chef")}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                  accountMode === "chef"
                    ? "border-primary bg-secondary text-ink"
                    : "border-border bg-white text-muted-foreground hover:border-primary"
                }`}
              >
                <ChefHat className="h-5 w-5" aria-hidden="true" /> Home Chef
              </button>
            </div>
            {accountMode === "chef" && (
              <p className="mt-3 rounded-lg bg-secondary p-3 text-xs leading-5 text-muted-foreground">
                After OTP verification, new chefs continue to the application
                form. Chef tools unlock only after admin approval.
              </p>
            )}
          </fieldset>

          <form
            onSubmit={otpSent ? handleVerify : handleGenerateOtp}
            className="mt-6 space-y-4"
          >
            {mode === "register" && !otpSent && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  htmlFor={`${fieldPrefix}-first-name`}
                  className="text-sm font-semibold text-ink"
                >
                  First name <span className="text-destructive">*</span>
                  <input
                    id={`${fieldPrefix}-first-name`}
                    type="text"
                    autoComplete="given-name"
                    maxLength={100}
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-lg border border-border bg-white px-3 text-base text-ink placeholder:text-[#9A9A95] focus:border-primary"
                    disabled={busy}
                    required
                  />
                </label>
                <label
                  htmlFor={`${fieldPrefix}-last-name`}
                  className="text-sm font-semibold text-ink"
                >
                  Last name <span className="text-destructive">*</span>
                  <input
                    id={`${fieldPrefix}-last-name`}
                    type="text"
                    autoComplete="family-name"
                    maxLength={100}
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-lg border border-border bg-white px-3 text-base text-ink placeholder:text-[#9A9A95] focus:border-primary"
                    disabled={busy}
                    required
                  />
                </label>
              </div>
            )}

            {mode === "register" && !otpSent && (
              <label
                htmlFor={`${fieldPrefix}-email`}
                className="block text-sm font-semibold text-ink"
              >
                Email <span className="font-normal text-muted-foreground">(optional)</span>
                <input
                  id={`${fieldPrefix}-email`}
                  type="email"
                  autoComplete="email"
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-2 min-h-12 w-full rounded-lg border border-border bg-white px-3 text-base text-ink placeholder:text-[#9A9A95] focus:border-primary"
                  disabled={busy}
                />
              </label>
            )}

            <label
              htmlFor={`${fieldPrefix}-phone`}
              className="block text-sm font-semibold text-ink"
            >
              Mobile number <span className="text-destructive">*</span>
              <span className="mt-2 flex min-h-12 overflow-hidden rounded-lg border border-border bg-white focus-within:border-primary">
                <span className="flex items-center border-r border-border px-3 text-sm font-semibold text-ink">
                  +91
                </span>
                <input
                  id={`${fieldPrefix}-phone`}
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value.replace(/\D/g, ""))
                  }
                  className="w-full bg-white px-3 text-base text-ink outline-none placeholder:text-[#9A9A95]"
                  disabled={otpSent || busy}
                  autoComplete="tel-national"
                  required
                />
              </span>
            </label>

            {!otpSent && (
              <div
                id="craves-recaptcha"
                className="min-h-20 overflow-hidden rounded-lg border border-border bg-white p-2"
              />
            )}

            {otpSent && (
              <label
                htmlFor={`${fieldPrefix}-otp`}
                className="block text-sm font-semibold text-ink"
              >
                Six-digit OTP
                <input
                  id={`${fieldPrefix}-otp`}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, ""))
                  }
                  className="mt-2 min-h-12 w-full rounded-lg border border-border bg-white px-3 text-center text-lg tracking-[0.32em] text-ink placeholder:text-[#9A9A95] focus:border-primary"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                />
              </label>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
              >
                {error}
              </p>
            )}
            {info && !error && (
              <p
                role="status"
                className="rounded-lg border border-[#1E5BA8]/20 bg-[#1E5BA8]/5 px-3 py-2 text-sm font-medium text-[#1E5BA8]"
              >
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full"
            >
              {busy
                ? "Please wait…"
                : otpSent
                  ? mode === "login"
                    ? "Sign in"
                    : "Verify and create account"
                  : "Send OTP"}
            </button>

            {otpSent && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  confirmation.current = null;
                  setOtp("");
                  setOtpSent(false);
                  setInfo("Request a new OTP.");
                }}
                className="min-h-11 w-full text-sm font-semibold text-contrast-red underline-offset-4 hover:underline"
              >
                Use another number
              </button>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                New to Craves?{" "}
                <button
                  type="button"
                  onClick={() => switchTo("register")}
                  className="font-semibold text-contrast-red underline-offset-4 hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already registered?{" "}
                <button
                  type="button"
                  onClick={() => switchTo("login")}
                  className="font-semibold text-contrast-red underline-offset-4 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </section>
    </div>
  );
}
