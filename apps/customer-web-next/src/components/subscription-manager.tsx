"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CustomerSubscription } from "@/lib/subscription-contract";

const ACTIONABLE = new Set(["ACTIVE", "PENDING_PAYMENT", "PAYMENT_FAILED"]);

export function SubscriptionManager() {
  const [items, setItems] = useState<CustomerSubscription[]>([]);
  const [message, setMessage] = useState("Loading subscriptions…");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/subscriptions", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.status === 401) throw new Error("Your session expired. Sign in again.");
    if (!response.ok) throw new Error("Subscriptions are temporarily unavailable.");
    const subscriptions = body as CustomerSubscription[];
    setItems(subscriptions);
    setMessage(subscriptions.length ? "" : "You do not have a meal subscription yet.");
  }, []);

  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "Subscriptions are unavailable.")); }, [load]);

  async function change(subscriptionId: string, action: "pause" | "cancel") {
    const reason = window.prompt(action === "pause" ? "Optional pause reason" : "Optional cancellation reason") ?? "";
    setBusyId(subscriptionId);
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}/${action}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason || null }) });
      if (!response.ok) throw new Error(`${action === "pause" ? "Pause" : "Cancellation"} could not be completed.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Subscription update failed.");
    } finally { setBusyId(null); }
  }

  return <section>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Link href="/subscriptions/plans" className="rounded-2xl bg-[#6930CA] px-5 py-3 font-bold text-white">Browse plans</Link><button type="button" onClick={() => void load()} className="rounded-2xl border border-white/20 px-5 py-3 font-bold text-white">Refresh</button></div>
    {message && <div className="rounded-[24px] bg-[#FFF8EC] p-6 text-slate-950" role="status">{message}</div>}
    <div className="space-y-5">
      {items.map(item => <article key={item.id} className="rounded-[28px] bg-[#FFF8EC] p-6 text-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">{item.status.replaceAll("_", " ")}</p><h2 className="mt-2 text-2xl font-bold">Meal subscription</h2><p className="mt-2 text-sm text-slate-600">Starts {new Date(`${item.startDate}T00:00:00Z`).toLocaleDateString("en-IN")}</p></div><Link href={`/subscriptions/${item.id}`} className="text-sm font-bold text-[#6930CA]">View details</Link></div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Next service date</dt><dd className="font-semibold">{item.nextServiceDate ?? "Not scheduled"}</dd></div><div><dt className="text-slate-500">Delivery address</dt><dd className="font-semibold">{item.deliveryAddressId ? "Saved address selected" : "Not selected"}</dd></div></dl>
        {ACTIONABLE.has(item.status) && <div className="mt-5 flex flex-wrap gap-3"><button disabled={busyId === item.id} onClick={() => void change(item.id, "pause")} className="rounded-2xl border border-[#6930CA] px-4 py-2 font-bold text-[#6930CA] disabled:opacity-50">Pause</button><button disabled={busyId === item.id} onClick={() => void change(item.id, "cancel")} className="rounded-2xl border border-red-600 px-4 py-2 font-bold text-red-700 disabled:opacity-50">Cancel</button></div>}
      </article>)}
    </div>
  </section>;
}
