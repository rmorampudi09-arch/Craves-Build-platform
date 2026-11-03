"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { z } from "zod";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { formatAdminTimestamp, readableAdminStatus } from "@/features/admin/shell/lib/admin-navigation";
import { fieldClass, labelClass } from "@/features/admin/fleet/components/fleet-action";
import { UUID } from "@/features/admin/fleet/lib/fleet-common";
import {
  actionSchema, detailSchema, exceptionError, openSchema, pageSchema, PROVIDERS, REASONS, STATUS_LABELS, STATUSES,
  type CaseAction, type CaseEvent, type CaseStatus, type ExceptionCase,
} from "./delivery-exception-contract";

const PAGE = 30;
const when = (value: string | null) => value ? formatAdminTimestamp(value) : "—";
const staff = (value: string | null) => value ? `staff ${value.slice(0, 8)}` : "nobody yet";
const closed = (status: CaseStatus) => status === "RESOLVED" || status === "DISMISSED";
type Filter = "ACTIVE" | CaseStatus;
type Busy = { busy: boolean; error: string };

async function call<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, body?: unknown): Promise<T> {
  const response = await adminFetch(`/api/admin/delivery-exceptions${path}`, body === undefined ? { cache: "no-store" }
    : { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(exceptionError(response.status, data).message);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("The delivery service sent an unexpected answer. Refresh and check before trying again.");
  return parsed.data;
}
const failed = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

/** Operations' delivery exception cases (M25): active ones first, most recently changed first. */
export function DeliveryExceptionsConsole() {
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [orderInput, setOrderInput] = useState("");
  const [order, setOrder] = useState("");
  const [offset, setOffset] = useState(0);
  const [cases, setCases] = useState<ExceptionCase[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [message, setMessage] = useState("Loading cases…");
  const [notice, setNotice] = useState("");
  const latest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current; // a slower, older answer never overwrites a newer one
    const query = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (filter !== "ACTIVE") query.set("status", filter);
    if (order) query.set("orderId", order);
    try {
      const page = await call(`?${query}`, pageSchema);
      if (mine !== latest.current) return;
      setCases(page.items);
      setHasMore(page.hasMore);
      setMessage(page.items.length ? "" : filter === "ACTIVE" ? "No active cases." : `No ${STATUS_LABELS[filter].toLowerCase()} cases.`);
    } catch (error) {
      if (mine !== latest.current) return;
      setCases([]);
      setHasMore(false);
      setMessage(failed(error, "Cases are unavailable."));
    }
  }, [filter, order, offset]);
  useEffect(() => { void load(); }, [load]);

  function show(next: Filter) {
    setNotice("");
    setOffset(0);
    setFilter(next);
  }
  function filterByOrder(event: FormEvent) {
    event.preventDefault();
    const value = orderInput.trim();
    if (value && !UUID.test(value)) return setMessage("Paste the full 36-character order ID.");
    setOffset(0);
    setOrder(value);
  }
  async function changed(text: string) {
    setNotice(text);
    await load();
  }
  async function opened() {
    if (filter === "ACTIVE" && offset === 0) return changed("Case opened. Take it if you are handling it.");
    setFilter("ACTIVE");
    setOffset(0);
    setNotice("Case opened. Take it if you are handling it.");
  }

  return <div className="space-y-6">
    <OpenCase onOpened={opened} />
    <section className="cr-panel space-y-4" aria-labelledby="delivery-exception-cases-title">
      <h2 id="delivery-exception-cases-title" className="text-lg font-bold">Cases</h2>
      <div className="flex flex-wrap gap-2">
        {(["ACTIVE", ...STATUSES] as const).map(value => <button key={value} type="button" aria-pressed={filter === value}
          className={`cr-button ${filter === value ? "cr-primary" : ""}`} onClick={() => show(value)}>{value === "ACTIVE" ? "Active" : STATUS_LABELS[value]}</button>)}
        <button type="button" className="cr-button" onClick={() => void load()}>Refresh</button>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={filterByOrder}>
        <label className={labelClass}>Order ID (optional)
          <input className={fieldClass} value={orderInput} maxLength={36} spellCheck={false} onChange={event => setOrderInput(event.target.value)} />
        </label>
        <button type="submit" className="cr-button">Filter</button>
        {order && <button type="button" className="cr-button" onClick={() => { setOrderInput(""); setOrder(""); setOffset(0); }}>All orders</button>}
      </form>
      {notice && <p className="cr-feedback" role="status">{notice}</p>}
      {message && <p className="cr-empty" role="status">{message}</p>}
      {cases.length > 0 && <div className="space-y-3">{cases.map(item => <CaseCard key={`${item.id}:${item.version}`} item={item} onChanged={changed} />)}</div>}
      {(offset > 0 || hasMore) && <span className="cr-actions">
        <button type="button" className="cr-button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Newer</button>
        <button type="button" className="cr-button" disabled={!hasMore} onClick={() => setOffset(offset + PAGE)}>Older</button>
      </span>}
    </section>
    <datalist id="delivery-exception-providers">{PROVIDERS.map(value => <option key={value} value={value} />)}</datalist>
  </div>;
}

function OpenCase({ onOpened }: { onOpened: () => Promise<void> }) {
  const [orderId, setOrderId] = useState("");
  const [deliveryJobId, setDeliveryJobId] = useState("");
  const [reason, setReason] = useState("RIDER_NOT_ASSIGNED");
  const [note, setNote] = useState("");
  const [state, setState] = useState<Busy>({ busy: false, error: "" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = openSchema.safeParse({ orderId: orderId.trim() || undefined, deliveryJobId: deliveryJobId.trim() || undefined, reason, note: note.trim() || undefined });
    if (!parsed.success) return setState({ busy: false, error: parsed.error.issues[0]?.message ?? "Check the details." });
    setState({ busy: true, error: "" });
    try {
      await call("", detailSchema, parsed.data);
      setOrderId(""); setDeliveryJobId(""); setNote("");
      setState({ busy: false, error: "" });
      await onOpened();
    } catch (error) {
      setState({ busy: false, error: failed(error, "The case was not opened.") });
    }
  }

  return <section className="cr-panel space-y-3" aria-labelledby="delivery-exception-open-title">
    <h2 id="delivery-exception-open-title" className="text-lg font-bold">Open a case</h2>
    <p className="cr-muted">Use the order ID. An order with food from more than one kitchen has one delivery per kitchen: the service then lists their delivery job IDs, and you paste the one that went wrong. One active case per delivery.</p>
    <form className="grid gap-3 md:grid-cols-2" onSubmit={event => void submit(event)}>
      <label className={labelClass}>Order ID<input className={fieldClass} value={orderId} maxLength={36} spellCheck={false} onChange={event => setOrderId(event.target.value)} /></label>
      <label className={labelClass}>Or delivery job ID<input className={fieldClass} value={deliveryJobId} maxLength={36} spellCheck={false} onChange={event => setDeliveryJobId(event.target.value)} /></label>
      <label className={labelClass}>What went wrong
        <select className={fieldClass} value={reason} onChange={event => setReason(event.target.value)}>
          {Object.entries(REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className={labelClass}>Note {reason === "OTHER" ? "(required)" : "(optional)"}
        <textarea className={fieldClass} value={note} maxLength={1000} rows={2} onChange={event => setNote(event.target.value)} />
      </label>
      <span className="cr-actions md:col-span-2"><button type="submit" className="cr-button cr-primary" disabled={state.busy}>Open case</button></span>
    </form>
    <Status state={state} />
  </section>;
}

function CaseCard({ item, onChanged }: { item: ExceptionCase; onChanged: (notice: string) => Promise<void> }) {
  const [events, setEvents] = useState<CaseEvent[] | null>(null);
  const [form, setForm] = useState<"" | "REQUEST_REASSIGNMENT" | "RESOLVE" | "DISMISS">("");
  const [note, setNote] = useState("");
  const [provider, setProvider] = useState("");
  const [state, setState] = useState<Busy>({ busy: false, error: "" });

  async function act(action: CaseAction, done: string, extra: { note?: string; providerId?: string } = {}) {
    const parsed = actionSchema.safeParse({ action, expectedVersion: item.version, ...extra });
    if (!parsed.success) return setState({ busy: false, error: parsed.error.issues[0]?.message ?? "Check the details." });
    setState({ busy: true, error: "" });
    try {
      await call(`?case=${item.id}`, detailSchema, parsed.data);
      setState({ busy: false, error: "" });
      await onChanged(done);
    } catch (error) {
      setState({ busy: false, error: failed(error, "Nothing was changed.") });
    }
  }
  async function toggleHistory() {
    if (events) return setEvents(null);
    try {
      setEvents((await call(`?case=${item.id}`, detailSchema)).events);
    } catch (error) {
      setState({ busy: false, error: failed(error, "The history is unavailable.") });
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const text = note.trim() || undefined;
    if (form === "REQUEST_REASSIGNMENT") void act(form, `Asked to move this delivery to ${provider.trim()}. Switch it with the provider tools, then resolve the case.`, { note: text, providerId: provider.trim() || undefined });
    else if (form) void act(form, form === "RESOLVE" ? "Case resolved." : "Case dismissed.", { note: text });
  }

  return <article className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <strong>{REASONS[item.reason] ?? readableAdminStatus(item.reason)}</strong>
      <span className="cr-status" data-tone={item.status === "OPEN" ? "danger" : closed(item.status) ? "success" : undefined}>{STATUS_LABELS[item.status]}</span>
    </div>
    <p>Order <span className="select-all font-mono text-xs">{item.orderId}</span> · delivery job <span className="select-all font-mono text-xs">{item.deliveryJobId}</span></p>
    <p>With {item.currentProviderId} · delivery {readableAdminStatus(item.deliveryStatus).toLowerCase()}{item.reassignToProviderId ? ` · asked to move to ${item.reassignToProviderId}` : ""}</p>
    <p className="cr-muted">Opened {when(item.createdAt)} by {staff(item.openedBy)} · owner {staff(item.assigneeId)} · last change {when(item.updatedAt)}{item.closedAt ? ` · closed ${when(item.closedAt)}` : ""}</p>
    {item.resolutionNote && <p className="whitespace-pre-wrap break-words">What was done: {item.resolutionNote}</p>}
    {!closed(item.status) && !form && <span className="cr-actions">
      <button type="button" className="cr-button cr-primary" disabled={state.busy} onClick={() => void act("ASSIGN", "You own this case now.")}>Take this case</button>
      {item.status === "OPEN" && <button type="button" className="cr-button" disabled={state.busy} onClick={() => void act("ACKNOWLEDGE", "Case acknowledged.")}>Acknowledge</button>}
      {item.status === "REASSIGNMENT_REQUESTED"
        ? <button type="button" className="cr-button" disabled={state.busy} onClick={() => void act("ACKNOWLEDGE", "Provider request withdrawn.")}>Withdraw provider request</button>
        : <button type="button" className="cr-button" disabled={state.busy} onClick={() => setForm("REQUEST_REASSIGNMENT")}>Ask for another provider</button>}
      <button type="button" className="cr-button" disabled={state.busy} onClick={() => setForm("RESOLVE")}>Resolve</button>
      <button type="button" className="cr-button" disabled={state.busy} onClick={() => setForm("DISMISS")}>Dismiss</button>
    </span>}
    {form && <form className="space-y-2" onSubmit={submit}>
      {form === "REQUEST_REASSIGNMENT" && <label className={labelClass}>Provider to move to
        <input className={fieldClass} list="delivery-exception-providers" value={provider} maxLength={80} onChange={event => setProvider(event.target.value)} />
      </label>}
      <label className={labelClass}>{form === "REQUEST_REASSIGNMENT" ? "Note (optional)" : "What was done (required)"}
        <textarea className={fieldClass} value={note} maxLength={1000} rows={2} onChange={event => setNote(event.target.value)} />
      </label>
      <span className="cr-actions">
        <button type="submit" className="cr-button cr-primary" disabled={state.busy}>{form === "REQUEST_REASSIGNMENT" ? "Ask for this provider" : form === "RESOLVE" ? "Resolve" : "Dismiss"}</button>
        <button type="button" className="cr-button" disabled={state.busy} onClick={() => setForm("")}>Back</button>
      </span>
    </form>}
    <button type="button" className="cr-button" onClick={() => void toggleHistory()}>{events ? "Hide history" : "Show history"}</button>
    {events && <ol className="space-y-1">{events.map(event => <li key={event.id} className="cr-muted">
      {when(event.occurredAt)} · {readableAdminStatus(event.action)} → {STATUS_LABELS[event.status]} · {staff(event.actorId)}{event.note ? ` · ${event.note}` : ""}
    </li>)}</ol>}
    <Status state={state} />
  </article>;
}

function Status({ state }: { state: Busy }) {
  if (state.busy) return <p className="cr-feedback" role="status">Saving…</p>;
  return state.error ? <p className="cr-error-text" role="alert">{state.error}</p> : null;
}
