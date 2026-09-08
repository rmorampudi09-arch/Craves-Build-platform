"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, Bot, CheckCircle2, Clock3, Crosshair, MapPin,
  RefreshCw, Route, Search, ShieldCheck, Sparkles, Truck, Waypoints, XCircle
} from "lucide-react";
import type { DeliveryInvestigation, DeliverySummary } from "@/lib/admin-delivery-intelligence-contract";

const windows = [
  { label: "24 hours", value: 24 },
  { label: "7 days", value: 168 },
  { label: "30 days", value: 720 }
];

function number(value: number) { return new Intl.NumberFormat("en-IN").format(value); }
function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function score(value: number | null | undefined) { return value == null ? "—" : value.toFixed(1); }
function money(value: number | null | undefined, currency: string | null | undefined) {
  if (value == null) return "—";
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR" }).format(value); }
  catch { return `${currency || ""} ${value.toFixed(2)}`.trim(); }
}
function shortId(value: string) { return `${value.slice(0, 8)}…${value.slice(-4)}`; }
function statusTone(value: string | null | undefined) {
  const v = (value || "").toUpperCase();
  if (["DELIVERED", "ACCEPTED", "COMPLETED", "PROCESSED", "PUBLISHED", "ASSIGNED"].some(x => v.includes(x))) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["FAILED", "DEAD_LETTER", "REJECTED", "EXHAUSTED"].some(x => v.includes(x))) return "bg-rose-50 text-rose-700 border-rose-200";
  if (["DECLINED", "RETRY", "RECONCIL", "PENDING"].some(x => v.includes(x))) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function Status({ value }: { value: string | null | undefined }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${statusTone(value)}`}>{value || "UNKNOWN"}</span>;
}

function MetricCard({ label, value, helper, icon: Icon, danger = false }: { label: string; value: string; helper: string; icon: typeof Activity; danger?: boolean }) {
  return <section className="rounded-[26px] border border-[#e6deec] bg-white p-5 shadow-[0_16px_38px_-34px_rgba(45,24,72,.45)]">
    <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#8b7c96]">{label}</p><span className={`grid h-9 w-9 place-items-center rounded-xl ${danger ? "bg-rose-50 text-rose-600" : "bg-[#f1eafb] text-[#6930ca]"}`}><Icon size={17}/></span></div>
    <p className="mt-4 text-3xl font-black tracking-tight text-[#251b35]">{value}</p>
    <p className={`mt-1 text-xs font-bold ${danger ? "text-rose-600" : "text-[#71677d]"}`}>{helper}</p>
  </section>;
}

function TrendChart({ data }: { data: DeliverySummary["trend"] }) {
  const max = Math.max(1, ...data.flatMap(point => [point.assignments, point.delivered]));
  return <div className="mt-5 overflow-x-auto"><div className="flex h-56 min-w-[620px] items-end gap-3 border-b border-[#e8e1ee] pb-7">
    {data.map(point => <div key={point.day} className="group relative flex min-w-0 flex-1 items-end justify-center gap-1.5">
      <div title={`Assignments: ${point.assignments}`} className="w-[34%] min-w-2 rounded-t-lg bg-[#d7c5ef] transition group-hover:bg-[#b999e2]" style={{ height: `${Math.max(4, point.assignments / max * 170)}px` }} />
      <div title={`Delivered: ${point.delivered}`} className="w-[34%] min-w-2 rounded-t-lg bg-[#6930ca] transition group-hover:bg-[#5420ac]" style={{ height: `${Math.max(4, point.delivered / max * 170)}px` }} />
      <span className="absolute -bottom-6 whitespace-nowrap text-[9px] font-bold text-[#8b7c96]">{new Date(`${point.day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
    </div>)}
  </div><div className="mt-4 flex gap-5 text-[10px] font-bold text-[#71677d]"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded bg-[#d7c5ef]"/>Assignments</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded bg-[#6930ca]"/>Delivered</span></div></div>;
}

