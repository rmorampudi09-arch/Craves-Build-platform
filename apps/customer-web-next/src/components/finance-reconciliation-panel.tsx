"use client";

import { useState } from "react";
import { z } from "zod";
import { payoutReconcileRequestSchema, payoutReconcileResponseSchema } from "@/lib/finance-reconciliation-contract";

export function FinanceReconciliationPanel() {
  const [instructionId, setInstructionId] = useState("");
  const [providerPayoutId, setProviderPayoutId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const valid = z.string().uuid().safeParse(instructionId).success && payoutReconcileRequestSchema.safeParse({providerPayoutId, reason}).success;
  async function reconcile() {
    if (busy || !valid) return;
    setBusy(true);setMessage("");
    try {
      const response = await fetch(`/api/admin/finance/payouts/${instructionId}/reconcile`, {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({providerPayoutId, reason}),
      });
      if (!response.ok) throw new Error("Reconciliation was not confirmed. Verify the original payout ID and wait for any active worker to finish. Do not create a replacement transfer.");
      const result = payoutReconcileResponseSchema.parse(await response.json());
      if (result.instructionId !== instructionId) throw new Error("Reconciliation response did not match the selected instruction.");
      setMessage(`${result.status}: ${result.notice}`);
    } catch (error) {setMessage(error instanceof Error ? error.message : "Reconciliation unavailable; original funds remain protected.");}
    finally {setBusy(false);}
  }
  const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950";
  return <section className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <h2 className="text-xl font-semibold">Recover an existing payout</h2>
    <p className="text-sm text-slate-600">Use the original RazorpayX payout ID from verified provider evidence. This action fetches its status; it never creates a new transfer. A confirmed reversal creates a linked correction and keeps the chef on hold before any replacement payout.</p>
    <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Craves instruction UUID<input className={input} value={instructionId} onChange={event => setInstructionId(event.target.value.trim())} /></label>
      <label className="text-sm font-medium">Existing RazorpayX payout ID<input className={input} value={providerPayoutId} onChange={event => setProviderPayoutId(event.target.value.trim())} placeholder="pout_…" /></label></div>
    <label className="block text-sm font-medium">Reason and verification evidence<textarea className={input} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
    <button type="button" disabled={busy || !valid} onClick={() => void reconcile()} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40">Fetch and reconcile original payout</button>
    {message && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
  </section>;
}
