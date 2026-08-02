"use client";

import { useEffect, useRef, useState } from "react";
import { ChefHat, UserRound, X } from "lucide-react";
import { type ConfirmationResult, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { getFirebaseBrowserClient } from "@/lib/firebase-client";
import { setSessionIdentity, type CravesUser } from "@/services/auth/cravesAuth";
import type { CravesIdentity } from "@/lib/auth-contract";

type Mode = "login" | "register";
export type AccountMode = "customer" | "chef";

interface AuthModalProps {
  open: boolean;
  mode: Mode;
  onClose: () => void;
  onSwitchMode: (mode: Mode) => void;
  onAuthenticated?: (user: CravesUser, accountMode: AccountMode) => void;
}

export function AuthModal({ open, mode, onClose, onSwitchMode, onAuthenticated }: AuthModalProps) {
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [accountMode, setAccountMode] = useState<AccountMode>("customer");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => () => {
    verifier.current?.clear();
    verifier.current = null;
  }, []);

  if (!open) return null;

  const reset = () => {
    verifier.current?.clear();
    verifier.current = null;
    confirmation.current = null;
    setPhone("");
    setUsername("");
    setAccountMode("customer");
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
      callback: () => setInfo("Security check completed. You can request the OTP."),
      "expired-callback": () => setInfo("The security check expired. Complete it again."),
    });
    await instance.render();
    verifier.current = instance;
    return instance;
  }

  const handleGenerateOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    if (!/^\d{10}$/.test(phone)) return setError("Enter a valid 10-digit mobile number");
    if (mode === "register" && username.trim().length < 2) return setError("Please enter your full name");
    setBusy(true);
    try {
      const { auth } = getFirebaseBrowserClient();
      confirmation.current = await signInWithPhoneNumber(auth, `+91${phone}`, await recaptcha());
      setOtpSent(true);
      setInfo("OTP sent securely through Firebase.");
    } catch (caught) {
      verifier.current?.clear();
      verifier.current = null;
      const code = caught && typeof caught === "object" && "code" in caught ? String(caught.code) : "";
      setError(code.includes("too-many-requests") ? "Too many OTP attempts. Please try again later." : "OTP could not be sent. Check the number and try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!confirmation.current || !/^\d{6}$/.test(otp)) return setError("Enter the six-digit OTP.");
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
      const body = await response.json().catch(() => null) as { identity?: CravesIdentity; message?: string } | null;
      if (!response.ok || !body?.identity) throw new Error(body?.message ?? "Sign-in failed.");
      let user = setSessionIdentity(body.identity);

      if (mode === "register") {
        const parts = username.trim().split(/\s+/);
        const firstName = parts.shift() ?? "Customer";
        const lastName = parts.join(" ") || "Customer";
        const profileResponse = await fetch("/api/customer/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ firstName, lastName, email: null }),
        }).catch(() => null);
        if (profileResponse?.ok) user = { ...user, username: username.trim() };
      }

      onAuthenticated?.(user, accountMode);
      reset();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The OTP could not be verified.");
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (next: Mode) => {
    reset();
    onSwitchMode(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={handleClose}>
      <div className="relative max-h-[95vh] w-full max-w-md overflow-y-auto rounded-2xl bg-cream shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-xl font-bold text-ink">{mode === "login" ? "Login" : "Sign Up"}</h2>
          <button type="button" onClick={handleClose} className="rounded-full p-1 text-ink hover:bg-black/5" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-6">
          <h3 className="text-2xl font-bold text-ink">Welcome to <span className="text-primary">CRAVES</span></h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Your OTP is verified by Firebase. Craves access and refresh tokens stay in secure HTTP-only cookies.</p>
          <fieldset className="mt-5" disabled={otpSent || busy}>
            <legend className="text-xs font-bold uppercase tracking-wide text-ink">
              {mode === "register" ? "I want to register as" : "Continue as"}
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button type="button" aria-pressed={accountMode === "customer"} onClick={() => setAccountMode("customer")} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${accountMode === "customer" ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-ink"}`}>
                <UserRound className="h-4 w-4" /> Customer
              </button>
              <button type="button" aria-pressed={accountMode === "chef"} onClick={() => setAccountMode("chef")} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${accountMode === "chef" ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-ink"}`}>
                <ChefHat className="h-4 w-4" /> Home Chef
              </button>
            </div>
            {accountMode === "chef" && <p className="mt-2 text-xs leading-5 text-muted-foreground">You will continue to chef application or chef mode after OTP. Chef access is granted only after admin approval.</p>}
          </fieldset>
          <form onSubmit={otpSent ? handleVerify : handleGenerateOtp} className="mt-6 space-y-4">
            <div className="flex items-stretch overflow-hidden rounded-lg border border-border bg-white">
              <span className="flex items-center gap-1 border-r border-border px-3 text-sm font-medium text-ink">🇮🇳 <span>+91</span></span>
              <input type="tel" inputMode="numeric" maxLength={10} placeholder="Enter mobile number" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))} className="w-full bg-white px-3 py-3 text-sm text-ink outline-none placeholder:text-muted-foreground" disabled={otpSent || busy} autoComplete="tel" required />
            </div>
            {mode === "register" && !otpSent && (
              <input type="text" placeholder="Enter full name" value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-3 text-sm text-ink outline-none placeholder:text-muted-foreground" disabled={busy} required />
            )}
            {!otpSent && <div id="craves-recaptcha" className="min-h-20 overflow-hidden rounded-lg bg-white p-2" />}
            {otpSent && (
              <input type="text" inputMode="numeric" maxLength={6} placeholder="Enter OTP" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} className="w-full rounded-lg border border-border bg-white px-3 py-3 text-center text-lg tracking-[0.4em] text-ink outline-none placeholder:text-muted-foreground" autoComplete="one-time-code" autoFocus required />
            )}
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
            {info && !error && <p className="rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary">{info}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center rounded-lg py-3 text-base disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? "Please wait…" : otpSent ? (mode === "login" ? "Login" : "Sign Up") : "Generate OTP"}
            </button>
            {otpSent && <button type="button" disabled={busy} onClick={() => { confirmation.current = null; setOtp(""); setOtpSent(false); setInfo("Request a new OTP."); }} className="w-full text-sm font-semibold text-primary hover:underline">Use another number</button>}
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? <>Don&apos;t have an account? <button type="button" onClick={() => switchTo("register")} className="font-semibold text-primary hover:underline">Sign Up</button></> : <>Already have an account? <button type="button" onClick={() => switchTo("login")} className="font-semibold text-primary hover:underline">Login</button></>}
          </p>
        </div>
      </div>
    </div>
  );
}
