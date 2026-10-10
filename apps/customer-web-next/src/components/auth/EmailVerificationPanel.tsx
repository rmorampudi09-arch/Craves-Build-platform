"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { chefEmailEligible, emailVerificationTiming, verificationEmail, EMAIL_VERIFICATION_MAX_LENGTH, type EmailVerificationState } from "@/lib/email-verification-contract";
import { createEmailSendAttempt, EmailVerificationClientError, fetchEmailVerification, type EmailSendAttempt } from "@/lib/email-verification-client";
import { captureSessionContext, getSession, getSessionEmailRevision, isSessionContextCurrent, isSessionReady, invalidateSession, loadSession, setSessionEmailVerification, subscribeSession, type SessionContext } from "@/services/auth/cravesAuth";

type Props = {
  initialEmail?: string;
  required?: boolean;
  compact?: boolean;
  /** "onboarding" renders the Chef onboarding field style (label, 56px input, inline Verified badge). */
  variant?: "default" | "onboarding";
  onStateChange?: (state: EmailVerificationState | null) => void;
  onVerified?: (state: EmailVerificationState) => void;
};

const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#1A1A1A] outline-none focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10 disabled:opacity-50";
const buttonClass = "min-h-10 rounded-xl border border-[#E5E7EB] bg-[#F1F3F5] px-4 text-xs font-black text-[#1A1A1A] hover:bg-white disabled:opacity-50";

function matchesVerifiedEmail(state: EmailVerificationState | null, email: string | null) {
  return email !== null && chefEmailEligible(state) && !state?.pending &&
    state?.email?.trim().toLocaleLowerCase("en-IN") === email.trim().toLocaleLowerCase("en-IN");
}

