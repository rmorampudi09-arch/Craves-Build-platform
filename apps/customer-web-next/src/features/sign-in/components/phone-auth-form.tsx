"use client";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { beginMsg91PhoneSignIn, parkMsg91Captcha, type PhoneConfirmation } from "@/features/sign-in/lib/msg91-browser";
import { phoneCodeRequestError, phoneCodeVerifyError } from "@/features/sign-in/lib/phone-auth-errors";
import { getFirebaseBrowserClient } from "@/features/auth/lib/firebase-client";
import { safeReturnPath, type CravesIdentity } from "@/features/auth/lib/auth-contract";
import { CodeSlots, type CodeSlotsStatus } from "@/shared/ui/forms/code-slots";
import { markCustomerModeVerified } from "@/features/chef/lib/chef-mode";

type Stage = "phone" | "otp" | "creating-session" | "done";
type RecaptchaMode = "visible" | "invisible";

const RESEND_DELAY_SECONDS = 30;
// Unlayered theme rules style every <button>; ! keeps these neutral actions on the brand palette.
const SECONDARY_BUTTON =
  "min-h-12 w-full rounded-full !border !border-[#E5E7EB] !bg-white px-5 font-semibold !text-[#1A1A1A] disabled:opacity-50";
const TEXT_BUTTON =
  "min-h-11 shrink-0 rounded-full !border-0 !bg-transparent px-3 text-sm font-semibold !text-[#C4200F] !shadow-none hover:underline disabled:opacity-50";
const FIELD =
  "min-h-12 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1A1A1A] outline-none transition focus:border-[#F62E18] focus:ring-2 focus:ring-[#1A1A1A]/10";

/** The 10 national digits of a typed, pasted or autofilled number: "+91 98765 43210", "09876543210", "(98765) 43210". */
function nationalDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return (/^(?:0{0,2}91)?0?(\d{10})$/.exec(digits)?.[1] ?? digits).slice(0, 10);
}

/** "9876543210" → "98765 43210", also while it is typed. */
const groupDigits = (national: string) => national.replace(/^(\d{5})(?=\d)/, "$1 ");

/** "+919876543210" → "+91 98765 43210"; other numbers stay as they are. */
const showPhone = (e164: string) => e164.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");

/** Why this number can't get an OTP, or "" when it can. Central OTP serves Indian mobiles only. */
function phoneProblem(e164: string, indian: boolean): string {
  if (!indian)
    return /^\+[1-9]\d{7,14}$/.test(e164) ? "" : "Enter the mobile number with country code, for example +919876543210.";
  const national = e164.startsWith("+91") ? e164.slice(3) : "";
  if (!/^\d{10}$/.test(national)) return "Enter a 10-digit mobile number.";
  return /^[6-9]/.test(national) ? "" : "Indian mobile numbers start with 6, 7, 8 or 9.";
}

/**
 * Phone OTP sign-in shared by /sign-in, the admin portal and Chef Mode.
 * centralOtp=false: this host has no central MSG91 OTP (admin portal), so sign in with Firebase phone auth.
 */
