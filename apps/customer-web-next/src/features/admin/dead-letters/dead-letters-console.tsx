"use client";

import { useState, type FormEvent } from "react";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { formatAdminTimestamp, readableAdminStatus } from "@/features/admin/shell/lib/admin-navigation";
import { fieldClass, labelClass } from "@/features/admin/fleet/components/fleet-action";
import {
  ADMIN_REASON, deadLetterError, deadLetterRetryError, deadLetterSchema, pageSchema, PROVIDER, SOURCE_LABELS, SOURCES, STATUS_LABELS, STATUSES,
  type DeadLetter, type DeadLetterPage, type DeadLetterSource, type DeadLetterStatus,
} from "./dead-letter-contract";

const PAGE = 25;
const MAX_OFFSET = 10_000;
const when = (value: string | null) => value ? formatAdminTimestamp(value) : "—";
type Search = { source: DeadLetterSource; status: DeadLetterStatus; provider: string; reason: string };
type State = { busy: boolean; error: string; reference: string };

/** Handbook 105, read-only: what failed or was given up on, most recent change first. Each page is one audited read. */
export function DeadLettersConsole() {
  const [source, setSource] = useState<DeadLetterSource>("DELIVERY_WEBHOOK");
  const [status, setStatus] = useState<DeadLetterStatus>("DEAD_LETTER");
  const [provider, setProvider] = useState("");
  const [reason, setReason] = useState("");
  const [page, setPage] = useState<DeadLetterPage | null>(null);
  const [shown, setShown] = useState<Search | null>(null);
  const [state, setState] = useState<State>({ busy: false, error: "", reference: "" });
  const [retried, setRetried] = useState<Record<string, string>>({});

  async function load(search: Search, offset: number) {
    setState({ busy: true, error: "", reference: "" });
    const query = new URLSearchParams({ source: search.source, status: search.status, limit: String(PAGE), offset: String(offset) });
    if (search.provider) query.set("provider", search.provider);
    try {
      const response = await adminFetch(`/api/admin/dead-letters?${query}`, { cache: "no-store", headers: { "X-Admin-Reason": search.reason } });
      const reference = response.headers.get("X-Correlation-ID") ?? "";
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data && typeof data === "object" ? (data as Record<string, unknown>).message : undefined;
        return setState({ busy: false, error: typeof message === "string" ? message.slice(0, 500) : deadLetterError(response.status).message, reference });
      }
      const parsed = pageSchema.safeParse(data);
      if (!parsed.success) return setState({ busy: false, error: "The integration service sent an unexpected answer. Refresh and try again.", reference });
      setPage(parsed.data);
      setShown(search);
      setRetried({});
      setState({ busy: false, error: "", reference });
    } catch {
      setState({ busy: false, error: "The integration service is unavailable. Try again shortly.", reference: "" });
    }
  }

  // One more attempt for one dead-lettered delivery webhook, with the reason the list was opened with.
  async function retry(item: DeadLetter) {
    if (!shown || state.busy) return;
    if (!window.confirm("Give this delivery webhook one more attempt? If it fails again it goes back to the dead letters.")) return;
    setState({ busy: true, error: "", reference: "" });
    const query = new URLSearchParams({ id: item.id, source: "DELIVERY_WEBHOOK" });
    try {
      const response = await adminFetch(`/api/admin/dead-letters?${query}`, { method: "POST", cache: "no-store", headers: { "X-Admin-Reason": shown.reason } });
      const reference = response.headers.get("X-Correlation-ID") ?? "";
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data && typeof data === "object" ? (data as Record<string, unknown>).message : undefined;
        return setState({ busy: false, error: typeof message === "string" ? message.slice(0, 500) : deadLetterRetryError(response.status).message, reference });
      }
      const row = deadLetterSchema.safeParse(data);
      if (!row.success) return setState({ busy: false, error: "The integration service sent an unexpected answer. Refresh the list.", reference });
      setPage(current => current && { ...current, items: current.items.map(entry => entry.id === row.data.id ? row.data : entry) });
      setRetried(current => ({ ...current, [item.id]: reference }));
      setState({ busy: false, error: "", reference });
    } catch {
      setState({ busy: false, error: "The integration service is unavailable. Try again shortly.", reference: "" });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const search = { source, status, provider: source === "CASHFREE_WEBHOOK" ? "" : provider.trim(), reason: reason.trim() };
    if (!ADMIN_REASON.test(search.reason)) {
      return setState({ busy: false, error: "Write why you are looking: 10 to 500 plain characters, for example the ticket or incident.", reference: "" });
    }
    if (search.provider && !PROVIDER.test(search.provider)) {
      return setState({ busy: false, error: "A provider id is lower case, like borzo or pidge.", reference: "" });
    }
    void load(search, 0);
  }

  const end = page ? page.offset + page.items.length : 0;
  return <div className="space-y-6">
    <section className="cr-panel space-y-3" aria-labelledby="dead-letter-search-title">
      <h2 id="dead-letter-search-title" className="text-lg font-bold">What to show</h2>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
        <label className={labelClass}>Source
          <select className={fieldClass} value={source} onChange={event => setSource(event.target.value as DeadLetterSource)}>
            {SOURCES.map(value => <option key={value} value={value}>{SOURCE_LABELS[value]}</option>)}
          </select>
        </label>
        <label className={labelClass}>Status
          <select className={fieldClass} value={status} onChange={event => setStatus(event.target.value as DeadLetterStatus)}>
            {STATUSES.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
          </select>
        </label>
        {source !== "CASHFREE_WEBHOOK" && <label className={labelClass}>Provider (optional)
          <input className={fieldClass} value={provider} maxLength={80} spellCheck={false} placeholder="borzo" onChange={event => setProvider(event.target.value)} />
        </label>}
        <label className={`${labelClass} md:col-span-2`}>Why you are looking (recorded with every page you open)
          <input className={fieldClass} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} />
        </label>
        <span className="cr-actions md:col-span-2"><button type="submit" className="cr-button cr-primary" disabled={state.busy}>Show</button></span>
      </form>
      {state.busy && <p className="cr-feedback" role="status">Loading…</p>}
      {state.error && <p className="cr-error-text" role="alert">{state.error}{state.reference ? ` Reference ${state.reference}.` : ""}</p>}
    </section>
    {page && shown && <section className="cr-panel space-y-4" aria-labelledby="dead-letter-results-title">
      <h2 id="dead-letter-results-title" className="text-lg font-bold">
        {SOURCE_LABELS[page.source]} · {STATUS_LABELS[page.status].toLowerCase()}{shown.provider ? ` · ${shown.provider}` : ""}
      </h2>
      <p className="cr-muted" role="status">
        {page.total === 0 ? "Nothing here." : `${page.offset + 1}–${end} of ${page.total}, most recent change first.`}
        {state.reference ? ` Audit reference ${state.reference}.` : ""}
      </p>
      {page.items.map(item => <Row key={item.id} item={item} busy={state.busy} retriedReference={retried[item.id]} onRetry={() => void retry(item)} />)}
      {(page.offset > 0 || end < page.total) && <span className="cr-actions">
        <button type="button" className="cr-button" disabled={state.busy || page.offset === 0} onClick={() => void load(shown, Math.max(0, page.offset - PAGE))}>Newer</button>
        <button type="button" className="cr-button" disabled={state.busy || end >= page.total || page.offset + PAGE > MAX_OFFSET} onClick={() => void load(shown, page.offset + PAGE)}>Older</button>
      </span>}
    </section>}
  </div>;
}

