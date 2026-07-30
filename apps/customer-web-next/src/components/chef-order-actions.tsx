"use client";

import { useState } from "react";
import type { ChefOrder } from "@/lib/chef-order-contract";

export function ChefOrderActions({ order, onUpdated }: { order: ChefOrder; onUpdated(order: ChefOrder): void }) {
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(order.prepTimeMinutes ? String(order.prepTimeMinutes) : "30");
  const [note, setNote] = useState(order.chefResponseNote ?? "");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(path: string, body?: Record<string, unknown>) {
    setBusy(true); setMessage("Submitting chef action…");
    try {
      const response = await fetch(`/api/chef/orders/${order.id}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 409 ? "The order state changed or the action window is no longer valid. Refresh the order." : "The chef action could not be completed.");
      onUpdated(result as ChefOrder);
      setMessage("Chef action applied by Order Service.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The chef action could not be completed."); }
    finally { setBusy(false); }
  }

  if (order.status === "CHEF_ACCEPTANCE_PENDING") {
    return <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950"><h2 className="text-2xl font-bold">Acceptance decision</h2><p className="mt-2 text-sm text-slate-600">The backend acceptance deadline and current state remain authoritative.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">Preparation time in minutes<input inputMode="numeric" value={prepTimeMinutes} onChange={event => setPrepTimeMinutes(event.target.value)} className="mt-2 w-full rounded-2xl border bg-white px-4 py-3" /></label><label className="text-sm font-semibold">Chef note<input value={note} maxLength={500} onChange={event => setNote(event.target.value)} className="mt-2 w-full rounded-2xl border bg-white px-4 py-3" /></label></div><label className="mt-4 block text-sm font-semibold">Optional rejection reason<input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} className="mt-2 w-full rounded-2xl border bg-white px-4 py-3" /></label><div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} onClick={() => void act("accept", { prepTimeMinutes: Number(prepTimeMinutes), note: note || null, actionId: crypto.randomUUID() })} className="rounded-full bg-[#6930CA] px-6 py-3 font-bold text-white disabled:opacity-50">Accept order</button><button disabled={busy} onClick={() => void act("reject", { reason: reason || null, actionId: crypto.randomUUID() })} className="rounded-full border border-red-600 px-6 py-3 font-bold text-red-700 disabled:opacity-50">Reject order</button></div><p role="status" className="mt-4 text-sm text-slate-600">{message}</p></section>;
  }

  if (order.status === "CHEF_ACCEPTED" || order.status === "PREPARING") {
    return <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950"><h2 className="text-2xl font-bold">Preparation workflow</h2><p className="mt-2 text-sm text-slate-600">Use this only when the complete order is packed and ready for the delivery pickup flow.</p><button disabled={busy} onClick={() => void act("ready-for-pickup")} className="mt-5 rounded-full bg-[#6930CA] px-6 py-3 font-bold text-white disabled:opacity-50">Mark ready for pickup</button><p role="status" className="mt-4 text-sm text-slate-600">{message}</p></section>;
  }

  return <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950"><h2 className="text-2xl font-bold">Order workflow</h2><p className="mt-2 text-sm text-slate-600">No chef action is available for the current backend status.</p></section>;
}