export function EmailVerificationPanel({ initialEmail = "", required = false, compact = false, variant = "default", onStateChange, onVerified }: Props) {
  const id = useId();
  const [state, setState] = useState<EmailVerificationState | null>(null);
  const [email, setEmail] = useState(initialEmail);
  // Responses expose only a masked pending recipient, including after sends/retries.
  // Never infer that it belongs to the draft: another tab may have replaced it.
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [retrySend, setRetrySend] = useState<EmailSendAttempt | null>(null);
  const [clock, setClock] = useState({ now: 0, started: 0, server: 0 });
  const [context, setContext] = useState(captureSessionContext);
  const inFlight = useRef(false);
  const editedDraft = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const callbacks = useRef({ onStateChange, onVerified });
  const observedContext = useRef(context);
  const canonicalRevision = useRef(-1);
  const stateRef = useRef<EmailVerificationState | null>(null);
  const initial = useRef(initialEmail);
  const allowInitialHydration = useRef(!getSession());
  useEffect(() => { callbacks.current = { onStateChange, onVerified }; }, [onStateChange, onVerified]);

  const accept = useCallback((next: EmailVerificationState, owner: SessionContext, verifiedResponse = false) => {
    if (!owner.identityId || !isSessionContextCurrent(owner) || !isSessionReady()) return null;
    if (next.emailRevision < getSessionEmailRevision()) {
      const current = getSession()!;
      next = { ...next, email: current.email ?? null, emailVerified: current.emailVerified,
        emailRevision: getSessionEmailRevision(), pending: null };
    }
    if (chefEmailEligible(next) && !next.pending && (verifiedResponse ||
      matchesVerifiedEmail(next, editedDraft.current))) {
      editedDraft.current = null;
    }
    canonicalRevision.current = next.emailRevision;
    stateRef.current = next;
    setSessionEmailVerification(owner.identityId, next, owner);
    setState(next);
    const now = performance.now();
    setClock({ now, started: now, server: Date.parse(next.serverTime) });
    callbacks.current.onStateChange?.(editedDraft.current !== null ? null : next);
    return next;
  }, []);

  const abandonRequest = useCallback(() => {
    controller.current?.abort(); controller.current = null; inFlight.current = false;
    setBusy(false);
  }, []);

  function editEmail(value: string) {
    abandonRequest();
    const restored = matchesVerifiedEmail(stateRef.current, value);
    editedDraft.current = restored ? null : value;
    setEditing(true); setEmail(value);
    callbacks.current.onStateChange?.(restored ? stateRef.current : null);
    setCode(""); setRetrySend(null); setError(""); setNotice("");
  }

  const rejectSession = useCallback(() => {
    setSessionExpired(true); setState(null); stateRef.current = null; editedDraft.current = null;
    setCode(""); setRetrySend(null); setNotice(""); setEditing(false);
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
        abandonRequest();
        const current = getSession()!;
        const nextState = { ...stateRef.current, email: current.email ?? null, emailVerified: current.emailVerified,
          emailRevision: getSessionEmailRevision(), pending: null };
        if (matchesVerifiedEmail(nextState, editedDraft.current)) editedDraft.current = null;
        canonicalRevision.current = nextState.emailRevision; stateRef.current = nextState;
        setState(nextState); setCode(""); setRetrySend(null);
        callbacks.current.onStateChange?.(editedDraft.current !== null ? null : nextState);
      }
    };
    const unsubscribe = subscribeSession(update); update();
    return unsubscribe;
  }, [abandonRequest, rejectSession]);

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
      setRetrySend(null); setEditing(false);
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
    if (inFlight.current || editing || !state?.pending || !/^\d{6}$/.test(code) || !isSessionContextCurrent(context) || !isSessionReady()) return;
    inFlight.current = true;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setError(""); setNotice("");
    const submitted = code; setCode("");
    try {
      const next = await fetchEmailVerification("verify", { challengeId: state.pending.challengeId, code: submitted }, current.signal);
      const accepted = validResponse(current, context) ? accept(next, context, true) : null;
      if (!accepted) return;
      setRetrySend(null);
      if (chefEmailEligible(accepted) && !accepted.pending && editedDraft.current === null) {
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
  const pending = editing ? null : state?.pending;
  const displayedEmail = pending ? "" : email;
  const disabled = busy || sessionExpired || !state;

  if (variant === "onboarding") {
    const sameVerifiedEmail =
      (!editing || !state?.pending) && verified &&
      Boolean(state?.email) &&
      displayedEmail.trim().toLocaleLowerCase("en-IN") === state?.email?.trim().toLocaleLowerCase("en-IN");
    const validEmail = Boolean(email.trim()) && verificationEmail.safeParse(email).success;
    const resendLabel = timing.resendIn > 0 ? `Resend code in ${timing.resendIn}s` : "Resend code";
    return (
      <div className="cob-field" aria-busy={busy}>
        <label htmlFor={`${id}-email`} className="cob-label">
          Email address
        </label>
        <div className="cob-control">
          <input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={EMAIL_VERIFICATION_MAX_LENGTH}
            value={displayedEmail}
            disabled={sessionExpired}
            readOnly={busy}
            placeholder={pending ? pending.maskedEmail : "you@example.com"}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={`${id}-email-help`}
            className="cob-input cob-input--with-adornment"
            onChange={(event) => editEmail(event.target.value)}
          />
          <span className="cob-adornment">
            {busy && !pending ? (
              <span className="cob-spinner cob-spinner--red" aria-hidden="true" />
            ) : sameVerifiedEmail ? (
              <span className="cob-verified">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>
                Verified
              </span>
            ) : !pending ? (
              <button
                type="button"
                className="cob-inline-action"
                aria-label="Send email code"
                disabled={disabled || !!retrySend}
                onClick={() => {
                  if (!validEmail) {
                    setError("Enter a valid email address, for example name@example.com.");
                    return;
                  }
                  void send(createEmailSendAttempt("challenges", email));
                }}
              >
                Verify
              </button>
            ) : null}
          </span>
        </div>
        {pending ? (
          <div className="cob-field" style={{ marginTop: 6 }}>
            <label htmlFor={`${id}-code`} className="cob-label">
              Enter the 6-digit code
            </label>
            <span className="cob-helper" style={{ marginTop: -4 }}>
              {pending.deliveryStatus === "UNAVAILABLE"
                ? "We couldn’t send the email. Try again when resend is available."
                : `We sent a code to ${pending.maskedEmail}. Check your inbox and spam folder.`}
            </span>
            <div className="cob-control">
              <input
                id={`${id}-code`}
                aria-label="Six-digit email code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                disabled={disabled || timing.expiresIn === 0}
                placeholder="000000"
                className="cob-input cob-input--with-adornment cob-mono"
                style={{ letterSpacing: code ? "0.3em" : undefined, fontWeight: 700 }}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <span className="cob-adornment">
                <button
                  type="button"
                  className="cob-inline-action"
                  disabled={disabled || timing.expiresIn === 0 || !/^\d{6}$/.test(code)}
                  onClick={() => void verify()}
                >
                  Verify email
                </button>
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 16px" }}>
              <button
                type="button"
                className="cob-link"
                disabled={disabled || timing.resendIn > 0 || !!retrySend}
                onClick={() => void send(createEmailSendAttempt("resend", pending.challengeId))}
              >
                {resendLabel}
              </button>
              <span className="cob-helper">
                {timing.expiresIn > 0
                  ? `Code expires in ${Math.floor(timing.expiresIn / 60)}:${String(timing.expiresIn % 60).padStart(2, "0")}`
                  : "This code has expired. Request a new code."}
              </span>
            </div>
          </div>
        ) : null}
        {error ? (
          <span id={`${id}-email-help`} role="alert" className="cob-error">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            <span>
              {error}
              {retrySend ? (
                <>
                  {" "}
                  <button type="button" className="cob-link" style={{ minHeight: 0, display: "inline" }} disabled={busy || sessionExpired} onClick={() => void send(retrySend)}>
                    Try again
                  </button>
                </>
              ) : null}
            </span>
          </span>
        ) : notice && sameVerifiedEmail ? (
          <span id={`${id}-email-help`} role="status" className="cob-success-line">
            {notice}
          </span>
        ) : (
          <span id={`${id}-email-help`} className="cob-helper">
            {sameVerifiedEmail
              ? "Confirmed for your Craves account."
              : pending
                ? "Enter the code for the masked verification address above, or edit your email to send a new code."
                : required
                  ? "We’ll send a 6-digit code to verify your email."
                  : "Optional. Verify it to receive account updates."}
          </span>
        )}
        <button type="button" aria-label="Refresh verification status" className="sr-only" disabled={busy} onClick={() => void refresh(true)}>
          Refresh verification status
        </button>
      </div>
    );
  }

  if (compact) {
    const sameVerifiedEmail =
      (!editing || !state?.pending) && verified &&
      Boolean(state?.email) &&
      displayedEmail.trim().toLocaleLowerCase("en-IN") ===
        state?.email?.trim().toLocaleLowerCase("en-IN");
    const canSend =
      !pending &&
      Boolean(email.trim()) &&
      verificationEmail.safeParse(email).success;

    return (
      <section
        aria-label="Email"
        aria-busy={busy}
        className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor={`${id}-email`}
            className="text-sm font-semibold text-[#1A1A1A]"
          >
            Email <span className="font-medium text-[#6B6B6B]">{required ? "(required)" : "(optional)"}</span>
          </label>
          {sameVerifiedEmail ? (
            <span className="rounded-full bg-[#EDF7EE] px-2.5 py-1 text-[0.68rem] font-bold text-[#2E7D32]">
              Verified
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex gap-2">
          <input
            id={`${id}-email`}
            aria-label="Email address"
            type="email"
            autoComplete="email"
            maxLength={EMAIL_VERIFICATION_MAX_LENGTH}
            value={displayedEmail}
            disabled={busy || sessionExpired}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#1A1A1A] outline-none focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10 disabled:opacity-50"
            placeholder={pending ? pending.maskedEmail : "you@example.com"}
            onChange={(event) => editEmail(event.target.value)}
          />
          {!sameVerifiedEmail && canSend ? (
            <button
              type="button"
              aria-label="Send email code"
              disabled={disabled || !!retrySend}
              className="min-h-12 shrink-0 rounded-xl bg-[#F62E18] px-4 text-xs font-black text-white disabled:opacity-50"
              onClick={() =>
                void send(createEmailSendAttempt("challenges", email))
              }
            >
              Verify
            </button>
          ) : null}
        </div>

        {pending ? (
          <div className="mt-3 rounded-xl border border-[#E5E7EB] bg-white p-3">
            <p className="text-xs text-[#6B6B6B]">Verification address: {pending.maskedEmail}</p>
            <label
              htmlFor={`${id}-code`}
              className="text-xs font-semibold text-[#1A1A1A]"
            >
              Enter the 6-digit code
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id={`${id}-code`}
                aria-label="Six-digit email code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                disabled={disabled || timing.expiresIn === 0}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-center text-base font-bold tracking-[0.24em] text-[#1A1A1A] outline-none focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10"
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
              <button
                type="button"
                className="min-h-11 rounded-xl bg-[#F62E18] px-4 text-xs font-black text-white disabled:opacity-50"
                disabled={
                  disabled ||
                  timing.expiresIn === 0 ||
                  !/^\d{6}$/.test(code)
                }
                onClick={() => void verify()}
              >
                Verify email
              </button>
            </div>
            <button
              type="button"
              className="mt-2 text-xs font-bold text-[#F62E18] disabled:text-[#9CA3AF]"
              disabled={disabled || timing.resendIn > 0 || !!retrySend}
              onClick={() =>
                void send(createEmailSendAttempt("resend", pending.challengeId))
              }
            >
              {timing.resendIn > 0
                ? `Resend in ${timing.resendIn}s`
                : "Resend email code"}
            </button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-2 text-xs font-semibold text-[#C92716]">
            {error}
            {retrySend ? <button type="button" className="mt-2 text-xs font-bold text-[#F62E18] disabled:text-[#9CA3AF]" disabled={busy || sessionExpired} onClick={() => void send(retrySend)}>Retry send request</button> : null}
          </p>
        ) : null}
        {notice && sameVerifiedEmail ? (
          <p role="status" className="mt-2 text-xs font-semibold text-[#2E7D32]">
            {notice}
          </p>
        ) : null}

        <button
          type="button"
          aria-label="Refresh verification status"
          className="sr-only"
          disabled={busy}
          onClick={() => void refresh(true)}
        >
          Refresh verification status
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${id}-title`} aria-busy={busy} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 text-[#1A1A1A] shadow-[0_8px_24px_rgba(26,26,26,0.04)] sm:p-5">
      <h3 id={`${id}-title`} className="font-display text-base font-black sm:text-lg">Email verification{required ? " (required)" : " (optional)"}</h3>
      <p className="mt-2 text-sm text-[#6B6B6B]">
        {required ? "Verify an email before completing your chef application. Chef approval is a separate step." : "Verify an email for account updates. You can continue as a customer and verify it later."}
      </p>
      {state && <p className="mt-3 text-sm break-words">{verified ? `Verified email: ${state.email}` : state.email ? `Email not verified: ${state.email}` : "No verified email yet."}</p>}
      {verified && pending && <p className="mt-2 text-sm text-[#6B6B6B]">Your current verified email stays active until you confirm the replacement.</p>}
      <div className="mt-4">
        <label htmlFor={`${id}-email`} className="text-sm font-semibold">{verified ? "Change email" : "Email address"}</label>
        <input id={`${id}-email`} type="email" autoComplete="email" maxLength={EMAIL_VERIFICATION_MAX_LENGTH} value={displayedEmail} disabled={busy || sessionExpired} className={inputClass} placeholder={pending ? pending.maskedEmail : "you@example.com"} onChange={(event) => editEmail(event.target.value)} />
        <button type="button" disabled={disabled || !!pending || !verificationEmail.safeParse(email).success || !!retrySend} className={`${buttonClass} mt-3`} onClick={() => void send(createEmailSendAttempt("challenges", email))}>
          {verified && email.trim() === state?.email ? "Keep verified email" : pending ? "Send code to this address" : "Send email code"}
        </button>
      </div>
      {pending && <div className="mt-4 space-y-3 rounded-lg border border-[#E5E7EB] bg-white p-4">
        <p className="text-sm break-words">Verification address: <strong>{pending.maskedEmail}</strong></p>
        <p className="text-sm text-[#6B6B6B]">{pending.deliveryStatus === "ACCEPTED" ? "The email service accepted the message. Check your inbox and spam folder." : pending.deliveryStatus === "PENDING" ? "Your email is queued. Refresh status if it has not arrived." : pending.deliveryStatus === "UNKNOWN" ? "Sending could not be confirmed. Check your inbox before requesting another code." : "The email service could not send the message. Try again when resend is available."}</p>
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
      {busy && <p role="status" className="mt-3 text-sm text-[#6B6B6B]">Checking email verification…</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        {retrySend && <button type="button" className={buttonClass} disabled={busy || sessionExpired} onClick={() => void send(retrySend)}>Retry send request</button>}
        <button type="button" className={buttonClass} disabled={busy} onClick={() => void refresh(true)}>Refresh verification status</button>
      </div>
    </section>
  );
}