function Row({ item, busy, retriedReference, onRetry }: { item: DeadLetter; busy: boolean; retriedReference?: string; onRetry: () => void }) {
  const ids: Array<[string, string | null]> = [
    ["Order", item.orderId], ["Kitchen order", item.chefSubOrderId], ["Delivery job", item.deliveryJobId], ["Provider event", item.providerEventId],
  ];
  return <article className="space-y-1 rounded-xl border border-slate-200 p-3 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <strong>{item.kind ? readableAdminStatus(item.kind) : SOURCE_LABELS[item.source]}</strong>
      <span className="cr-status" data-tone={item.status === "DEAD_LETTER" ? "danger" : undefined}>{readableAdminStatus(item.status)}</span>
      {item.provider && <span className="cr-muted">{item.provider}</span>}
    </div>
    <p className="whitespace-pre-wrap break-words">{item.lastError ?? "No error was recorded."}</p>
    <p className="cr-muted">
      {item.attemptCount} {item.attemptCount === 1 ? "attempt" : "attempts"} · first seen {when(item.firstSeenAt)} · last change {when(item.lastChangedAt)}
      {item.nextAttemptAt && item.status !== "DEAD_LETTER" ? ` · next try ${when(item.nextAttemptAt)}` : ""}
      {item.payloadBytes !== null ? ` · payload ${item.payloadBytes} bytes, not shown` : ""}
    </p>
    <p>{ids.filter(([, value]) => value).map(([label, value], index) => <span key={label}>
      {index > 0 ? " · " : ""}{label} <span className="select-all font-mono text-xs">{value}</span>
    </span>)}</p>
    <p className="cr-muted">Record <span className="select-all font-mono text-xs">{item.id}</span></p>
    {retriedReference !== undefined && <p className="cr-feedback" role="status">
      Queued for one more attempt{retriedReference ? `, reference ${retriedReference}` : ""}. Show the list again in a minute to see how it went.
    </p>}
    {item.source === "DELIVERY_WEBHOOK" && item.status === "DEAD_LETTER" && retriedReference === undefined && <span className="cr-actions">
      <button type="button" className="cr-button" disabled={busy} onClick={onRetry}>Retry once</button>
    </span>}
  </article>;
}