export function PhoneAuthForm({
  returnTo,
  centralOtp = true,
  anyCountry = false,
  initialPhone,
  onSignedIn,
  heading,
}: {
  returnTo?: string;
  centralOtp?: boolean;
  /** Admin portal only: any country code. Chefs and customers type a +91 mobile, whichever OTP service runs. */
  anyCountry?: boolean;
  /** The signed-in customer's number; shown with "Use another number". */
  initialPhone?: string;
  /** Takes over once the session exists (Chef Mode) instead of opening returnTo. */
  onSignedIn?: (identity: CravesIdentity) => Promise<void> | void;
  /** Replaces the title and line under it, for example when switching over from Chef Mode. */
  heading?: { title: string; text: string };
}) {
  const destination = safeReturnPath(returnTo);
  const chefJourney = destination.startsWith("/chef");
  // E.164 (+919876543210); the +91 field edits only the national digits after the prefix.
  const [phone, setPhone] = useState(initialPhone ?? "+91");
  const [phoneError, setPhoneError] = useState("");
  const [prefilled, setPrefilled] = useState(Boolean(initialPhone));
  const [otp, setOtp] = useState("");
  const [otpStatus, setOtpStatus] = useState<CodeSlotsStatus>("idle");
  const verifying = useRef(false);
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
    const problem = phoneProblem(normalized, !anyCountry);
    if (problem) {
      setPhoneError(problem);
      phoneInput.current?.focus();
      return;
    }

    setBusy(true);
    setMessage(
      chefJourney
        ? isResend
          ? "Sending a new OTP…"
          : "Sending your OTP…"
        : isResend
          ? "Requesting a new verification code…"
          : "Requesting your verification code…",
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
      setOtpStatus("idle");
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
    await verifyCode(otp);
  }

  /** Checks a complete code: from Verify OTP, or by itself once the last digit lands. */
  async function verifyCode(code: string) {
    if (verifying.current) return;
    if (!confirmation.current || !/^\d{6}$/.test(code)) {
      setMessage("Enter the six-digit OTP.");
      setOtpStatus("error");
      return;
    }
    verifying.current = true;
    setBusy(true);
    setStage("creating-session");
    setOtpStatus("verifying");
    setMessage(chefJourney ? "Checking your OTP…" : "Verifying OTP and creating your Craves session…");
    try {
      const credential = await confirmation.current.confirm(code);
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
      if (!response.ok) throw new Error(body.message ?? "We couldn’t sign you in. Check the code and try again, or request a new code.");
      setStage("done");
      setOtpStatus("success");
      // A customer OTP opens the customer app on this device; Chef Mode keeps its own check.
      if (!chefJourney && body.identity?.id) markCustomerModeVerified(body.identity.id);
      setMessage(chefJourney ? "Verified. Opening your kitchen…" : "Signed in successfully.");
      // No wait: the next page starts loading now and the accepted wave plays meanwhile.
      if (onSignedIn) {
        if (!body.identity?.id) throw new Error("Sign-in failed. Please try again.");
        await onSignedIn(body.identity);
      } else {
        // Replace, so Back from the signed-in page never returns to this OTP form.
        window.location.replace(destination);
      }
    } catch (error) {
      setStage("otp");
      setOtpStatus("error");
      setMessage(phoneCodeVerifyError(error));
      // After the shake, clear the slots so the code can be typed again from the first digit.
      window.setTimeout(() => setOtp((current) => (current === code ? "" : current)), 600);
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }

  function useAnotherNumber() {
    clearVerifier();
    confirmation.current = null;
    setOtp("");
    setOtpStatus("idle");
    setResendIn(0);
    setPrefilled(false);
    setStage("phone");
    setMessage("Request a new OTP.");
    requestAnimationFrame(() => phoneInput.current?.focus());
  }

  function enterAnotherNumber() {
    setPrefilled(false);
    setPhone("+91");
    setPhoneError("");
    requestAnimationFrame(() => phoneInput.current?.focus());
  }

  /** Keeps `phone` as +91 and the national digits, shown as "98765 43210". */
  function changeNationalNumber(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const typed = input.value.replace(/\D/g, "");
    const next = nationalDigits(input.value);
    // The caret stays after the same digit as the space comes and goes; a stripped +91/0 prefix or a
    // dropped 11th digit puts it at the end. Delete on the space steps over it instead of sticking.
    const before = typed === next
      ? input.value.slice(0, input.selectionStart ?? undefined).replace(/\D/g, "").length
      : next.length;
    const forward = (event.nativeEvent as InputEvent).inputType === "deleteContentForward";
    const caret = before + (before > 5 || (forward && before === 5 && next.length > 5) ? 1 : 0);
    input.value = groupDigits(next);
    input.setSelectionRange(caret, caret);
    setPhone(`+91${next}`);
    setPhoneError("");
  }

  const otpStage = stage !== "phone";

  return (
    <section className="w-full rounded-3xl border border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] shadow-[0_8px_30px_rgba(0,0,0,0.08)] sm:p-8">
      {chefJourney ? null : (
        <p className="text-sm font-semibold text-[#C4200F]">Secure Craves access</p>
      )}
      <h1 className={`text-3xl font-bold tracking-tight text-[#1A1A1A] ${chefJourney ? "" : "mt-2"}`}>
        {heading?.title ?? (chefJourney ? "Sign in to your kitchen" : "Sign in with mobile OTP")}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">
        {heading?.text ??
          (chefJourney
            ? "We’ll send a code to your phone. This keeps your orders, menu and earnings safe."
            : "Use one mobile number for both customer and chef mode.")}
      </p>

      {/* noValidate: the number and the code are checked here, with the reason shown under the field. */}
      <form
        className="mt-7 space-y-4"
        noValidate
        onSubmit={otpStage ? verifyOtp : requestOtp}
      >
        {otpStage ? (
          <>
            <div>
              <label
                className="block text-left text-sm font-semibold text-[#1A1A1A]"
                htmlFor="otp"
              >
                Six-digit OTP
              </label>
              <div className="flex items-center justify-between gap-3">
                <p id="otp-sent-to" className="min-w-0 text-left text-sm text-[#6B6B6B]">
                  Sent to <span className="font-semibold tabular-nums text-[#1A1A1A]">{showPhone(phone)}</span>
                </p>
                <button
                  type="button"
                  className={`${TEXT_BUTTON} -my-2 -mr-3`}
                  aria-label="Change mobile number"
                  disabled={busy || stage === "done"}
                  onClick={useAnotherNumber}
                >
                  Change
                </button>
              </div>
            </div>
            <CodeSlots
              id="otp"
              length={6}
              value={otp}
              status={otpStatus}
              onChange={(next) => {
                setOtp(next);
                if (otpStatus !== "verifying" && otpStatus !== "success") setOtpStatus("idle");
              }}
              onComplete={(code) => void verifyCode(code)}
              // Read-only while checking, never disabled: on touch the field keeps focus and the keypad stays up.
              readOnly={busy}
              disabled={stage === "done"}
              aria-describedby={otpStatus === "error" ? "otp-sent-to otp-error" : "otp-sent-to"}
              // Mounts only after "Send OTP", replacing the focused phone field.
              autoFocus
              required
            />
            {/* A wrong code is explained right under the boxes, not below the buttons. */}
            {otpStatus === "error" ? (
              <p id="otp-error" role="alert" className="text-left text-sm font-medium text-[#C4200F]">
                {message}
              </p>
            ) : null}
          </>
        ) : prefilled ? (
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-[#F1F3F5] py-2 pl-4 pr-2">
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[#6B6B6B]">Signed in as</span>
              <strong className="block text-base tabular-nums text-[#1A1A1A]">{showPhone(phone)}</strong>
            </span>
            <button
              type="button"
              className={TEXT_BUTTON}
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
            {!anyCountry ? (
              // Indian mobiles: +91 is fixed and only the 10 digits are typed.
              <div
                className={`flex h-14 items-center overflow-hidden rounded-2xl border bg-white transition-[border-color,box-shadow] duration-150 focus-within:outline-hidden focus-within:ring-4 focus-within:ring-[#1A1A1A]/10 motion-reduce:transition-none ${phoneError ? "border-[#C4200F]" : "border-[#E5E7EB] focus-within:border-[#F62E18]"}`}
              >
                <label
                  htmlFor="phone"
                  className="flex h-full shrink-0 items-center pl-4 pr-3 text-xl font-semibold tabular-nums text-[#1A1A1A]"
                >
                  +91
                </label>
                <span aria-hidden="true" className="h-6 w-px shrink-0 bg-[#E5E7EB]" />
                {/* Theme rules paint every input; ! keeps this one borderless inside the field. */}
                <input
                  id="phone"
                  ref={phoneInput}
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="10-digit number"
                  className="h-full min-w-0 flex-1 !border-0 bg-transparent pl-3 pr-4 text-xl font-semibold tabular-nums tracking-[0.02em] text-[#1A1A1A] !outline-none placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-[#6B6B6B]"
                  value={groupDigits(phone.slice(3))}
                  onChange={changeNationalNumber}
                  aria-invalid={phoneError ? true : undefined}
                  aria-describedby={phoneError ? "phone-error" : undefined}
                  required
                />
              </div>
            ) : (
              <input
                id="phone"
                ref={phoneInput}
                className={FIELD}
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setPhoneError("");
                }}
                autoComplete="tel"
                inputMode="tel"
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? "phone-error" : undefined}
                required
              />
            )}
          </>
        )}
        {!otpStage && phoneError ? (
          <p id="phone-error" role="alert" className="text-left text-sm font-medium text-[#C4200F]">
            {phoneError}
          </p>
        ) : null}

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
            {/* "Opening…" holds while the next page loads, so the button never looks ready again. */}
            <button
              className="craves-primary-action w-full"
              aria-busy={busy || stage === "done"}
              disabled={busy || stage === "done"}
            >
              {stage === "done" ? "Opening…" : busy ? "Signing in…" : "Verify OTP"}
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busy || resendIn > 0 || stage === "done"}
              onClick={() => void resendOtp()}
            >
              {resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend OTP"}
            </button>
          </>
        ) : (
          <button className="craves-primary-action w-full" aria-busy={busy} disabled={busy}>
            {busy ? "Requesting OTP…" : "Send OTP"}
          </button>
        )}
      </form>

      <p
        aria-live="polite"
        className="mt-4 text-sm leading-6 text-[#1A1A1A]"
      >
        {otpStatus === "error" ? null : message}
      </p>
      <p className="mt-4 text-xs leading-5 text-[#6B6B6B]">
        {chefJourney
          ? "Your OTP is used only to securely confirm your Craves account."
          : "Your phone number and OTP help securely confirm your Craves account."}
      </p>
    </section>
  );
}
