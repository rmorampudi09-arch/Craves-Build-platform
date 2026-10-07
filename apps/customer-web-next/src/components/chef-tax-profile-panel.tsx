"use client";

import { useState } from "react";
import { z } from "zod";
import { sourceStatusSchema } from "@/lib/finance-source-contract";
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
      if (!response.ok) throw new Error("Source status is unavailable. Please retry.");
      setStatus(sourceStatusSchema.parse(await response.json()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Finance status could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  return <section className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <h2 className="text-xl font-semibold">Chef publishing approval</h2>
    <p className="text-sm text-slate-600">Approving a chef after document review automatically enables publishing in every state. Existing and newly approved chefs do not need a separate tax-profile approval.</p>
    <p className="text-sm text-slate-600">The configured GST, service fees and deductions continue to apply. Bank verification and settlement controls remain available separately.</p>
    <div className="border-t pt-5"><h3 className="font-semibold">Order-to-ledger runtime evidence</h3>
      <button type="button" className={`${button} mt-3`} disabled={busy} onClick={() => void refresh()}>Refresh source counters</button>
      {message && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
      {status && <div className="mt-4 space-y-2 text-sm"><p>Finalization worker: {status.finalizationEnabled ? "enabled" : "disabled"}. Captured checkouts: {status.capturedCheckouts}. Posted chef earnings: {status.postedEarnings}.</p><p>{status.activationNotice}</p>{status.states.map(row => <p key={`${row.state}/${row.lastResult}`}>{row.state} · {row.lastResult} · {row.count}</p>)}{status.exceptions.map((row, index) => <p key={`${row.chefOrderId}/${index}`} className="break-all text-red-800">{row.chefOrderId}: {row.reason}</p>)}</div>}
    </div>
  </section>;
}
