"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Mail, RefreshCw } from "lucide-react";
import { documentCapabilitiesSchema, documentEmailSchema, documentError, documentLabels, documentPageSchema, documentRequestSchema, documentSummarySchema, type DocumentCapabilities, type DocumentSummary, type DocumentType } from "@/lib/document-contract";
import { readDocumentBytes } from "@/lib/document-transport";

type OrderOption = { id: string; kitchenName: string; currency: string };
type Props = { mode: "customer" | "chef"; orders?: OrderOption[] };
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-primary disabled:cursor-not-allowed disabled:opacity-50";
const input = "mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-ink";
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function dateLabel(value: string) { return new Date(value).toLocaleString("en-IN"); }
async function jsonRequest(path: string, signal: AbortSignal, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]) });
  const raw: unknown = await response.json();
  if (!response.ok) {
    const code = raw && typeof raw === "object" && "code" in raw && typeof raw.code === "string" ? raw.code : "DOCUMENT_OPERATION_FAILED";
    throw new Error(documentError(code));
  }
  return raw;
}

export function DocumentCenter({ mode, orders = [] }: Props) {
  const [capabilities, setCapabilities] = useState<DocumentCapabilities | null>(null);
  const [selectedOrder, setSelectedOrder] = useState("");
  const [type, setType] = useState<DocumentType>(mode === "chef" ? "CHEF_EARNINGS_STATEMENT" : "ORDER_SUMMARY");
  const [from, setFrom] = useState(() => today().slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [currency, setCurrency] = useState("INR");
  const [items, setItems] = useState<DocumentSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [emailState, setEmailState] = useState<Record<string, string>>({});
  const lifetime = useRef<AbortController | null>(null);
  const keys = useRef(new Map<string, string>());
  const historyEpoch = useRef(0);
  const orderId = selectedOrder || orders[0]?.id || "";
  const currentCurrency = mode === "customer" ? orders.find((order) => order.id === orderId)?.currency ?? "INR" : currency;
  const query = mode === "customer" ? `reference=${encodeURIComponent(orderId)}` : `type=${type}`;
  const keyFor = (meaning: string) => {
    let key = keys.current.get(meaning);
    if (!key) { key = crypto.randomUUID(); keys.current.set(meaning, key); }
    return key;
  };

  useEffect(() => {
    const abort = new AbortController(); lifetime.current = abort;
    void jsonRequest("/api/documents/capabilities", abort.signal).then((raw) => setCapabilities(documentCapabilitiesSchema.parse(raw))).catch((caught) => {
      if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : "Document capabilities are unavailable.");
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
    void loadHistory().catch((caught) => { if (!lifetime.current?.signal.aborted) setError(caught instanceof Error ? caught.message : "Document history is unavailable."); });
  }, [capabilities?.enabled, loadHistory]);

  async function action(work: () => Promise<void>) {
    if (busy || !lifetime.current) return;
    setBusy(true); setError(""); setMessage("");
    try { await work(); } catch (caught) {
      if (!lifetime.current?.signal.aborted) setError(caught instanceof Error ? caught.message : "The document operation failed.");
    } finally { setBusy(false); }
  }
  async function pollDocument(document: DocumentSummary, signal: AbortSignal) {
    for (let attempt = 0; attempt < 12 && ["QUEUED", "RENDERING"].includes(document.status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (signal.aborted) return;
      document = documentSummarySchema.parse(await jsonRequest(`/api/documents/${document.id}`, signal));
      setItems((old) => old.map((item) => item.id === document.id ? document : item));
    }
    setMessage(document.status === "READY" ? "Your PDF is ready to download or email." : document.status === "FAILED" ? "PDF generation failed. The saved record remains available for support investigation." : "Generation is still queued. Refresh the history to check progress; do not create another copy.");
  }
  async function generate() {
    const signal = lifetime.current!.signal;
    const request = documentRequestSchema.safeParse({ type, ...(mode === "customer" ? { sourceId: orderId } : { from, to }), timezone, currency: currentCurrency });
    if (!request.success) throw new Error(request.error.issues[0]?.message || "Review the document fields.");
    const body = JSON.stringify(request.data); const meaning = `generate:${body}`;
    const result = documentSummarySchema.parse(await jsonRequest("/api/documents", signal, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": keyFor(meaning) }, body }));
    setItems((old) => [result, ...old.filter((item) => item.id !== result.id)]);
    await pollDocument(result, signal);
  }
  async function download(item: DocumentSummary) {
    const signal = lifetime.current!.signal;
    const response = await fetch(`/api/documents/${item.id}/download`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]) });
    if (!response.ok) throw new Error("The PDF could not be downloaded. Refresh the history and try again.");
    const bytes = await readDocumentBytes(response.body, 4 * 1024 * 1024, 30000);
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-" || bytes.length !== item.bytes) throw new Error("The document failed the file-integrity check.");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer))).map((value) => value.toString(16).padStart(2, "0")).join("");
    if (digest !== item.sha256) throw new Error("The document failed the file-integrity check.");
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }));
    const link = document.createElement("a"); link.href = url; link.download = `craves-${item.id}.pdf`; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMessage("The saved PDF was downloaded and its integrity verified.");
  }
  async function email(item: DocumentSummary) {
    const signal = lifetime.current!.signal;
    const result = documentEmailSchema.parse(await jsonRequest(`/api/documents/${item.id}/email`, signal, { method: "POST", headers: { "Idempotency-Key": keyFor(`email:${item.id}`) } }));
    setEmailState((old) => ({ ...old, [item.id]: result.status }));
    setMessage("Email copy queued for your current verified account email. Provider acceptance is not confirmation of inbox delivery.");
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

  if (capabilities && !capabilities.enabled) return mode === "customer" ? null : <p className="rounded-xl border border-border p-5">Document generation has not been activated yet.</p>;
  if (mode === "customer" && !orders.length) return null;
  const types: DocumentType[] = mode === "chef" ? ["CHEF_ORDER_STATEMENT", "CHEF_EARNINGS_STATEMENT", "CHEF_SETTLEMENT_STATEMENT"] : ["ORDER_SUMMARY", "PAYMENT_RECEIPT"];
  return (
    <section className="mt-6 rounded-2xl border border-border bg-white p-5 text-ink shadow-sm md:p-6" aria-label={mode === "chef" ? "Chef PDF statements" : "Order PDF documents"}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-display text-xl font-bold"><FileText className="h-5 w-5" aria-hidden="true" />{mode === "chef" ? "Statements and saved documents" : "Receipts and order documents"}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Generate a private PDF from your saved records. Email copies go only to your verified account email. These documents are not GST tax invoices.</p></div><button className={button} type="button" disabled={busy || !capabilities?.enabled} onClick={() => void action(refresh)}><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh</button></div>
      <form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void action(generate); }}>
        {mode === "customer" && <label className="text-sm font-medium">Order<select className={input} value={orderId} onChange={(event) => setSelectedOrder(event.target.value)} disabled={busy}>{orders.map((order) => <option key={order.id} value={order.id}>{order.kitchenName} · {order.id.slice(-8).toUpperCase()}</option>)}</select></label>}
        <label className="text-sm font-medium">Document type<select className={input} value={type} onChange={(event) => setType(event.target.value as DocumentType)} disabled={busy}>{types.map((kind) => <option key={kind} value={kind}>{documentLabels[kind]}</option>)}</select></label>
        {mode === "chef" && <><label className="text-sm font-medium">From (included)<input className={input} type="date" value={from} onChange={(event) => setFrom(event.target.value)} required disabled={busy} /></label><label className="text-sm font-medium">To (not included)<input className={input} type="date" value={to} onChange={(event) => setTo(event.target.value)} required disabled={busy} /></label><label className="text-sm font-medium">Currency<input className={input} value={currency} maxLength={3} pattern="[A-Z]{3}" onChange={(event) => setCurrency(event.target.value.toUpperCase())} required disabled={busy} /></label></>}
        <label className="text-sm font-medium">Timezone<input className={input} value={timezone} onChange={(event) => setTimezone(event.target.value)} maxLength={80} required disabled={busy} /></label>
        <div className="flex items-end"><button className={`${button} w-full`} type="submit" disabled={busy || !capabilities?.enabled}>{busy ? "Working…" : "Generate PDF"}</button></div>
      </form>
      {mode === "chef" && <p className="mt-3 text-xs text-muted-foreground">Choose 1–31 days. To include all of September, select September 1 through October 1. More than 1,000 records requires a shorter period; statements are never silently truncated.</p>}
      <div aria-live="polite" className="mt-4">{error && <p role="alert" className="rounded-xl border border-error/30 p-3 text-sm text-error">{error}</p>}{message && <p className="rounded-xl bg-secondary p-3 text-sm">{message}</p>}{!capabilities && !error && <p className="text-sm text-muted-foreground">Checking document availability…</p>}</div>
      <div className="mt-5 space-y-3">{items.map((item) => <article key={item.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{documentLabels[item.type]}</h3><p className="mt-1 break-all text-xs text-muted-foreground">{item.reference}</p><p className="mt-1 text-xs text-muted-foreground">{dateLabel(item.createdAt)} · {item.currency} · {item.status}</p>{item.errorCode && <p className="mt-2 text-sm text-error">{documentError(item.errorCode)}</p>}{emailState[item.id] && <p className="mt-2 text-xs">Email: {emailState[item.id]}{emailState[item.id] === "ACCEPTED" ? " by provider (inbox delivery not confirmed)" : emailState[item.id] === "UNKNOWN" ? " — no automatic resend" : ""}</p>}</div><div className="flex flex-wrap items-center gap-2"><button className={button} type="button" disabled={busy || item.status !== "READY"} onClick={() => void action(() => download(item))}><Download className="h-4 w-4" aria-hidden="true" />Download</button><button className={button} type="button" disabled={busy || item.status !== "READY" || !capabilities?.emailEnabled} onClick={() => void action(() => email(item))}><Mail className="h-4 w-4" aria-hidden="true" />Email copy</button></div></div></article>)}</div>
      {capabilities?.enabled && !items.length && <p className="mt-4 text-sm text-muted-foreground">No saved documents for this selection yet.</p>}
      {cursor && <button className={`${button} mt-4`} type="button" disabled={busy} onClick={() => void action(() => loadHistory(true, cursor))}>Load older documents</button>}
    </section>
  );
}

export function OrderDocumentsPanel({ orders }: { orders: OrderOption[] }) { return <DocumentCenter mode="customer" orders={orders} />; }
