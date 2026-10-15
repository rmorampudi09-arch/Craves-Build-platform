"use client";

import { chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, FileText, Info, Mail, RefreshCw } from "lucide-react";
import { documentCapabilitiesSchema, documentEmailSchema, documentError, documentLabels, documentPageSchema, documentRequestSchema, documentSummarySchema, type DocumentCapabilities, type DocumentSummary, type DocumentType } from "@/features/chef-onboarding/lib/document-contract";
import { readDocumentBytes } from "@/shared/lib/document-transport";
import { ChefChoiceChips, ChefEmpty, ChefFlash, ChefNotice, ChefPill, ChefSection, dateTime, type ChefTone } from "@/features/chef/components/chef-ui";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { STATEMENT_PRESETS, dayAfter, indiaDate, periodLabel, presetPeriod, referencePeriodLabel, type StatementPreset } from "@/features/chef/lib/statement-periods";

type OrderOption = { id: string; kitchenName: string; currency: string };
type Props = { mode: "customer" | "chef"; orders?: OrderOption[] };
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-primary disabled:cursor-not-allowed disabled:opacity-50";
const input = "mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-ink";
const chefDate = "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base font-normal text-[#1A1A1A]";
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
// Chef words for the three statements, their states and the emailed copy.
const CHEF_TYPES: { type: DocumentType; label: string }[] = [
  { type: "CHEF_EARNINGS_STATEMENT", label: "Earnings" },
  { type: "CHEF_ORDER_STATEMENT", label: "Orders" },
  { type: "CHEF_SETTLEMENT_STATEMENT", label: "Money sent to bank" },
];
const DAY_CHOICES: { value: StatementPreset | "custom"; label: string }[] = [...STATEMENT_PRESETS, { value: "custom", label: "Choose dates" }];
const CHEF_STATUS: Record<DocumentSummary["status"], { label: string; tone: ChefTone }> = {
  QUEUED: { label: "Waiting", tone: "muted" },
  RENDERING: { label: "Being made", tone: "active" },
  READY: { label: "Ready", tone: "success" },
  FAILED: { label: "Couldn’t make it", tone: "danger" },
};
const CHEF_EMAIL: Record<string, string> = {
  QUEUED: "Sending the email…",
  SENDING: "Sending the email…",
  ACCEPTED: "Email sent. Check your inbox and spam folder.",
  FAILED: "The email didn’t send. Try again.",
  UNKNOWN: "We’re not sure the email went. We won’t send it again by ourselves.",
};
function dateLabel(value: string) { return new Date(value).toLocaleString("en-IN"); }
async function jsonRequest(path: string, signal: AbortSignal, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]) });
  const raw: unknown = await response.json();
  if (!response.ok) {
    const code = raw && typeof raw === "object" && "code" in raw && typeof raw.code === "string" ? raw.code : "DOCUMENT_OPERATION_FAILED";
    throw new ChefError(documentError(code), code, response.status);
  }
  return raw;
}

