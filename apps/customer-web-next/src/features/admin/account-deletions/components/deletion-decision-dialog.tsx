"use client";

import { useEffect, useId, useRef, useState } from "react";
import { parseAdminSummary, parseOpenItems } from "@/features/account-deletion/domain/deletion-contract";
import type { AdminDeletionBlocker } from "@/features/account-deletion/domain/deletion-types";
import {
  codeOf, COULDNT_CHECK, deletionError, needsRefresh, OPEN_ITEMS, UNREACHABLE,
} from "@/features/admin/account-deletions/lib/admin-deletion-client";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";

export type DeletionDecision = "approve" | "reject";
const COPY = {
  approve: { title: "Approve deletion request", button: "Approve request", intro: "Approving lets this deletion go ahead. The reason is saved with your decision." },
  reject: { title: "Reject deletion request", button: "Reject request", intro: "Rejecting closes this request without deleting anything. The reason is saved with your decision." },
};
const MIN = 10;
const MAX = 500;
/** `refresh`: the request must be reloaded before anything else (it changed, or the decision may have been saved). */
type Failure = { message: string; blockers: AdminDeletionBlocker[]; refresh: boolean };

/** Why Approve was refused, one line per open item. */
const blockerLine = ({ service, code, detail }: AdminDeletionBlocker) =>
  code === UNREACHABLE ? `${service}: ${COULDNT_CHECK}` : `${service}: ${code}${detail ? `. ${detail}` : ""}`;

/** Asks for the reason, sends the decision, and says why it was refused. Closes only on Cancel or after a saved decision. */
export function DeletionDecisionDialog({ requestId, action, onCancel, onDecided, onRefresh }: {
  requestId: string;
  action: DeletionDecision;
  onCancel: () => void;
  onDecided: (action: DeletionDecision) => void;
  onRefresh: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const copy = COPY[action];
  const ready = reason.trim().length >= MIN && reason.trim().length <= MAX;

  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const fail = (code: string | undefined) => setFailure({ message: deletionError(code, "decide"), blockers: [], refresh: needsRefresh(code) });

  async function send() {
    if (busy || !ready) return;
    setBusy(true);
    setFailure(null);
    try {
      const response = await adminFetch(`/api/admin/account-deletions/${encodeURIComponent(requestId)}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }), cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) return parseAdminSummary(body) ? onDecided(action) : fail("INVALID_DELETION_RESPONSE");
      const code = codeOf(body);
      const blockers = code === OPEN_ITEMS ? parseOpenItems(body) : null;
      if (blockers) setFailure({ message: "Approval is blocked while these items are open.", blockers, refresh: false });
      else fail(code);
    } catch {
      // The connection dropped: the decision may have been saved.
      fail("ACCOUNT_DELETION_UNAVAILABLE");
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="cr-dialog w-[calc(100vw-2rem)] max-w-lg" aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div className="space-y-4 p-6">
      <h2 id={`${id}-title`}>{copy.title}</h2>
      <p id={`${id}-intro`} className="cr-muted">{copy.intro}</p>
      <label className="block text-xs font-bold text-slate-600" htmlFor={`${id}-reason`}>Reason (10 to 500 characters)
        <textarea id={`${id}-reason`} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950" rows={4}
          maxLength={MAX} value={reason} disabled={busy || failure?.refresh} onChange={event => setReason(event.target.value)} />
      </label>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-600">
        <span>{action === "reject" ? "The person will see this reason." : ""}</span>
        <span>{reason.length} / {MAX}</span>
      </div>
      {failure ? <div role="alert" className="cr-error-text space-y-2">
        <p>{failure.message}</p>
        {failure.blockers.length ? <ul className="list-disc space-y-1 pl-5">{failure.blockers.map(item => <li key={`${item.service}-${item.code}`}>{blockerLine(item)}</li>)}</ul> : null}
      </div> : null}
      <div className="cr-actions justify-end">
        <button type="button" className="cr-button" disabled={busy} onClick={onCancel}>Cancel</button>
        {failure?.refresh
          ? <button type="button" className="cr-button cr-primary" onClick={onRefresh}>Refresh</button>
          : <button type="button" className="cr-button cr-primary" disabled={busy || !ready} onClick={() => { void send(); }}>{busy ? "Saving..." : copy.button}</button>}
      </div>
    </div>
  </dialog>;
}
