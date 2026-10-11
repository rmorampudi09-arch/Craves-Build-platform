"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { formatAdminTimestamp, readableAdminStatus } from "@/features/admin/shell/lib/admin-navigation";

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED"] as const;
type SupportStatus = (typeof STATUSES)[number];
type SupportCase = {
  id: string; caseNumber: string; requesterIdentityId: string; requesterRole: string; orderId: string | null;
  subject: string; status: SupportStatus; assignedToIdentityId: string | null; createdAt: string; updatedAt: string;
};
type SupportMessage = { id: string; senderRole: string; body: string; internalNote: boolean; createdAt: string };
type SupportCaseDetail = { supportCase: SupportCase; messages: SupportMessage[] };
type SupportCasePage = { cases: SupportCase[]; nextCursor: string | null; hasMore: boolean };

const ASSISTANT_PREFIX = "[Opened by Craves support assistant]";

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await adminFetch("/api/admin/support/cases" + path, {
    method, cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.message ?? "This support operation could not be completed.");
  return result as T;
}

export function AdminSupportInbox() {
  const [status, setStatus] = useState<SupportStatus | null>("OPEN");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading support cases…");

  const load = useCallback(async (after: string | null) => {
    setBusy(true);
    try {
      const query = new URLSearchParams({ assignedToMe: String(assignedToMe) });
      if (status) query.set("status", status);
      if (after) query.set("cursor", after);
      const page = await api<SupportCasePage>(`?${query}`);
      setCases(current => after ? [...current, ...page.cases] : page.cases);
      setCursor(page.hasMore ? page.nextCursor : null);
      setMessage(after || page.cases.length ? "" : "No support cases match this filter.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Support cases are unavailable.");
    } finally {
      setBusy(false);
    }
  }, [status, assignedToMe]);

  useEffect(() => { void load(null); }, [load]);

  return <section className="rounded-[30px] bg-white p-6 text-slate-950">
    <div className="flex flex-wrap items-center gap-3">
      {[null, ...STATUSES].map(value => <button key={value ?? "ALL"} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}
        className={`rounded-2xl px-4 py-2 text-sm font-bold ${status === value ? "bg-[#6930CA] text-white" : "border border-[#cfc4d7] bg-white text-[#5f506b]"}`}>
        {value ? readableAdminStatus(value) : "All"}
      </button>)}
      <label className="ml-auto flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={assignedToMe} onChange={event => setAssignedToMe(event.target.checked)} className="h-4 w-4" />
        Assigned to me
      </label>
    </div>
    {message ? <p className="mt-6 rounded-[24px] bg-[#FFF8EC] p-6" role="status">{message}</p> : null}
    <ul className="mt-6 space-y-3">
      {cases.map(item => <li key={item.id}>
        <Link href={`/admin/support/${item.id}`} className="block rounded-2xl border border-slate-200 p-4 hover:bg-[#FFF8EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6930CA]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6930CA]">{item.caseNumber} · {readableAdminStatus(item.status)}</p>
              <h2 className="mt-1 truncate text-lg font-bold">{item.subject}</h2>
            </div>
            <span className="text-xs text-slate-500">{formatAdminTimestamp(item.updatedAt)}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{readableAdminStatus(item.requesterRole)}{item.orderId ? ` · Order ${item.orderId.slice(-8).toUpperCase()}` : ""} · {item.assignedToIdentityId ? "Assigned" : "Unassigned"}</p>
        </Link>
      </li>)}
    </ul>
    {cursor ? <button type="button" disabled={busy} onClick={() => void load(cursor)} className="mt-5 rounded-xl border px-4 py-3 font-semibold disabled:opacity-50">
      {busy ? "Loading…" : "Load more"}
    </button> : null}
  </section>;
}

function author(message: SupportMessage): string {
  if (message.internalNote) return `Internal note · ${readableAdminStatus(message.senderRole)}`;
  if (message.senderRole === "CUSTOMER" || message.senderRole === "CHEF") {
    return message.body.startsWith(ASSISTANT_PREFIX) ? `${readableAdminStatus(message.senderRole)} via AI assistant (unverified summary)` : `Requester · ${readableAdminStatus(message.senderRole)}`;
  }
  return `Support · ${readableAdminStatus(message.senderRole)}`;
}

