"use client";

import { useState } from "react";
import { z } from "zod";
import { payoutReconcileRequestSchema, payoutReconcileResponseSchema } from "@/features/admin/finance/lib/finance-reconciliation-contract";
import { statusOf } from "@/features/admin/finance/lib/insights-contract";

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
      if (!response.ok) throw new Error("The check didn’t finish. Make sure the RazorpayX ID is the original one and try again in a few minutes. Do not send the money again.");
      const result = payoutReconcileResponseSchema.parse(await response.json());
      if (result.instructionId !== instructionId) throw new Error("The answer was for a different payout, so nothing was changed.");
      setMessage(`${statusOf("CHEF_PAYOUT", result.status).label}. ${result.notice}`);
    } catch (error) {setMessage(error instanceof Error ? error.message : "The check couldn’t run. Nothing was changed and the money stays set aside.");}
    finally {setBusy(false);}
  }
  const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950";
  return <section className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <h2 className="text-xl font-semibold">Check a RazorpayX payout that got stuck</h2>
    <p className="text-sm text-slate-600">For an automatic payout whose outcome isn’t known. Enter the payout’s own RazorpayX ID and this asks RazorpayX what happened to it. It never sends money again. If the bank returned the money, the books are corrected and the chef stays on hold until a new payout is decided.</p>
    <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Payout ID, from the payout’s money trail<input className={input} value={instructionId} onChange={event => setInstructionId(event.target.value.trim())} /></label>
      <label className="text-sm font-medium">RazorpayX payout ID<input className={input} value={providerPayoutId} onChange={event => setProviderPayoutId(event.target.value.trim())} placeholder="pout_…" /></label></div>
    <label className="block text-sm font-medium">Why this is being checked, and where the proof is<textarea className={input} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
    <button type="button" disabled={busy || !valid} onClick={() => void reconcile()} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40">Ask RazorpayX what happened</button>
    {message && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
  </section>;
}
