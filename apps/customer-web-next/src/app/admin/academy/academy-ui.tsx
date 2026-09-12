"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowRight, Check, ChevronLeft, LockKeyhole, RefreshCw, ShieldCheck, WifiOff, X } from "lucide-react";
import { academyProblem, academyReturnTo } from "@/lib/academy-ux-state";

export function useAcademyConnection() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}
export function AcademyNotice({ children, success = false, onDismiss }: { children: ReactNode; success?: boolean; onDismiss?: () => void }) {
  return <div className={`ca-notice ${success ? "ca-notice-success" : ""}`} role="status">
    {success ? <Check size={18} /> : <AlertCircle size={18} />}<span>{children}</span>
    {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss notification"><X size={16} /></button>}
  </div>;
}
export function AcademyErrorState({ error, onRetry, compact = false, busy = false }: { error: unknown; onRetry?: () => void; compact?: boolean; busy?: boolean }) {
  const titleId = useId();
  const online = useAcademyConnection();
  const problem = academyProblem(error, !online);
  const [remaining, setRemaining] = useState(problem.retryAfter);
  const retrySeconds = problem.retryAfter;
  useEffect(() => {
    setRemaining(retrySeconds);
    if (!retrySeconds) return;
    const deadline = Date.now() + retrySeconds * 1000;
    const interval = setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 1000);
    return () => clearInterval(interval);
  }, [error, retrySeconds]);
  const [returnTo, setReturnTo] = useState("/admin/academy");
  useEffect(() => setReturnTo(academyReturnTo(window.location.search)), []);
  const Icon = problem.kind === "offline" ? WifiOff : problem.kind === "session" || problem.kind === "permission" ? LockKeyhole : AlertCircle;
  return <section className={`ca-error-state ${compact ? "ca-error-compact" : ""}`} aria-labelledby={titleId}>
    <span className="ca-state-icon"><Icon size={compact ? 23 : 32} /></span>
    <div><span className="ca-kicker">{problem.kind === "permission" ? "ACCESS PROTECTED" : "LET’S GET YOU BACK ON TRACK"}</span>
      <h2 id={titleId}>{problem.title}</h2><p role="alert">{problem.description}</p>
      <div className="ca-row">
        {problem.kind === "session" ? <Link className="ca-primary" href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>Administrator sign in<ArrowRight size={16} /></Link> : problem.retryable && onRetry ? <button className="ca-primary" disabled={busy || !online || remaining > 0} onClick={onRetry}><RefreshCw size={16} className={busy ? "ca-spin" : ""} />{busy ? "Reconnecting…" : remaining > 0 ? `Try again in ${remaining}s` : "Try again"}</button> : null}
        {!compact && <Link className="ca-secondary" href="/admin"><ChevronLeft size={16} />Back to administration</Link>}
      </div>
    </div>
  </section>;
}
export function AcademySkeleton({ area = "dashboard" }: { area?: "dashboard" | "source" | "plans" | "report" }) {
  return <div className={`ca-loading ca-loading-${area}`} role="status" aria-label={`Loading ${area === "dashboard" ? "your learning workspace" : area}`} aria-busy="true">
    <span className="ca-sr-only">Loading. No learning results are being shown yet.</span>
    <div aria-hidden="true">
      <div className="ca-loading-heading"><span className="ca-skeleton ca-skeleton-line" /><span className="ca-skeleton ca-skeleton-title" /></div>
      {area === "dashboard" && <><div className="ca-loading-stats">{[0,1,2,3].map(i => <div className="ca-panel" key={i}><span className="ca-skeleton ca-skeleton-icon" /><span className="ca-skeleton ca-skeleton-line" /><span className="ca-skeleton ca-skeleton-value" /></div>)}</div><div className="ca-loading-hero ca-skeleton" /></>}
      {area === "source" ? <div className="ca-loading-code">{[0,1,2,3,4,5,6,7].map(i => <span key={i} className="ca-skeleton ca-code-line" style={{ width: `${48 + (i % 3) * 19}%` }} />)}</div> : <div className="ca-loading-grid">{[0,1,2].map(i => <div className="ca-panel" key={i}><span className="ca-skeleton ca-skeleton-cover" /><span className="ca-skeleton ca-skeleton-title" /><span className="ca-skeleton ca-skeleton-line" /><span className="ca-skeleton ca-skeleton-line" /></div>)}</div>}
    </div>
  </div>;
}
export function AcademyDeleteDialog({ title, busy, error, onCancel, onConfirm }: { title: string; busy: boolean; error: unknown; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = dialog.current; const previous = document.activeElement;
    node?.showModal(); cancel.current?.focus();
    return () => { node?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="ca-delete-dialog" aria-labelledby="ca-delete-title" aria-describedby="ca-delete-description"
    onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <span className="ca-state-icon"><ShieldCheck size={26} /></span><span className="ca-kicker">PRIVATE ROADMAP</span>
    <h2 id="ca-delete-title">Delete this plan?</h2><p id="ca-delete-description">“{title}” will be removed from the internal roadmap. This does not change a deployed service.</p>
    {Boolean(error) && <AcademyErrorState error={error} compact />}
    <div className="ca-row"><button ref={cancel} className="ca-secondary" disabled={busy} onClick={onCancel}>Keep plan</button><button className="ca-primary" disabled={busy} onClick={onConfirm}>{busy ? <RefreshCw className="ca-spin" size={16} /> : null}{busy ? "Deleting…" : "Delete plan"}</button></div>
  </dialog>;
}