function Overview({ summary, onInvestigate }: { summary: DeliverySummary; onInvestigate: (orderId: string) => void }) {
  const m = summary.metrics;
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Assignments" value={number(m.assignments)} helper={`${summary.windowHours}h routing decisions`} icon={Bot}/>
      <MetricCard label="Delivered" value={number(m.delivered)} helper={`${m.active} currently active`} icon={CheckCircle2}/>
      <MetricCard label="Fallbacks" value={number(m.fallbacks)} helper="Selected candidate rank > 1" icon={Waypoints}/>
      <MetricCard label="Needs attention" value={number(m.failed + m.deadLetters + m.webhookFailures)} helper={`${m.failed} jobs · ${m.deadLetters} dead-letter · ${m.webhookFailures} webhook`} icon={AlertTriangle} danger/>
    </div>

    <div className="mt-5 grid gap-5 2xl:grid-cols-[1.45fr_.85fr]">
      <section className="rounded-[28px] border border-[#e6deec] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black text-[#251b35]">Delivery activity</h2><p className="mt-1 text-xs text-[#7c7085]">Intelligence assignments compared with completed deliveries.</p></div><span className="rounded-xl bg-[#f1eafb] px-3 py-2 text-[10px] font-black text-[#6930ca]">NEWEST AT RIGHT</span></div>
        <TrendChart data={summary.trend}/>
      </section>
      <section className="rounded-[28px] border border-[#e6deec] bg-white p-6">
        <div className="flex items-start justify-between"><div><h2 className="text-lg font-black">Provider performance</h2><p className="mt-1 text-xs text-[#7c7085]">Persisted outcomes and selection volume.</p></div><Route className="text-[#6930ca]" size={21}/></div>
        <div className="mt-5 space-y-3">{summary.providers.slice(0, 6).map(provider => <div key={provider.providerId} className="rounded-2xl border border-[#eee8f2] bg-[#fbfafd] p-4">
          <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black">{provider.displayName}</p><p className="text-[10px] font-semibold text-[#94889c]">{provider.providerId}</p></div><span className={`h-2.5 w-2.5 rounded-full ${provider.active ? "bg-emerald-500" : "bg-slate-300"}`} title={provider.active ? "Registry active" : "Registry inactive"}/></div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><b className="block text-base">{number(provider.selections)}</b><span className="text-[9px] uppercase text-[#94889c]">selected</span></div><div><b className="block text-base">{score(provider.averageOutcomeScore)}</b><span className="text-[9px] uppercase text-[#94889c]">live score</span></div><div><b className="block text-base">{score(provider.storedAverageScore)}</b><span className="text-[9px] uppercase text-[#94889c]">stored score</span></div></div>
        </div>)}</div>
      </section>
    </div>

    <div className="mt-5 grid gap-5 2xl:grid-cols-[1.4fr_.9fr]">
      <section className="rounded-[28px] border border-[#e6deec] bg-white p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black">Recent engine decisions</h2><p className="mt-1 text-xs text-[#7c7085]">Newest first. Open an order to see the complete persisted reasoning trail.</p></div><Sparkles className="text-[#f19a35]" size={20}/></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-[9px] font-black uppercase tracking-[.12em] text-[#94889c]"><tr><th className="pb-3">Order</th><th>Provider</th><th>Rank</th><th>Final score</th><th>Pickup ETA</th><th>Decision</th><th>When</th><th/></tr></thead><tbody>{summary.recentDecisions.map(row => <tr key={row.assignmentId} className="border-t border-[#eee8f2]"><td className="py-3 font-mono font-bold">{shortId(row.orderId)}</td><td className="font-bold">{row.selectedProviderId || "—"}</td><td>{row.selectedRank ?? "—"}</td><td>{score(row.finalScore)}</td><td>{row.pickupEtaMinutes == null ? "—" : `${row.pickupEtaMinutes.toFixed(0)}m`}</td><td><Status value={row.candidateStatus || row.assignmentStatus}/></td><td className="text-[#7c7085]">{dateTime(row.createdAt)}</td><td><button onClick={() => onInvestigate(row.orderId)} className="rounded-xl border border-[#d8c9e5] p-2 text-[#6930ca] hover:bg-[#f1eafb]" aria-label={`Investigate order ${row.orderId}`}><ArrowRight size={15}/></button></td></tr>)}</tbody></table></div>
      </section>
      <section className="rounded-[28px] border border-[#f0d6d9] bg-white p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Operational exceptions</h2><p className="mt-1 text-xs text-[#7c7085]">Failed or dead-letter delivery commands.</p></div><XCircle className="text-rose-500" size={21}/></div>
        <div className="mt-4 space-y-2">{summary.exceptions.length ? summary.exceptions.map(item => <button key={item.commandId} onClick={() => onInvestigate(item.orderId)} className="w-full rounded-2xl border border-rose-100 bg-rose-50/60 p-3 text-left transition hover:bg-rose-50"><div className="flex items-center justify-between gap-3"><Status value={item.status}/><span className="text-[10px] font-bold text-[#8c7d95]">attempt {item.attemptCount}</span></div><p className="mt-2 truncate text-xs font-bold text-[#4f405b]">Order {shortId(item.orderId)}</p><p className="mt-1 line-clamp-2 text-[10px] text-rose-700">{item.lastError || "No sanitized error text recorded."}</p></button>) : <p className="rounded-2xl bg-emerald-50 p-5 text-sm font-bold text-emerald-700">No failed/dead-letter commands in this window.</p>}</div>
      </section>
    </div>
  </>;
}

function InvestigationView({ data, correlationId }: { data: DeliveryInvestigation; correlationId: string | null }) {
  const currentJob = data.jobs.at(-1);
  const timeline = useMemo(() => [
    ...data.commands.map(x => ({ at: x.createdAt, type: `COMMAND · ${x.commandType}`, status: x.status, detail: x.lastError || `Attempt ${x.attemptCount}` })),
    ...data.events.map(x => ({ at: x.occurredAt, type: x.eventType, status: x.normalizedStatus || "PROVIDER_EVENT", detail: `${x.providerId}${x.providerEventId ? ` · ${x.providerEventId}` : ""}` })),
    ...data.outcomes.map(x => ({ at: x.occurredAt, type: "OUTCOME", status: x.status, detail: `${x.providerId} · score ${x.compositeScore.toFixed(1)}` }))
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [data]);

  return <div className="space-y-5">
    <section className="rounded-[28px] border border-[#e6deec] bg-gradient-to-br from-white to-[#faf7fd] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-[#8b7c96]">Investigating order</p><h2 className="mt-2 break-all font-mono text-xl font-black text-[#251b35]">{data.orderId}</h2><p className="mt-2 text-xs text-[#7c7085]">Correlation {correlationId || "—"}</p></div>{currentJob ? <Status value={currentJob.status}/> : <Status value={data.assignment?.status}/>}</div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[['Provider', currentJob?.providerId || data.assignment?.selectedProviderId || '—'],['Strategy', data.assignment?.strategy || '—'],['Scoring', data.assignment?.scoringVersion || '—'],['Provider status', currentJob?.providerStatus || '—'],['Telemetry', currentJob?.telemetrySource || currentJob?.lastStatusSource || '—']].map(([label,value]) => <div key={label} className="rounded-2xl border border-[#eee8f2] bg-white p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-[#94889c]">{label}</p><p className="mt-2 break-words text-sm font-black">{value}</p></div>)}
      </div>
    </section>

    {currentJob && <section className="rounded-[28px] border border-[#e6deec] bg-white p-6"><div className="flex items-center gap-3"><Crosshair className="text-[#6930ca]"/><div><h3 className="font-black">Latest tracking projection</h3><p className="text-xs text-[#7c7085]">Provider-neutral telemetry stored on the delivery job.</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Info label="Last observed" value={dateTime(currentJob.telemetryObservedAt || currentJob.lastStatusObservedAt)} icon={Clock3}/>
      <Info label="Pickup ETA window" value={`${dateTime(currentJob.estimatedPickupStartAt)} → ${dateTime(currentJob.estimatedPickupEndAt)}`} icon={Truck}/>
      <Info label="Drop-off ETA window" value={`${dateTime(currentJob.estimatedDropoffStartAt)} → ${dateTime(currentJob.estimatedDropoffEndAt)}`} icon={Route}/>
      <Info label="Courier location" value={currentJob.courierLatitude != null && currentJob.courierLongitude != null ? `${currentJob.courierLatitude.toFixed(5)}, ${currentJob.courierLongitude.toFixed(5)}` : data.exactCourierLocationAllowed ? "Not supplied by provider" : "Restricted for this admin role"} icon={MapPin}/>
    </div>{currentJob.trackingUrl && <a href={currentJob.trackingUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#f1eafb] px-4 py-2 text-xs font-black text-[#6930ca]">Open provider tracking <ArrowRight size={14}/></a>}</section>}

    <section className="rounded-[28px] border border-[#e6deec] bg-white p-6"><h3 className="text-lg font-black">Why this provider was selected</h3><p className="mt-1 text-xs text-[#7c7085]">Persisted candidate audit. No score is reconstructed in the browser.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[930px] text-left text-xs"><thead className="text-[9px] font-black uppercase tracking-[.12em] text-[#94889c]"><tr><th className="pb-3">Rank</th><th>Provider</th><th>ETA</th><th>Quote</th><th>Predicted success</th><th>Quality</th><th>Proximity</th><th>Final</th><th>Momentum</th><th>Result</th></tr></thead><tbody>{data.candidates.map(c => <tr key={c.candidateId} className={`border-t border-[#eee8f2] ${c.candidateId === data.assignment?.selectedCandidateId ? "bg-emerald-50/50" : ""}`}><td className="py-3 font-black">#{c.rank}</td><td className="font-black">{c.providerId}</td><td>{c.pickupEtaMinutes == null ? "—" : `${c.pickupEtaMinutes.toFixed(1)}m`}</td><td>{money(c.quotedCost,c.currency)}</td><td>{(c.predictedSuccessProbability*100).toFixed(1)}%</td><td>{c.providerQualityScore.toFixed(1)}</td><td>{c.proximityScore.toFixed(1)}</td><td className="font-black text-[#6930ca]">{c.finalScore.toFixed(1)}</td><td>{c.momentum}</td><td><Status value={c.status}/></td></tr>)}</tbody></table></div></section>

    <section className="rounded-[28px] border border-[#e6deec] bg-white p-6"><h3 className="text-lg font-black">Lifecycle timeline</h3><p className="mt-1 text-xs text-[#7c7085]">Newest first across Craves commands, normalized provider events and final outcomes.</p><div className="mt-5 space-y-0">{timeline.map((item,index) => <div key={`${item.at}-${item.type}-${index}`} className="grid grid-cols-[18px_1fr] gap-3"><div className="flex flex-col items-center"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${statusTone(item.status).includes('rose') ? 'bg-rose-500' : statusTone(item.status).includes('amber') ? 'bg-amber-500' : 'bg-[#6930ca]'}`}/>{index < timeline.length-1 && <span className="min-h-12 w-px flex-1 bg-[#e5ddec]"/>}</div><div className="pb-5"><div className="flex flex-wrap items-center gap-2"><b className="text-xs">{item.type}</b><Status value={item.status}/><span className="text-[10px] text-[#94889c]">{dateTime(item.at)}</span></div><p className="mt-1 text-xs text-[#71677d]">{item.detail}</p></div></div>)}</div></section>
  </div>;
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock3 }) { return <div className="rounded-2xl border border-[#eee8f2] bg-[#fbfafd] p-4"><div className="flex items-center gap-2 text-[#6930ca]"><Icon size={15}/><span className="text-[9px] font-black uppercase tracking-[.12em]">{label}</span></div><p className="mt-3 text-xs font-bold leading-5 text-[#4d4057]">{value}</p></div>; }

export function AdminDeliveryIntelligence() {
  const [windowHours, setWindowHours] = useState(168);
  const [summary, setSummary] = useState<DeliverySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [investigation, setInvestigation] = useState<DeliveryInvestigation | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [investigating, setInvestigating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/delivery-intelligence/summary?windowHours=${windowHours}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.code || "Delivery intelligence is unavailable.");
      setSummary(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Delivery intelligence is unavailable."); }
    finally { setLoading(false); }
  }, [windowHours]);

  useEffect(() => { void load(); }, [load]);

  async function investigate(target = orderId) {
    if (!target || reason.trim().length < 10) { setError("Enter an order UUID and an investigation reason of at least 10 characters."); return; }
    setInvestigating(true); setError(""); setOrderId(target);
    try {
      const response = await fetch("/api/admin/delivery-intelligence/investigate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: target, reason: reason.trim() })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.code || "Investigation failed.");
      setCorrelationId(body.correlationId || response.headers.get("X-Correlation-ID"));
      const { correlationId: _correlationId, ...data } = body;
      void _correlationId;
      setInvestigation(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Investigation failed."); }
    finally { setInvestigating(false); }
  }

  return <div className="pb-12">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.17em] text-[#6930ca]"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Delivery engine observability</div><h1 className="mt-2 text-3xl font-black tracking-tight text-[#251b35] sm:text-4xl">Delivery Intelligence</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#71677d]">See what Craves selected, why it selected it, what providers returned, how fallback behaved and what the tracker is observing now — without changing an order.</p></div><div className="flex flex-wrap gap-2"><select value={windowHours} onChange={e => setWindowHours(Number(e.target.value))} className="rounded-xl border border-[#ded4e7] bg-white px-3 py-2.5 text-xs font-black">{windows.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}</select><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#251b35] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/>Refresh</button></div></div>

    <section className="mb-5 rounded-[26px] border border-[#dccfea] bg-gradient-to-r from-[#fff] via-[#fbf8fe] to-[#f3ebfc] p-5"><div className="flex flex-col gap-3 xl:flex-row xl:items-end"><label className="flex-1"><span className="mb-2 block text-[10px] font-black uppercase tracking-[.13em] text-[#73637f]">Order UUID</span><div className="flex items-center gap-2 rounded-xl border border-[#ded4e7] bg-white px-3"><Search size={16} className="text-[#6930ca]"/><input value={orderId} onChange={e => setOrderId(e.target.value.trim())} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="w-full bg-transparent py-3 font-mono text-xs outline-none"/></div></label><label className="flex-[1.2]"><span className="mb-2 block text-[10px] font-black uppercase tracking-[.13em] text-[#73637f]">Investigation reason · audited</span><input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="e.g. Checking unexpected fallback for customer support case" className="w-full rounded-xl border border-[#ded4e7] bg-white px-3 py-3 text-xs outline-none focus:border-[#9f7bd2]"/></label><button onClick={() => void investigate()} disabled={investigating} className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-[#6930ca] px-5 text-xs font-black text-white shadow-lg shadow-[#6930ca]/20 disabled:opacity-50"><ShieldCheck size={15}/>{investigating ? "Investigating…" : "Investigate order"}</button></div></section>

    {error && <div role="alert" className="mb-5 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700"><AlertTriangle size={18}/>{error}</div>}
    {investigation ? <InvestigationView data={investigation} correlationId={correlationId}/> : loading && !summary ? <div className="grid min-h-80 place-items-center rounded-[28px] border border-[#e6deec] bg-white"><div className="text-center"><RefreshCw className="mx-auto animate-spin text-[#6930ca]"/><p className="mt-3 text-sm font-bold text-[#71677d]">Loading delivery intelligence…</p></div></div> : summary ? <Overview summary={summary} onInvestigate={(id) => { setOrderId(id); if (reason.trim().length >= 10) void investigate(id); else document.querySelector<HTMLInputElement>('input[placeholder^="e.g."]')?.focus(); }}/>: null}
  </div>;
}