export function AdminSupportCase({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<SupportCaseDetail | null>(null);
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [nextStatus, setNextStatus] = useState<SupportStatus>("IN_PROGRESS");
  const [statusNote, setStatusNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading support case…");

  async function work(action: () => Promise<SupportCaseDetail>, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await action();
      setDetail(result);
      setNextStatus(result.supportCase.status);
      setMessage(done);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Support operation unavailable.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    api<SupportCaseDetail>(`/${caseId}`)
      .then(result => { if (active) { setDetail(result); setNextStatus(result.supportCase.status); setMessage(""); } })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Support case is unavailable."); });
    return () => { active = false; };
  }, [caseId]);

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (await work(() => api(`/${caseId}/messages`, "POST", { message: reply.trim(), internalNote }), internalNote ? "Internal note added." : "Reply sent to the requester.")) setReply("");
  }

  async function updateStatus(event: FormEvent) {
    event.preventDefault();
    if (await work(() => api(`/${caseId}/status`, "PATCH", { status: nextStatus, note: statusNote.trim() || undefined }), "Status updated.")) setStatusNote("");
  }

  const supportCase = detail?.supportCase;
  return <div className="space-y-6">
    {message ? <p className="rounded-[24px] bg-[#FFF8EC] p-4 text-sm font-bold text-slate-950" role="status">{message}</p> : null}
    {supportCase ? <>
      <section className="rounded-[30px] bg-white p-6 text-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6930CA]">{supportCase.caseNumber} · {readableAdminStatus(supportCase.status)}</p>
            <h2 className="mt-2 text-2xl font-bold">{supportCase.subject}</h2>
          </div>
          <button type="button" disabled={busy} onClick={() => void work(() => api(`/${caseId}/assign-to-me`, "POST"), "Case assigned to you.")} className="rounded-xl bg-[#6930CA] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Assign to me</button>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Requester</dt><dd className="break-all font-bold">{readableAdminStatus(supportCase.requesterRole)} · {supportCase.requesterIdentityId}</dd></div>
          <div><dt className="text-slate-500">Order</dt><dd className="break-all font-bold">{supportCase.orderId ? <Link href={`/admin/operations?reference=${supportCase.orderId}`} className="text-[#6930CA] underline">{supportCase.orderId}</Link> : "None"}</dd></div>
          <div><dt className="text-slate-500">Assigned to</dt><dd className="break-all font-bold">{supportCase.assignedToIdentityId ?? "Unassigned"}</dd></div>
          <div><dt className="text-slate-500">Opened</dt><dd className="font-bold">{formatAdminTimestamp(supportCase.createdAt)}</dd></div>
        </dl>
      </section>

      <section className="rounded-[30px] bg-white p-6 text-slate-950" aria-labelledby="support-thread">
        <h2 id="support-thread" className="text-xl font-bold">Conversation</h2>
        <ol className="mt-4 space-y-3">
          {detail.messages.map(item => <li key={item.id} className={item.internalNote
            ? "rounded-2xl border border-dashed border-amber-400 bg-amber-50 p-4"
            : item.senderRole === "CUSTOMER" || item.senderRole === "CHEF" ? "mr-8 rounded-2xl border border-slate-200 p-4" : "ml-8 rounded-2xl bg-[#6930CA]/10 p-4"}>
            <p className="text-xs font-bold text-slate-600">{author(item)} · {formatAdminTimestamp(item.createdAt)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{item.body}</p>
          </li>)}
        </ol>
        <form onSubmit={sendReply} className="mt-6 space-y-3">
          <label className="block text-sm font-bold">
            {internalNote ? "Internal note" : "Reply to requester"}
            <textarea value={reply} onChange={event => setReply(event.target.value)} maxLength={5000} required className="mt-2 min-h-32 w-full rounded-2xl border border-slate-200 p-4 font-normal" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={internalNote} onChange={event => setInternalNote(event.target.checked)} className="h-4 w-4" />
              Internal note (not visible to requester)
            </label>
            <button disabled={busy || !reply.trim()} className="rounded-xl bg-[#6930CA] px-5 py-3 font-bold text-white disabled:opacity-50">{internalNote ? "Add note" : "Send reply"}</button>
          </div>
        </form>
      </section>

      <form onSubmit={updateStatus} className="rounded-[30px] bg-white p-6 text-slate-950">
        <h2 className="text-xl font-bold">Status</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr_auto] sm:items-end">
          <label className="block text-sm font-bold">
            New status
            <select value={nextStatus} onChange={event => setNextStatus(event.target.value as SupportStatus)} className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal">
              {STATUSES.map(value => <option key={value} value={value}>{readableAdminStatus(value)}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold">
            Note (optional)
            <input value={statusNote} onChange={event => setStatusNote(event.target.value)} maxLength={500} className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal" />
          </label>
          <button disabled={busy || nextStatus === supportCase.status} className="min-h-12 rounded-xl border border-[#6930CA] px-5 font-bold text-[#6930CA] disabled:opacity-50">Update status</button>
        </div>
      </form>
    </> : null}
  </div>;
}
