"use client";

import { adminFetch } from "@/lib/admin-renewal";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseAdminSubscriptionHistory,
  parseAdminSubscriptionPage,
  type AdminSubscriptionHistory,
  type AdminSubscriptionStatus,
  type AdminSubscriptionSummary,
} from "@/lib/admin-subscription-operation-contract";

import { parseCustomerSubscription } from "@/lib/subscription-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUSES: AdminSubscriptionStatus[] = [
  "PENDING_PAYMENT", "ACTIVE", "PAUSED", "PAYMENT_FAILED", "EXPIRED", "CANCELLED",
];

function short(value: string | null): string {
  if (!value) return "—";
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export function AdminSubscriptionOperator() {
  const [items, setItems] = useState<AdminSubscriptionSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [cursor, setCursor] = useState<{ createdAt: string; id: string } | null>(null);
  const [selected, setSelected] = useState<AdminSubscriptionSummary | null>(null);
  const [history, setHistory] = useState<AdminSubscriptionHistory[]>([]);
  const [nextStatus, setNextStatus] = useState<AdminSubscriptionStatus>("ACTIVE");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listLoaded, setListLoaded] = useState(false);
  const [listError, setListError] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const listRequestId = useRef(0);
  const historyRequestId = useRef(0);
  const appliedFilters = useRef({ status: "", planId: "" });
  const cursorRef = useRef<{ createdAt: string; id: string } | null>(null);
  const actionInFlight = useRef(false);
  const busy = listLoading || saving;

  const load = useCallback(async (append = false) => {
    const currentRequest = ++listRequestId.current;
    const query = new URLSearchParams({ limit: "50" });
    if (appliedFilters.current.status) query.set("status", appliedFilters.current.status);
    if (appliedFilters.current.planId) query.set("planId", appliedFilters.current.planId);
    if (append && cursorRef.current) { query.set("afterCreatedAt", cursorRef.current.createdAt); query.set("afterId", cursorRef.current.id); }
    setListLoading(true); setListError("");
    if (!append) { setItems([]); setListLoaded(false); cursorRef.current = null; setCursor(null); }
    try {
      const response = await adminFetch(`/api/admin/subscriptions?${query.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.status === 401) throw new Error("Administrator session expired.");
      if (response.status === 403) throw new Error("Subscription operations access is required.");
      if (response.status === 400) throw new Error("Check the plan UUID or status filter.");
      if (!response.ok) throw new Error("Subscription operations are temporarily unavailable. Please retry.");
      const page = parseAdminSubscriptionPage(body);
      if (!page) throw new Error("Craves returned an invalid subscription list.");
      if (currentRequest !== listRequestId.current) return;
      setItems(current => append ? [...new Map([...current, ...page.items].map(item => [item.id, item])).values()] : page.items);
      const next = page.hasMore && page.nextCreatedAt && page.nextId ? { createdAt: page.nextCreatedAt, id: page.nextId } : null;
      cursorRef.current = next; setCursor(next); setListLoaded(true); setMessage("");
    } catch (error) {
      if (currentRequest === listRequestId.current) setListError(error instanceof Error ? error.message : "Subscription operations are unavailable.");
      throw error;
    } finally { if (currentRequest === listRequestId.current) setListLoading(false); }
  }, []);

  useEffect(() => {
    const lists = listRequestId, histories = historyRequestId;
    void load().catch(() => undefined);
    return () => { lists.current++; histories.current++; };
  }, [load]);

  async function applyFilters() {
    if (busy || actionInFlight.current) return;
    if (planFilter.trim() && !UUID.test(planFilter.trim())) { setMessage("Enter a valid plan UUID or clear the plan filter."); return; }
    appliedFilters.current = { status: statusFilter, planId: planFilter.trim() };
    historyRequestId.current++; setSelected(null); setHistory([]); setHistoryError(""); setHistoryLoading(false); setMessage("");
    await load().catch(() => undefined);
  }

  async function fetchHistory(subscriptionId: string) {
    const response = await adminFetch(`/api/admin/subscriptions/${subscriptionId}/history?limit=100`, { cache: "no-store" });
    if (!response.ok) throw new Error("Audit history could not be loaded. Please retry.");
    const entries = parseAdminSubscriptionHistory(await response.json().catch(() => null));
    if (!entries) throw new Error("Craves returned invalid audit history.");
    return entries;
  }

  async function selectSubscription(subscription: AdminSubscriptionSummary) {
    if (busy || actionInFlight.current) return;
    const currentRequest = ++historyRequestId.current;
    setSelected(subscription); setNextStatus(subscription.status); setReason(""); setMessage(""); setHistory([]); setHistoryError(""); setHistoryLoading(true);
    try {
      const entries = await fetchHistory(subscription.id);
      if (currentRequest === historyRequestId.current) setHistory(entries);
    } catch (error) {
      if (currentRequest === historyRequestId.current) setHistoryError(error instanceof Error ? error.message : "Audit history could not be loaded.");
    } finally { if (currentRequest === historyRequestId.current) setHistoryLoading(false); }
  }

  async function applyStatus() {
    if (actionInFlight.current || busy || historyLoading) return;
    if (!selected || !reason.trim()) { setMessage("Select a subscription and enter an operational reason."); return; }
    if (nextStatus === selected.status) { setMessage("Choose a different status before applying a change."); return; }
    if (!window.confirm(`Change subscription ${selected.id} from ${selected.status} to ${nextStatus}? This action is audited.`)) return;
    actionInFlight.current = true; setSaving(true); setMessage("");
    try {
      const response = await adminFetch(`/api/admin/subscriptions/${selected.id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, reason: reason.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.code === "SESSION_RENEWED_RETRY_REQUIRED"
        ? "Your session was renewed. Review the details and click Apply status again."
        : response.status === 403 ? "Your admin role cannot change subscription status."
        : "Subscription status could not be updated. Your reason remains available.");
      const updated = parseCustomerSubscription(body);
      if (!updated || updated.id !== selected.id || updated.planId !== selected.planId) {
        historyRequestId.current++; setSelected(null); setHistory([]);
        await load().catch(() => undefined);
        setMessage("The status action was accepted, but the response could not be confirmed. Review the refreshed subscription before another action.");
        return;
      }
      const confirmed = { ...selected, status: updated.status, startDate: updated.startDate, endDate: updated.endDate, nextServiceDate: updated.nextServiceDate, updatedAt: updated.updatedAt };
      setSelected(confirmed); setNextStatus(updated.status);
      setItems(current => current.map(item => item.id === selected.id ? confirmed : item).filter(item => !appliedFilters.current.status || item.status === appliedFilters.current.status));
      setReason(""); setHistory([]); setHistoryError(""); setHistoryLoading(true);
      try { setHistory(await fetchHistory(selected.id)); setMessage("Subscription status updated and audited."); }
      catch (error) {
        setHistoryError(error instanceof Error ? error.message : "Audit history could not be loaded.");
        setMessage("Subscription status updated and audited. Audit history could not be refreshed; retry below.");
      } finally { setHistoryLoading(false); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Subscription status update failed."); }
    finally { actionInFlight.current = false; setSaving(false); }
  }

  return <div className="space-y-7">
    <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">Subscription operations</h2><p className="mt-2 text-sm text-slate-600">Find subscriptions by status or plan, review their history, and apply an audited operational change.</p></div><button disabled={busy} onClick={() => void applyFilters()} className="rounded-2xl border border-[#6930CA] px-4 py-2 font-bold text-[#6930CA] disabled:opacity-50">{listLoading ? "Loading…" : "Refresh"}</button></div>
      <div className="mt-5 grid gap-3 md:grid-cols-[.8fr_1.2fr_auto]"><select aria-label="Subscription status filter" disabled={busy} value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-12 rounded-2xl bg-white px-4"><option value="">All statuses</option>{STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select><input aria-label="Plan UUID filter" disabled={busy} value={planFilter} onChange={event => setPlanFilter(event.target.value)} placeholder="Optional plan UUID" className="min-h-12 rounded-2xl bg-white px-4" /><button disabled={busy} onClick={() => void applyFilters()} className="rounded-2xl bg-[#6930CA] px-5 py-3 font-bold text-white disabled:opacity-50">Apply filters</button></div>
      {listLoading && <p role="status" className="mt-4 text-sm text-slate-600">Loading subscriptions…</p>}
      {listError && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{listError}</p>}
      {message && <p role="status" className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-700">{message}</p>}
      <div className="mt-5 overflow-x-auto rounded-2xl bg-white"><table className="min-w-[900px] w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Created</th><th className="p-3">Status</th><th className="p-3">Subscription</th><th className="p-3">Customer</th><th className="p-3">Plan</th><th className="p-3">Next meal</th><th className="p-3">Action</th></tr></thead><tbody>{listLoaded && !listLoading && !listError && items.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-600">No subscriptions match the applied filters.</td></tr>}{items.map(item => <tr key={item.id} className="border-b last:border-b-0"><td className="p-3">{new Date(item.createdAt).toLocaleString("en-IN")}</td><td className="p-3 font-bold">{item.status}</td><td className="p-3 font-mono text-xs" title={item.id}>{short(item.id)}</td><td className="p-3 font-mono text-xs" title={item.customerIdentityId}>{short(item.customerIdentityId)}</td><td className="p-3 font-mono text-xs" title={item.planId}>{short(item.planId)}</td><td className="p-3">{item.nextServiceDate ?? "—"}</td><td className="p-3"><button type="button" disabled={busy} onClick={() => void selectSubscription(item)} className="rounded-xl border border-[#6930CA] px-3 py-2 font-bold text-[#6930CA]">Review</button></td></tr>)}</tbody></table></div>
      {cursor && <button disabled={busy} onClick={() => void load(true).catch(() => undefined)} className="mt-4 rounded-2xl border border-[#6930CA] px-5 py-3 font-bold text-[#6930CA] disabled:opacity-50">{listLoading ? "Loading…" : "Load more"}</button>}
    </section>

    {selected && <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 sm:p-8">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">Selected subscription</p><h2 className="mt-2 break-all text-xl font-bold">{selected.id}</h2></div>
      <dl className="mt-5 grid gap-3 text-sm md:grid-cols-3"><div><dt className="text-slate-500">Customer identity</dt><dd className="break-all font-mono text-xs">{selected.customerIdentityId}</dd></div><div><dt className="text-slate-500">Chef identity</dt><dd className="break-all font-mono text-xs">{selected.chefIdentityId ?? "Unassigned"}</dd></div><div><dt className="text-slate-500">Delivery address ID</dt><dd className="break-all font-mono text-xs">{selected.deliveryAddressId}</dd></div></dl>
      <div className="mt-6 grid gap-3 md:grid-cols-[.7fr_1.5fr_auto]"><label className="text-sm font-bold">New status<select disabled={busy || historyLoading} value={nextStatus} onChange={event => setNextStatus(event.target.value as AdminSubscriptionStatus)} className="mt-2 min-h-12 w-full rounded-2xl bg-white px-4">{STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select></label><label className="text-sm font-bold">Required operational reason<input disabled={busy || historyLoading} value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl bg-white px-4" /></label><button disabled={busy || historyLoading || !reason.trim() || nextStatus === selected.status} onClick={() => void applyStatus()} className="self-end min-h-12 rounded-2xl bg-[#6930CA] px-5 font-bold text-white disabled:opacity-50">{saving ? "Applying status…" : "Apply status"}</button></div>
      <div className="mt-7"><h3 className="text-lg font-bold">Audit history</h3>{historyLoading ? <p role="status" className="mt-3 text-sm text-slate-600">Loading audit history…</p> : historyError ? <div className="mt-3"><p role="alert" className="text-sm text-red-800">{historyError}</p><button type="button" disabled={busy} onClick={() => void selectSubscription(selected)} className="mt-2 rounded-xl border px-3 py-2 text-sm font-bold">Retry history</button></div> : history.length === 0 ? <p className="mt-3 text-sm text-slate-600">No status history was returned.</p> : <div className="mt-3 space-y-2">{history.map(entry => <div key={entry.id} className="rounded-2xl bg-white p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{entry.oldStatus ?? "CREATED"} → {entry.newStatus}</strong><span className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString("en-IN")}</span></div><p className="mt-2 text-slate-600">{entry.reason ?? "No reason recorded"}</p><p className="mt-1 text-xs text-slate-400">Actor: {entry.actorIdentityId ?? "system"}</p></div>)}</div>}</div>
    </section>}
  </div>;
}
