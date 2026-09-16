"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { chefEmailEligible, emailVerificationTiming, verificationEmail, EMAIL_VERIFICATION_MAX_LENGTH, type EmailVerificationState } from "@/lib/email-verification-contract";
import { createEmailSendAttempt, EmailVerificationClientError, fetchEmailVerification, type EmailSendAttempt } from "@/lib/email-verification-client";
import { captureSessionContext, getSession, getSessionEmailRevision, isSessionContextCurrent, isSessionReady, invalidateSession, loadSession, setSessionEmailVerification, subscribeSession, type SessionContext } from "@/services/auth/cravesAuth";

type Props = {
  initialEmail?: string;
  required?: boolean;
  onStateChange?: (state: EmailVerificationState | null) => void;
  onVerified?: (state: EmailVerificationState) => void;
};

const inputClass = "mt-2 min-h-12 w-full rounded-lg border border-border bg-white px-3 text-base text-ink focus:border-primary disabled:opacity-50";
const buttonClass = "min-h-11 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-secondary disabled:opacity-50";

export function EmailVerificationPanel({ initialEmail = "", required = false, onStateChange, onVerified }: Props) {
  const id = useId();
  const [state, setState] = useState<EmailVerificationState | null>(null);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [retrySend, setRetrySend] = useState<EmailSendAttempt | null>(null);
  const [clock, setClock] = useState({ now: 0, started: 0, server: 0 });
  const [context, setContext] = useState(captureSessionContext);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const callbacks = useRef({ onStateChange, onVerified });
  const observedContext = useRef(context);
  const canonicalRevision = useRef(-1);
  const stateRef = useRef<EmailVerificationState | null>(null);
  const initial = useRef(initialEmail);
  const allowInitialHydration = useRef(!getSession());
  useEffect(() => { callbacks.current = { onStateChange, onVerified }; }, [onStateChange, onVerified]);

  const accept = useCallback((next: EmailVerificationState, owner: SessionContext) => {
    if (!owner.identityId || !isSessionContextCurrent(owner) || !isSessionReady()) return null;
    if (next.emailRevision < getSessionEmailRevision()) {
      const current = getSession()!;
      next = { ...next, email: current.email ?? null, emailVerified: current.emailVerified,
        emailRevision: getSessionEmailRevision(), pending: null };
    }
    canonicalRevision.current = next.emailRevision;
    stateRef.current = next;
    setSessionEmailVerification(owner.identityId, next, owner);
    setState(next);
    const now = performance.now();
    setClock({ now, started: now, server: Date.parse(next.serverTime) });
    callbacks.current.onStateChange?.(next);
    return next;
  }, []);

  const rejectSession = useCallback(() => {
    setSessionExpired(true); setState(null); stateRef.current = null;
    setCode(""); setRetrySend(null); setNotice("");
    callbacks.current.onStateChange?.(null);
  }, []);

  // Session changes must invalidate both displayed data and callbacks, not only the global store setter.
  useEffect(() => {
    const update = () => {
      const next = captureSessionContext();
      if (next.generation !== observedContext.current.generation || next.identityId !== observedContext.current.identityId) {
        controller.current?.abort(); controller.current = null; inFlight.current = false;
        observedContext.current = next; canonicalRevision.current = -1;
        initial.current = ""; setEmail(""); rejectSession(); setError(""); setBusy(false); setContext(next);
      } else if (getSessionEmailRevision() > canonicalRevision.current && stateRef.current && isSessionReady()) {
        // Another mounted panel verified a replacement. Never keep an older canonical email or challenge visible.
        const current = getSession()!;
        const nextState = { ...stateRef.current, email: current.email ?? null, emailVerified: current.emailVerified,
          emailRevision: getSessionEmailRevision(), pending: null };
        canonicalRevision.current = nextState.emailRevision; stateRef.current = nextState;
        setState(nextState); setCode(""); setRetrySend(null);
        callbacks.current.onStateChange?.(nextState);
      }
    };
    const unsubscribe = subscribeSession(update); update();
    return unsubscribe;
  }, [rejectSession]);

  const validResponse = useCallback((current: AbortController, owner: SessionContext) =>
    controller.current === current && !current.signal.aborted && isSessionContextCurrent(owner) && isSessionReady(), []);

  const refresh = useCallback(async (manual = false) => {
    if (inFlight.current || !isSessionContextCurrent(context)) return;
    inFlight.current = true;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setError("");
    try {
      if (!context.identityId) {
        if (!manual && !allowInitialHydration.current) {
          rejectSession(); setError("Your session has expired. Sign in again to verify your email."); return;
        }
        allowInitialHydration.current = false;
        const restored = await loadSession(); // Establish the owner on a direct page load before issuing a verification request.
        if (!restored && controller.current === current && !current.signal.aborted) {
          rejectSession(); setError("Your session has expired. Sign in again to verify your email.");
        }
        return;
      }
      if (!isSessionReady()) { rejectSession(); return; }
      const next = await fetchEmailVerification(undefined, undefined, current.signal);
      const accepted = validResponse(current, context) ? accept(next, context) : null;
      if (!accepted) return;
      setSessionExpired(false);
      setEmail((value) => value || initial.current || accepted.email || "");
    } catch (caught) {
      if (!validResponse(current, context)) return;
      setError(caught instanceof Error ? caught.message : "Verification status is unavailable.");
      if (caught instanceof EmailVerificationClientError && (caught.status === 401 || caught.status === 403)) { invalidateSession(context); rejectSession(); }
    } finally {
      if (controller.current === current) { inFlight.current = false; if (!current.signal.aborted) setBusy(false); }
    }
  }, [accept, context, rejectSession, validResponse]);

  useEffect(() => {
    void refresh();
    return () => { controller.current?.abort(); controller.current = null; inFlight.current = false; };
  }, [refresh]);
  useEffect(() => {
    if (!state?.pending) return;
    const timer = window.setInterval(() => setClock((current) => ({ ...current, now: performance.now() })), 1000);
    return () => window.clearInterval(timer);
  }, [state?.pending]);

  async function send(attempt: EmailSendAttempt) {
    if (inFlight.current || !isSessionContextCurrent(context) || !isSessionReady()) return;
    inFlight.current = true;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setError(""); setNotice(""); setCode("");
    try {
      const next = await fetchEmailVerification(attempt.action, attempt.body, current.signal);
      const accepted = validResponse(current, context) ? accept(next, context) : null;
      if (!accepted) return;
      setRetrySend(null);
      setNotice(accepted.pending ? "Check the delivery status below and use your latest code if it arrives." : "Your verified email is up to date.");
    } catch (caught) {
      if (!validResponse(current, context)) return;
      const problem = caught instanceof EmailVerificationClientError ? caught : null;
      setError(caught instanceof Error ? caught.message : "The request could not be confirmed.");
      setRetrySend(!problem || problem.status >= 500 ? attempt : null);
      if (problem?.status === 401 || problem?.status === 403) { invalidateSession(context); rejectSession(); }
    } finally {
      if (controller.current === current) { inFlight.current = false; if (!current.signal.aborted) setBusy(false); }
    }
  }

  async function verify() {
    if (inFlight.current || !state?.pending || !/^\d{6}$/.test(code) || !isSessionContextCurrent(context) || !isSessionReady()) return;
    inFlight.current = true;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setError(""); setNotice("");
    const submitted = code; setCode("");
    try {
      const next = await fetchEmailVerification("verify", { challengeId: state.pending.challengeId, code: submitted }, current.signal);
      const accepted = validResponse(current, context) ? accept(next, context) : null;
      if (!accepted) return;
      setRetrySend(null);
      if (chefEmailEligible(accepted)) {
        setEmail(accepted.email ?? ""); setNotice("Email verified successfully."); callbacks.current.onVerified?.(accepted);
      }
    } catch (caught) {
      if (!validResponse(current, context)) return;
      setError(caught instanceof Error ? caught.message : "The code could not be confirmed.");
      if (caught instanceof EmailVerificationClientError && (caught.status === 401 || caught.status === 403)) { invalidateSession(context); rejectSession(); }
      // Never replay a code; recover from wrong/expired/exhausted codes or a lost response with a read.
      try {
        const next = await fetchEmailVerification(undefined, undefined, current.signal);
        if (validResponse(current, context) && accept(next, context)) setSessionExpired(false);
      } catch (lookupError) {
        if (validResponse(current, context) && lookupError instanceof EmailVerificationClientError && (lookupError.status === 401 || lookupError.status === 403)) { invalidateSession(context); rejectSession(); }
      }
    } finally {
      if (controller.current === current) { inFlight.current = false; if (!current.signal.aborted) setBusy(false); }
    }
  }

  const timing = state ? emailVerificationTiming(state, clock.server + Math.max(0, clock.now - clock.started)) : { expiresIn: 0, resendIn: 0 };
  const verified = chefEmailEligible(state);
  const pending = state?.pending;
  const disabled = busy || sessionExpired || !state;

  return (
    <section aria-labelledby={`${id}-title`} aria-busy={busy} className="rounded-xl border border-border bg-white p-5 text-ink">
      <h3 id={`${id}-title`} className="font-display text-lg font-semibold">Email verification{required ? " (required)" : " (optional)"}</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {required ? "Verify an email before completing your chef application. Chef approval is a separate step." : "Verify an email for account updates. You can continue as a customer and verify it later."}
      </p>
      {state && <p className="mt-3 text-sm break-words">{verified ? `Verified email: ${state.email}` : state.email ? `Email not verified: ${state.email}` : "No verified email yet."}</p>}
      {verified && pending && <p className="mt-2 text-sm text-muted-foreground">Your current verified email stays active until you confirm the replacement.</p>}
      <div className="mt-4">
        <label htmlFor={`${id}-email`} className="text-sm font-semibold">{verified ? "Change email" : "Email address"}</label>
        <input id={`${id}-email`} type="email" autoComplete="email" maxLength={EMAIL_VERIFICATION_MAX_LENGTH} value={email} disabled={busy || sessionExpired} className={inputClass} onChange={(event) => { setEmail(event.target.value); setError(""); }} />
        <button type="button" disabled={disabled || timing.resendIn > 0 || !verificationEmail.safeParse(email).success || !!retrySend} className={`${buttonClass} mt-3`} onClick={() => void send(createEmailSendAttempt("challenges", email))}>
          {verified && email.trim() === state?.email ? "Keep verified email" : pending ? "Send code to this address" : "Send email code"}
        </button>
      </div>
      {pending && <div className="mt-4 space-y-3 rounded-lg border border-border bg-white p-4">
        <p className="text-sm break-words">Verification address: <strong>{pending.maskedEmail}</strong></p>
        <p className="text-sm text-muted-foreground">{pending.deliveryStatus === "ACCEPTED" ? "The email service accepted the message. Check your inbox and spam folder." : pending.deliveryStatus === "PENDING" ? "Your email is queued. Refresh status if it has not arrived." : pending.deliveryStatus === "UNKNOWN" ? "Sending could not be confirmed. Check your inbox before requesting another code." : "The email service could not send the message. Try again when resend is available."}</p>
        <p className="text-sm">{timing.expiresIn > 0 ? `Code expires in ${Math.floor(timing.expiresIn / 60)}m ${timing.expiresIn % 60}s.` : "This code has expired. Request a new code."}</p>
        <div>
          <label htmlFor={`${id}-code`} className="text-sm font-semibold">Six-digit email code</label>
          <input id={`${id}-code`} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} disabled={disabled || timing.expiresIn === 0} className={inputClass} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary disabled:opacity-50" disabled={disabled || timing.expiresIn === 0 || !/^\d{6}$/.test(code)} onClick={() => void verify()}>Verify email</button>
          <button type="button" className={buttonClass} disabled={disabled || timing.resendIn > 0 || !!retrySend} onClick={() => void send(createEmailSendAttempt("resend", pending.challengeId))}>{timing.resendIn > 0 ? `Resend in ${timing.resendIn}s` : "Resend email code"}</button>
        </div>
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-contrast-red">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
      {busy && <p role="status" className="mt-3 text-sm text-muted-foreground">Checking email verification…</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        {retrySend && <button type="button" className={buttonClass} disabled={busy || sessionExpired} onClick={() => void send(retrySend)}>Retry send request</button>}
        <button type="button" className={buttonClass} disabled={busy} onClick={() => void refresh(true)}>Refresh verification status</button>
      </div>
    </section>
  );
}
