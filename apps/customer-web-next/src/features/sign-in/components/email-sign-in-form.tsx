"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import type { CravesIdentity } from "@/features/auth/lib/auth-contract";
import { CARD, FIELD, SECONDARY_BUTTON, TEXT_BUTTON } from "@/features/sign-in/components/auth-form-classes";
import {
  emailError,
  emailSignInErrors,
  PASSWORD_RECOVERY_NEUTRAL_MESSAGE,
  PhoneVerificationRequiredError,
  sendPasswordReset,
  signInWithEmail,
} from "@/features/sign-in/lib/email-sign-in";

type View = "sign-in" | "forgot" | "sent";

const LABEL = "block text-left text-sm font-semibold text-[#1A1A1A]";
const INPUT = `mt-2 ${FIELD} aria-[invalid=true]:border-[#C4200F]`;
const FIELD_ERROR = "mt-2 text-left text-sm font-medium text-[#C4200F]";

/** The app's email screens: EmailSignIn, ForgotPassword and PasswordResetSent. There is no email sign-up. */
export function EmailSignInForm({
  chef,
  onSignedIn,
  onUsePhone,
}: {
  chef: boolean;
  /** Runs once the Craves session exists, exactly as after an OTP. */
  onSignedIn: (identity: CravesIdentity) => Promise<void>;
  /** Back to phone OTP, with an optional note to show there. */
  onUsePhone: (notice?: string) => void;
}) {
  const [view, setView] = useState<View>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  const errors = view === "sign-in" ? emailSignInErrors(email, password) : { email: emailError(email), password: undefined };
  const shownEmailError = touched.email ? errors.email : undefined;
  const shownPasswordError = touched.password ? errors.password : undefined;

  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (failure) {
      setOpening(false);
      if (failure instanceof PhoneVerificationRequiredError) onUsePhone(failure.message);
      else setError((failure as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function signIn(event: FormEvent) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    if (errors.email || errors.password) {
      document.getElementById(errors.email ? "sign-in-email" : "sign-in-password")?.focus();
      return;
    }
    void run(async () => {
      const identity = await signInWithEmail(email, password);
      // "Opening…" holds while the next page loads, so the button never looks ready again.
      setOpening(true);
      await onSignedIn(identity);
    });
  }

  function requestReset(event: FormEvent) {
    event.preventDefault();
    setTouched((current) => ({ ...current, email: true }));
    if (errors.email) {
      document.getElementById("sign-in-email")?.focus();
      return;
    }
    void run(async () => {
      await sendPasswordReset(email);
      setView("sent");
    });
  }

  function show(next: View) {
    if (busy) return;
    setError("");
    setView(next);
  }

  if (view === "sent")
    return (
      <section className={`${CARD} text-center`}>
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF0ED]">
          <Check className="h-8 w-8 text-[#F62E18]" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Password Reset Sent</h1>
        <p id="reset-sent-message" role="status" className="mt-2 text-sm leading-6 text-[#6B6B6B]">{PASSWORD_RECOVERY_NEUTRAL_MESSAGE}</p>
        {/* Focus moves here from the button this view replaced, and reads the confirmation with it. */}
        <button type="button" className="craves-primary-action mt-7 w-full" autoFocus aria-describedby="reset-sent-message" onClick={() => show("sign-in")}>
          Back to login
        </button>
      </section>
    );

  const signingIn = view === "sign-in";
  return (
    <section className={CARD}>
      <h1 className="text-3xl font-bold tracking-tight text-[#1A1A1A]">{signingIn ? "Welcome back" : "Forgot your password?"}</h1>
      <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">
        {signingIn
          ? "Log in with your email and password."
          : "Enter the email you use for Craves. If an account matches, we will send secure reset instructions."}
      </p>
      {/* A new key per view remounts the email field, so it takes focus again. */}
      <form key={view} className="mt-7 space-y-4" noValidate onSubmit={signingIn ? signIn : requestReset}>
        <div>
          <label htmlFor="sign-in-email" className={LABEL}>Email address</label>
          <input
            id="sign-in-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete={signingIn ? "username" : "email"}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Enter your email address"
            autoFocus
            className={INPUT}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
            onBlur={() => setTouched((current) => ({ ...current, email: true }))}
            aria-invalid={shownEmailError ? true : undefined}
            aria-describedby={shownEmailError ? "sign-in-email-error" : undefined}
            disabled={busy}
          />
          {shownEmailError ? <p id="sign-in-email-error" className={FIELD_ERROR}>{shownEmailError}</p> : null}
        </div>
        {signingIn ? (
          <div>
            <label htmlFor="sign-in-password" className={LABEL}>Password</label>
            <div className="relative">
              <input
                id="sign-in-password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Enter your password"
                className={`${INPUT} pr-14`}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                onBlur={() => setTouched((current) => ({ ...current, password: true }))}
                aria-invalid={shownPasswordError ? true : undefined}
                aria-describedby={shownPasswordError ? "sign-in-password-error" : undefined}
                disabled={busy}
              />
              <button
                type="button"
                className="absolute bottom-0.5 right-1 flex h-11 w-11 items-center justify-center rounded-full !border-0 !bg-transparent !text-[#1A1A1A] !shadow-none"
                aria-label={passwordVisible ? "Hide password" : "Show password"}
                onClick={() => setPasswordVisible((visible) => !visible)}
                disabled={busy}
              >
                {passwordVisible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
            {shownPasswordError ? <p id="sign-in-password-error" className={FIELD_ERROR}>{shownPasswordError}</p> : null}
          </div>
        ) : null}
        {error ? <p role="alert" className="text-left text-sm font-medium text-[#C4200F]">{error}</p> : null}
        {signingIn ? (
          <div className="-my-1 flex justify-end">
            <button type="button" className={`${TEXT_BUTTON} -mr-3`} disabled={busy} onClick={() => show("forgot")}>
              Forgot password?
            </button>
          </div>
        ) : null}
        <button className="craves-primary-action w-full" aria-busy={busy} disabled={busy || opening}>
          {signingIn
            ? opening ? "Opening…" : busy ? "Logging in…" : chef ? "Log in as Chef" : "Log in as Customer"
            : busy ? "Sending…" : "Send reset link"}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          disabled={busy || opening}
          onClick={() => (signingIn ? onUsePhone() : show("sign-in"))}
        >
          {signingIn ? "Use phone OTP instead" : "Back to login"}
        </button>
      </form>
    </section>
  );
}
