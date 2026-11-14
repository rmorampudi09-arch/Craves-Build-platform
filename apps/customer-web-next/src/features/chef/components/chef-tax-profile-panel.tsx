"use client";

import { useState } from "react";
import { z } from "zod";
import { sourceStatusSchema } from "@/features/admin/finance/lib/finance-source-contract";
const button = "rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40";

export function ChefTaxProfilePanel() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<z.infer<typeof sourceStatusSchema> | null>(null);
  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/finance/source-status", {cache: "no-store"});
      if (!response.ok) throw new Error("The check couldn’t run. Try again.");
      setStatus(sourceStatusSchema.parse(await response.json()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The check couldn’t run. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return <section className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <h2 className="text-xl font-semibold">Chefs and tax approval</h2>
    <p className="text-sm text-slate-600">A chef can start selling as soon as their documents are approved, in every state. No separate tax approval is needed, for new chefs or for chefs already approved.</p>
    <p className="text-sm text-slate-600">The GST, service fees and deductions set above still apply to every order. Bank checks and payouts are handled on their own.</p>
    <div className="border-t pt-5"><h3 className="font-semibold">Is order money being recorded?</h3>
      <button type="button" className={`${button} mt-3`} disabled={busy} onClick={() => void refresh()}>Check now</button>
      {message && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
      {status && <div className="mt-4 space-y-2 text-sm"><p>Recording is {status.finalizationEnabled ? "running" : "switched off"}. Customer payments recorded: {status.capturedCheckouts}. Chef earnings recorded: {status.postedEarnings}.</p><p>{status.activationNotice}</p>{status.states.map(row => <p key={`${row.state}/${row.lastResult}`}>{row.count} {row.count === 1 ? "order" : "orders"}: {`${row.state}, ${row.lastResult}`.replaceAll("_", " ").toLowerCase()}</p>)}{status.exceptions.map((row, index) => <p key={`${row.chefOrderId}/${index}`} className="break-all text-red-800">Order {row.chefOrderId}: {row.reason}</p>)}</div>}
    </div>
  </section>;
}
