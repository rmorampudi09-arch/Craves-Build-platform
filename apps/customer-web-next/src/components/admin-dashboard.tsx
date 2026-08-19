"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, BellRing, CheckCircle2, ChefHat, Clock3, PackageCheck, RefreshCw,
  RotateCcw, Search, SearchCheck, ShieldCheck, Truck
} from "lucide-react";
import { parseAdminDashboardSummary, type AdminDashboardSummary } from "@/lib/admin-dashboard-contract";

const Visuals = dynamic(() => import("@/components/admin-dashboard-visuals").then(module => module.AdminDashboardVisuals), {
  ssr: false,
  loading: () => <div className="h-[390px] animate-pulse rounded-[28px] bg-white" />
});

const statusLabel = (status: string) => status.toLowerCase().replaceAll("_", " ").replace(/^./, value => value.toUpperCase());

export function AdminDashboard() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [message, setMessage] = useState("Loading live operational data…");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/dashboard/summary", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 403 ? "Administrator access is required." : "Live dashboard data is temporarily unavailable.");
      const parsed = parseAdminDashboardSummary(body);
      if (!parsed) throw new Error("The dashboard received an invalid backend response.");
      setSummary(parsed);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Live dashboard data is unavailable.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!summary) return <section className="rounded-[28px] border border-[#ebe5ef] bg-white p-8 shadow-sm"><div className="h-2 w-24 rounded bg-[#f6b545]" /><h1 className="mt-6 text-3xl font-black">Operations control center</h1><p className="mt-3 text-[#766981]" role="status">{message}</p><button onClick={() => void load()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#6930ca] px-4 py-3 text-sm font-black text-white"><RefreshCw size={17} />Try again</button></section>;

  const metrics = summary.metrics;
  const cards = [
    { label: "Orders created", value: metrics.ordersCreated24h, note: "Last 24 hours", icon: PackageCheck, tone: "bg-[#efe8ff] text-[#6930ca]" },
    { label: "Awaiting chef", value: metrics.chefAcceptancePending, note: "Current queue", icon: Clock3, tone: "bg-[#fff3d8] text-[#a86400]" },
    { label: "Preparing", value: metrics.preparing, note: "Current orders", icon: ChefHat, tone: "bg-[#ffe9e2] text-[#bd4b2d]" },
    { label: "Out for delivery", value: metrics.outForDelivery, note: "Current orders", icon: Truck, tone: "bg-[#e5f5ff] text-[#126a9a]" },
    { label: "Delivered", value: metrics.delivered24h, note: "Updated in 24 hours", icon: CheckCircle2, tone: "bg-[#e5f7ec] text-[#24784b]" },
    { label: "Refund attention", value: metrics.refundPending + metrics.refundFailed, note: `${metrics.refundFailed} failed`, icon: RotateCcw, tone: "bg-[#ffe7ea] text-[#a72c3c]" }
  ];

  const workbench = [
    { label: "Find customer or chef", note: "Mobile, email, UUID or exact name", href: "/admin/search", icon: Search, accent: "bg-[#6930ca] text-white" },
    { label: "Investigate order / payment", note: "Read-only evidence with audit reason", href: "/admin/operations", icon: SearchCheck, accent: "bg-[#0b1426] text-white" },
    { label: "Review chef applications", note: "Review onboarding evidence and recorded decisions", href: "/admin/chef-reviews", icon: ChefHat, accent: "bg-[#f6b545] text-[#0b1426]" },
    { label: "Recover notifications", note: "Inspect failed delivery and recovery controls", href: "/admin/notifications", icon: BellRing, accent: "bg-[#fff8ec] text-[#6930ca]" },
    { label: "Secure an account", note: "Controlled admin security actions", href: "/admin/accounts", icon: ShieldCheck, accent: "bg-[#e9f8ef] text-[#26724a]" }
  ];

  return <div className="space-y-7">
    <section className="overflow-hidden rounded-[32px] bg-[#0b1426] px-6 py-8 text-white shadow-[0_28px_75px_-42px_rgba(11,20,38,0.85)] sm:px-9">
      <div className="flex flex-col justify-between gap-7 xl:flex-row xl:items-end"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#f6b545]">Operations control center</p><h1 className="mt-3 max-w-4xl text-3xl font-black sm:text-4xl">Find the case. Understand the timeline. Take the right action.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Start with a customer, chef or operational reference and move across the live modules without losing context. The overview below uses only currently exposed backend metrics.</p></div><div className="flex flex-wrap gap-3"><Link href="/admin/search" className="inline-flex items-center gap-2 rounded-xl bg-[#f6b545] px-4 py-3 text-sm font-black text-[#0b1426]"><Search size={17}/>Global search</Link><button onClick={() => void load()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-black ring-1 ring-white/15 transition hover:bg-white/15 disabled:opacity-60"><RefreshCw size={17} className={refreshing ? "animate-spin" : ""}/>Refresh</button></div></div>
    </section>

    {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900" role="status">{message} Showing the last successfully loaded snapshot.</div>}

    <section><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b7b97]">Live workload</p><h2 className="mt-1 text-xl font-black">What needs attention now</h2></div><p className="hidden text-xs text-[#8a7c95] sm:block">Snapshot {new Date(summary.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map(card => { const Icon = card.icon; return <article key={card.label} className="rounded-[24px] border border-[#ebe5ef] bg-white p-5 shadow-[0_16px_45px_-38px_rgba(58,38,73,0.55)]"><div className={`grid h-11 w-11 place-items-center rounded-2xl ${card.tone}`}><Icon size={21}/></div><p className="mt-5 text-3xl font-black tabular-nums">{card.value.toLocaleString("en-IN")}</p><p className="mt-1 text-sm font-black">{card.label}</p><p className="mt-1 text-xs text-[#897b94]">{card.note}</p></article>; })}
    </div></section>

    <section className="rounded-[28px] border border-[#e7dfec] bg-[#fff8ec] p-5 sm:p-6"><div className="mb-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#9a7444]">Operator workbench</p><h2 className="mt-1 text-xl font-black">Common admin journeys in one click</h2></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{workbench.map(item => { const Icon=item.icon; return <Link key={item.label} href={item.href} className="group rounded-[22px] border border-black/5 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg"><div className={`grid h-10 w-10 place-items-center rounded-xl ${item.accent}`}><Icon size={18}/></div><p className="mt-4 text-sm font-black">{item.label}</p><p className="mt-1 min-h-8 text-xs leading-4 text-[#817487]">{item.note}</p><div className="mt-3 flex items-center gap-1 text-xs font-black text-[#6930ca]">Open<ArrowRight size={13} className="transition group-hover:translate-x-1"/></div></Link>; })}</div></section>

    <Visuals summary={summary}/>

    <section className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
      <article className="rounded-[28px] border border-[#ebe5ef] bg-white p-6 sm:p-7"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b7b97]">Current flow</p><h2 className="mt-2 text-xl font-black">Operational stage counts</h2><div className="mt-6 space-y-3">{summary.statusCounts.map(item => <div key={item.status} className="flex items-center justify-between rounded-2xl bg-[#f8f6fa] px-4 py-3"><span className="text-sm font-bold text-[#62566d]">{statusLabel(item.status)}</span><strong className="rounded-lg bg-white px-3 py-1 text-sm tabular-nums shadow-sm">{item.count.toLocaleString("en-IN")}</strong></div>)}</div></article>
      <article className="rounded-[28px] bg-[#0b1426] p-6 text-white sm:p-7"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#f6b545]">Admin operating principle</p><h2 className="mt-2 text-xl font-black">Fast to navigate, hard to misuse.</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{[
        ["People lookup", "Search returns minimal masked matches before opening a full audited case."],
        ["Operational evidence", "Order, payment, refund and delivery lookups remain read-only and reason-gated."],
        ["Mutating actions", "Approval, account and recovery actions stay inside their owning backend service."],
        ["Commercial rules", "Pricing, commission, refund eligibility and compliance policy are not invented by the dashboard."]
      ].map(([title, note]) => <div key={title} className="rounded-2xl bg-white/6 p-4 ring-1 ring-white/10"><p className="text-sm font-black">{title}</p><p className="mt-1 text-xs leading-5 text-slate-300">{note}</p></div>)}</div></article>
    </section>
  </div>;
}