export function DocumentCenter({ mode, orders = [] }: Props) {
  const [capabilities, setCapabilities] = useState<DocumentCapabilities | null>(null);
  const [selectedOrder, setSelectedOrder] = useState("");
  const [type, setType] = useState<DocumentType>(mode === "chef" ? "CHEF_EARNINGS_STATEMENT" : "ORDER_SUMMARY");
  const [from, setFrom] = useState(() => today().slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [preset, setPreset] = useState<StatementPreset | "custom">("this-month");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const currency = "INR";
  const [items, setItems] = useState<DocumentSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Chef mode: "done" messages show for a moment; advice ("still being made") stays in `message`.
  const [notice, setNotice] = useState("");
  const [historyReady, setHistoryReady] = useState(false);
  const [error, setError] = useState("");
  const [emailState, setEmailState] = useState<Record<string, string>>({});
  const lifetime = useRef<AbortController | null>(null);
  const keys = useRef(new Map<string, string>());
  const historyEpoch = useRef(0);
  const orderId = selectedOrder || orders[0]?.id || "";
  const currentCurrency = mode === "customer" ? orders.find((order) => order.id === orderId)?.currency ?? "INR" : currency;
  const query = mode === "customer" ? `reference=${encodeURIComponent(orderId)}` : `type=${type}`;
  // Chefs pick a preset or a first and last day; the API still gets [from, to) with `to` the day after.
  const period = preset === "custom" ? { from, to: to ? dayAfter(to) : "" } : presetPeriod(preset, indiaDate());
  const keyFor = (meaning: string) => {
    let key = keys.current.get(meaning);
    if (!key) { key = crypto.randomUUID(); keys.current.set(meaning, key); }
    return key;
  };

  useEffect(() => {
    const abort = new AbortController(); lifetime.current = abort;
    void jsonRequest("/api/documents/capabilities", abort.signal).then((raw) => setCapabilities(documentCapabilitiesSchema.parse(raw))).catch((caught) => {
      if (!abort.signal.aborted) setError(chefErrorText(caught, "Document capabilities are unavailable."));
    });
    return () => { abort.abort(); lifetime.current = null; };
  }, []);

  const loadHistory = useCallback(async (append = false, next: string | null = null) => {
    const signal = lifetime.current?.signal;
    if (!signal || (mode === "customer" && !orderId)) return;
    const epoch = historyEpoch.current;
    const page = documentPageSchema.parse(await jsonRequest(`/api/documents?limit=20&${query}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`, signal));
    if (signal.aborted || epoch !== historyEpoch.current) return;
    setItems((old) => append ? [...old, ...page.items.filter((item) => !old.some((existing) => existing.id === item.id))] : page.items);
    setCursor(page.nextCursor ?? null);
  }, [mode, orderId, query]);

  useEffect(() => {
    historyEpoch.current += 1;
    if (!capabilities?.enabled) return;
    void loadHistory()
      .catch((caught) => { if (!lifetime.current?.signal.aborted) setError(chefErrorText(caught, "Document history is unavailable.")); })
      .finally(() => setHistoryReady(true));
  }, [capabilities?.enabled, loadHistory]);

  async function action(work: () => Promise<void>) {
    if (busy || !lifetime.current) return;
    setBusy(true); setError(""); setMessage(""); setNotice("");
    try { await work(); } catch (caught) {
      if (!lifetime.current?.signal.aborted) setError(chefErrorText(caught, "The document operation failed."));
    } finally { setBusy(false); }
  }
  async function pollDocument(created: DocumentSummary, signal: AbortSignal) {
    let latest = created;
    for (let attempt = 0; attempt < 12 && ["QUEUED", "RENDERING"].includes(latest.status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (signal.aborted) return;
      const fresh = documentSummarySchema.parse(await jsonRequest(`/api/documents/${latest.id}`, signal));
      latest = fresh;
      setItems((old) => old.map((item) => item.id === fresh.id ? fresh : item));
    }
    if (latest.status === "READY") done("Your PDF is ready to download or email.");
    else setMessage(latest.status === "FAILED" ? "We couldn’t make this PDF. Try again, or ask Craves for help." : "Your PDF is still being made. Tap Refresh in a minute instead of making another one.");
  }
  function done(text: string) {
    if (mode === "chef") setNotice(text);
    else setMessage(text);
  }
  async function generate() {
    const signal = lifetime.current!.signal;
    const request = documentRequestSchema.safeParse({ type, ...(mode === "customer" ? { sourceId: orderId } : period), timezone, currency: currentCurrency });
    if (!request.success) throw new Error(request.error.issues[0]?.message || "Review the document fields.");
    const body = JSON.stringify(request.data); const meaning = `generate:${body}`;
    const result = documentSummarySchema.parse(await jsonRequest("/api/documents", signal, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": keyFor(meaning) }, body }));
    setItems((old) => [result, ...old.filter((item) => item.id !== result.id)]);
    await pollDocument(result, signal);
  }
  async function download(item: DocumentSummary) {
    const signal = lifetime.current!.signal;
    const response = await fetch(`/api/documents/${item.id}/download`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]) });
    if (!response.ok) throw new ChefError("The PDF could not be downloaded. Refresh the history and try again.", chefApiError(response, await response.json().catch(() => null), "").ref, response.status);
    const bytes = await readDocumentBytes(response.body, 4 * 1024 * 1024, 30000);
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-" || bytes.length !== item.bytes) throw new Error("The document failed the file-integrity check.");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer))).map((value) => value.toString(16).padStart(2, "0")).join("");
    if (digest !== item.sha256) throw new Error("The document failed the file-integrity check.");
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }));
    const link = document.createElement("a"); link.href = url; link.download = `craves-${item.id}.pdf`; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    done("PDF downloaded.");
  }
  async function email(item: DocumentSummary) {
    const signal = lifetime.current!.signal;
    const result = documentEmailSchema.parse(await jsonRequest(`/api/documents/${item.id}/email`, signal, { method: "POST", headers: { "Idempotency-Key": keyFor(`email:${item.id}`) } }));
    setEmailState((old) => ({ ...old, [item.id]: result.status }));
    done(mode === "chef" ? "We’re emailing a copy to your Craves email." : "Email copy queued for your current verified account email. Provider acceptance is not confirmation of inbox delivery.");
  }
  async function refresh() {
    await loadHistory();
    const signal = lifetime.current!.signal;
    for (const id of Object.keys(emailState).slice(0, 10)) {
      const raw = await jsonRequest(`/api/documents/${id}/emails`, signal);
      if (!Array.isArray(raw)) throw new Error("Invalid email history.");
      const latest = raw[0] ? documentEmailSchema.parse(raw[0]) : null;
      if (latest) setEmailState((old) => ({ ...old, [id]: latest.status }));
    }
  }

  if (capabilities && !capabilities.enabled) return mode === "customer" ? null : <ChefSection><ChefEmpty icon={FileText} title="PDFs aren’t switched on yet" text="Craves will turn them on soon. Your earnings and payouts are still in Earnings." /></ChefSection>;
  if (mode === "customer" && !orders.length) return null;
  if (mode === "chef") {
    // Until PDFs are known to be on and the first list is in, the form could vanish and "No PDFs yet" be untrue.
    if (!error && (!capabilities || !historyReady)) return <ChefLoading shape="statements" head={false} label="Loading your statements" />;
    const periodReady = documentRequestSchema.safeParse({ type, ...period, timezone, currency }).success;
    const typeLabel = CHEF_TYPES.find((option) => option.type === type)?.label ?? documentLabels[type];
    return (
      <div className="chef-stack">
        <ChefSection title="Make a PDF" note="A record of your orders and money for the days you choose. It isn’t a GST tax invoice." labelledBy="chef-pdf-make">
          <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); void action(generate); }}>
            <ChefChoiceChips
              legend="What should it show?"
              name="chef-pdf-type"
              options={CHEF_TYPES.map((option) => ({ value: option.type, label: option.label }))}
              value={type}
              onChange={setType}
              disabled={busy}
            />
            <ChefChoiceChips legend="Which days?" name="chef-pdf-days" options={DAY_CHOICES} value={preset} onChange={setPreset} disabled={busy}>
              {preset === "custom" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="chef-field-label">First day<input className={chefDate} type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} required disabled={busy} /></label>
                  <label className="chef-field-label">Last day<input className={chefDate} type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} required disabled={busy} /></label>
                </div>
              ) : null}
              <p className="chef-section-note !text-[0.9375rem]">
                {periodReady ? periodLabel(period.from, period.to) : "Choose a first and last day, 31 days at most."}
              </p>
            </ChefChoiceChips>
            <button className="chef-btn is-primary is-block sm:w-fit" type="submit" aria-busy={busy} disabled={busy || !capabilities?.enabled || !periodReady}>{busy ? "Working…" : "Make PDF"}</button>
          </form>
          <div aria-live="polite" className="mt-4 grid gap-3 empty:hidden">
            {error ? <ChefNotice icon={AlertTriangle} tone="danger" role="alert">{error}</ChefNotice> : null}
            {message ? <ChefNotice icon={Info}>{message}</ChefNotice> : null}
          </div>
          <ChefFlash message={notice} onClose={() => setNotice("")} />
        </ChefSection>

        <ChefSection
          title={`Your ${typeLabel.toLowerCase()} PDFs`}
          flush
          labelledBy="chef-pdf-list"
          action={<button className="chef-btn is-small" type="button" disabled={busy || !capabilities?.enabled} onClick={() => void action(refresh)}><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh</button>}
        >
          {items.length === 0 ? (
            <ChefEmpty icon={FileText} title="No PDFs yet" text="PDFs you make show here, ready to download." />
          ) : (
            <ul className="chef-list border-t border-[#E3E6EA]">
              {items.map((item) => {
                const state = CHEF_STATUS[item.status];
                return (
                  <li key={item.id} className="px-4 py-3.5 md:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="chef-row-title">{referencePeriodLabel(item.reference)}</p>
                        <p className="chef-row-meta">{CHEF_TYPES.find((option) => option.type === item.type)?.label ?? documentLabels[item.type]}, made {dateTime(item.createdAt)}</p>
                      </div>
                      <ChefPill tone={state.tone}>{state.label}</ChefPill>
                    </div>
                    {item.errorCode ? <p className="chef-field-error">{documentError(item.errorCode)}</p> : null}
                    {emailState[item.id] ? <p role="status" className="chef-row-meta mt-2">{CHEF_EMAIL[emailState[item.id]] ?? ""}</p> : null}
                    {item.status === "READY" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className="chef-btn is-small" type="button" disabled={busy} onClick={() => void action(() => download(item))}><Download className="h-4 w-4" aria-hidden="true" />Download</button>
                        {capabilities?.emailEnabled ? <button className="chef-btn is-small is-quiet" type="button" disabled={busy} onClick={() => void action(() => email(item))}><Mail className="h-4 w-4" aria-hidden="true" />Email me a copy</button> : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {cursor ? <div className="border-t border-[#E3E6EA] px-4 py-3 md:px-5"><button className="chef-btn is-small" type="button" disabled={busy} onClick={() => void action(() => loadHistory(true, cursor))}>Show older PDFs</button></div> : null}
        </ChefSection>
      </div>
    );
  }
  const types: DocumentType[] = ["ORDER_SUMMARY", "PAYMENT_RECEIPT"];
  return (
    <section className="mt-6 rounded-2xl border border-border bg-white p-5 text-ink shadow-sm md:p-6" aria-label="Order PDF documents">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-display text-xl font-bold"><FileText className="h-5 w-5" aria-hidden="true" />Receipts and order documents</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Generate a private PDF from your saved records. Email copies go only to your verified account email. These documents are not GST tax invoices.</p></div><button className={button} type="button" disabled={busy || !capabilities?.enabled} onClick={() => void action(refresh)}><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh</button></div>
      <form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void action(generate); }}>
        <label className="text-sm font-medium">Order<select className={input} value={orderId} onChange={(event) => setSelectedOrder(event.target.value)} disabled={busy}>{orders.map((order) => <option key={order.id} value={order.id}>{order.kitchenName} · #{shortOrderNumber(order.id)}</option>)}</select></label>
        <label className="text-sm font-medium">Document type<select className={input} value={type} onChange={(event) => setType(event.target.value as DocumentType)} disabled={busy}>{types.map((kind) => <option key={kind} value={kind}>{documentLabels[kind]}</option>)}</select></label>
        <label className="text-sm font-medium">Timezone<input className={input} value={timezone} onChange={(event) => setTimezone(event.target.value)} maxLength={80} required disabled={busy} /></label>
        <div className="flex items-end"><button className={`${button} w-full`} type="submit" disabled={busy || !capabilities?.enabled}>{busy ? "Working…" : "Generate PDF"}</button></div>
      </form>
      <div aria-live="polite" className="mt-4">{error && <p role="alert" className="rounded-xl border border-error/30 p-3 text-sm text-error">{error}</p>}{message && <p className="rounded-xl bg-secondary p-3 text-sm">{message}</p>}{!capabilities && !error && <p className="text-sm text-muted-foreground">Checking document availability…</p>}</div>
      <div className="mt-5 space-y-3">{items.map((item) => <article key={item.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{documentLabels[item.type]}</h3><p className="mt-1 break-all text-xs text-muted-foreground">{item.reference}</p><p className="mt-1 text-xs text-muted-foreground">{dateLabel(item.createdAt)} · {item.currency} · {item.status}</p>{item.errorCode && <p className="mt-2 text-sm text-error">{documentError(item.errorCode)}</p>}{emailState[item.id] && <p className="mt-2 text-xs">Email: {emailState[item.id]}{emailState[item.id] === "ACCEPTED" ? " by provider (inbox delivery not confirmed)" : emailState[item.id] === "UNKNOWN" ? " — no automatic resend" : ""}</p>}</div><div className="flex flex-wrap items-center gap-2"><button className={button} type="button" disabled={busy || item.status !== "READY"} onClick={() => void action(() => download(item))}><Download className="h-4 w-4" aria-hidden="true" />Download</button><button className={button} type="button" disabled={busy || item.status !== "READY" || !capabilities?.emailEnabled} onClick={() => void action(() => email(item))}><Mail className="h-4 w-4" aria-hidden="true" />Email copy</button></div></div></article>)}</div>
      {capabilities?.enabled && !items.length && <p className="mt-4 text-sm text-muted-foreground">No saved documents for this selection yet.</p>}
      {cursor && <button className={`${button} mt-4`} type="button" disabled={busy} onClick={() => void action(() => loadHistory(true, cursor))}>Load older documents</button>}
    </section>
  );
}

export function OrderDocumentsPanel({ orders }: { orders: OrderOption[] }) { return <DocumentCenter mode="customer" orders={orders} />; }
